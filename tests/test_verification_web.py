import base64
import hashlib
import json
import struct
import threading
import zlib
import subprocess
from urllib.error import HTTPError

import numpy as np
import pytest

from lut_builder.web import create_server
from lut_builder.verification import decode_still
from test_web import _request
from test_verification import INTERPRETATION


@pytest.fixture
def workspace():
    server, url, token = create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield url, token
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def still_payload(request_id="still-1"):
    # PFM is bottom-up; values use more precision than 8/16-bit integer images.
    raw = b"PF\n2 1\n-1.0\n" + struct.pack(
        "<6f", -0.125, 0.375001, 1.125, 0.5, 0.5, 0.5
    )
    return {
        "request_id": request_id,
        "source": {"name": "camera.pfm", "data": base64.b64encode(raw).decode()},
        "interpretation": INTERPRETATION,
        "setup": {
            "cube_size": 17,
            "bands": [{"stop": 0, "width": 100, "color": "#804020"}],
        },
    }


def test_still_upload_pixel_inspection_and_checked_cube(workspace):
    url, token = workspace
    with _request(url + "verify", token=token, payload=still_payload()) as response:
        result = json.load(response)
    assert result["request_id"] == "still-1"
    assert (result["width"], result["height"]) == (2, 1)
    assert result["image"].startswith("data:image/png;base64,")
    assert result["provenance"]["source"]["storage"] == "float32 RGB PFM"
    with _request(
        url + "verify-pixel",
        token=token,
        payload={"request_id": "still-1", "x": 0, "y": 0},
    ) as response:
        pixel = json.load(response)
    assert pixel["source_rgb"][0] == -0.125
    assert pixel["source_rgb"][2] == 1.125
    assert pixel["source_rgb"][1] == float(np.float32(0.375001))
    np.testing.assert_allclose(
        pixel["output_rgb"], [128 / 255, 64 / 255, 32 / 255], atol=4e-8, rtol=0
    )
    with _request(
        url + "verify-cube", token=token, payload={"request_id": "still-1"}
    ) as response:
        cube = response.read()
    assert hashlib.sha256(cube).hexdigest() == result["provenance"]["cube_sha256"]


def png16(pixels, *, depth=16, color_type=2, interlace=0, tag=None):
    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data))
        )

    h, w, _ = pixels.shape
    data = b"".join(b"\0" + row.astype(">u2").tobytes() for row in pixels)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(
            b"IHDR", struct.pack(">IIBBBBB", w, h, depth, color_type, 0, 0, interlace)
        )
        + (chunk(tag, b"\0") if tag else b"")
        + chunk(b"IDAT", zlib.compress(data))
        + chunk(b"IEND", b"")
    )


def test_png_decoder_preserves_every_uint16_code_and_rgb_order():
    values = np.arange(65536, dtype=np.uint16).reshape(256, 256)
    pixels = np.stack([values, values.T, 65535 - values], axis=-1)
    rgb, facts = decode_still(png16(pixels))
    # Exhaustive uint16 codes: catches 8-bit intermediates, range expansion, row/plane reversal.
    np.testing.assert_array_equal(np.rint(rgb * 65535).astype(np.uint16), pixels)
    assert facts["storage"] == "uint16 RGB PNG"


def test_png16_can_be_verified_and_inspected_through_http(workspace, tmp_path):
    url, token = workspace
    pixels = np.array([[[1, 32769, 65534]], [[32767, 65535, 0]]], dtype=np.uint16)
    payload = still_payload()
    fixture = tmp_path / "camera-16bit.png"
    fixture.write_bytes(png16(pixels))
    print(f"Browser fixture: {fixture}")
    payload["source"] = {
        "name": "untagged-camera.png",
        "data": base64.b64encode(png16(pixels)).decode(),
    }
    with _request(url + "verify", token=token, payload=payload) as response:
        result = json.load(response)
    assert result["provenance"]["source"]["storage"] == "uint16 RGB PNG"
    with _request(
        url + "verify-pixel",
        token=token,
        payload={"request_id": "still-1", "x": 0, "y": 1},
    ) as response:
        pixel = json.load(response)
    np.testing.assert_array_equal(pixel["source_rgb"], [32767 / 65535, 1, 0])
    # Decode the delivered display PNG through an independent image implementation.
    display = base64.b64decode(result["image"].split(",")[1])
    decoded = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "image2pipe",
            "-i",
            "pipe:0",
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ],
        input=display,
        capture_output=True,
        check=True,
    )
    actual = np.frombuffer(decoded.stdout, np.uint8).reshape(2, 1, 3)
    # Direct BT.1886 -> sRGB of the constant #804020 overlay, rounded only for display.
    # In this segment the powers cancel: round(1.055 * [128,64,32] - 0.055*255).
    np.testing.assert_array_equal(actual, [[[121, 53, 20]], [[121, 53, 20]]])


@pytest.mark.parametrize(
    "data,match",
    [
        (b"JPEG image", "Unsupported still"),
        (b"PF\n1 1\n-1\n", "truncated"),
        (b"PF\n999999 999999\n-1\n", "dimensions"),
        (b"PF\n1 1\n0.5\n" + bytes(12), "scale"),
        (b"PF\n1 1\n-1\n" + struct.pack("<3f", float("nan"), 0, 0), "NaN"),
        (png16(np.zeros((1, 1, 3)), depth=8), "16-bit"),
        (png16(np.zeros((1, 1, 3)), color_type=6), "alpha"),
        (png16(np.zeros((1, 1, 3)), interlace=1), "interlaced"),
        *[
            (png16(np.zeros((1, 1, 3)), tag=tag), "Color-tagged")
            for tag in [b"iCCP", b"sRGB", b"gAMA", b"cHRM", b"cICP"]
        ],
    ],
)
def test_unsupported_and_corrupt_stills_fail_without_demo_fallback(
    workspace, data, match
):
    url, token = workspace
    payload = still_payload()
    payload["source"]["data"] = base64.b64encode(data).decode()
    with pytest.raises(HTTPError) as failure:
        _request(url + "verify", token=token, payload=payload)
    assert failure.value.code == 400
    body = json.load(failure.value)
    assert match in body["error"]
    assert "image" not in body


def test_cancelled_and_replaced_results_cannot_be_inspected(workspace):
    url, token = workspace
    with _request(
        url + "verify-cancel", token=token, payload={"request_id": "before-start"}
    ):
        pass
    with pytest.raises(HTTPError) as failure:
        _request(url + "verify", token=token, payload=still_payload("before-start"))
    assert "cancelled" in json.load(failure.value)["error"]
    with _request(url + "verify", token=token, payload=still_payload("first")):
        pass
    with _request(url + "verify", token=token, payload=still_payload("second")):
        pass
    for payload in [
        {"request_id": "first", "x": 0, "y": 0},
        {"request_id": "second", "x": 2, "y": 0},
        {"request_id": "second", "x": True, "y": 0},
    ]:
        with pytest.raises(HTTPError) as failure:
            _request(url + "verify-pixel", token=token, payload=payload)
        assert failure.value.code == 400
    with _request(url + "verify-cancel", token=token, payload={"request_id": "second"}):
        pass
    with pytest.raises(HTTPError):
        _request(url + "verify-cube", token=token, payload={"request_id": "second"})


def test_missing_png_decoder_is_actionable(workspace, monkeypatch):
    url, token = workspace
    monkeypatch.setenv("PATH", "")
    payload = still_payload()
    payload["source"]["data"] = base64.b64encode(png16(np.zeros((1, 1, 3)))).decode()
    with pytest.raises(HTTPError) as failure:
        _request(url + "verify", token=token, payload=payload)
    assert "FFmpeg on PATH" in json.load(failure.value)["error"]


def test_busy_and_inflight_cancel_at_decoder_process_boundary(workspace, monkeypatch):
    url, token = workspace
    entered, release = threading.Event(), threading.Event()

    def decoder(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return subprocess.CompletedProcess(args, 0, stdout=bytes(6), stderr=b"")

    monkeypatch.setattr(subprocess, "run", decoder)
    payload = still_payload("slow")
    payload["source"]["data"] = base64.b64encode(png16(np.zeros((1, 1, 3)))).decode()
    failures = []

    def submit():
        try:
            _request(url + "verify", token=token, payload=payload)
        except HTTPError as error:
            failures.append(json.load(error)["error"])

    job = threading.Thread(target=submit)
    job.start()
    try:
        assert entered.wait(5)
        with pytest.raises(HTTPError) as failure:
            _request(url + "verify", token=token, payload=still_payload("other"))
        assert failure.value.code == 409
        with _request(
            url + "verify-cancel", token=token, payload={"request_id": "slow"}
        ):
            pass
    finally:
        release.set()
        job.join(5)
    assert failures == ["Verification cancelled."]
