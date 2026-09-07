"""Encoded media -> confirmed decode -> served cube, pixels and display."""

import base64
import hashlib
import shutil
import subprocess
import threading

import numpy as np
import pytest

from lut_builder.web import create_server
from test_video import call
from test_web import _request
from test_verification import INTERPRETATION, independent_cube


pytestmark = pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
    reason="Real FFmpeg/FFprobe required",
)


@pytest.fixture
def media(tmp_path, request):
    # S-Log3 camera codes: neutral ramp plus chromatic patches and excursions.
    # Lossless FFV1 makes the encoded YCbCr fixture exactly known.
    y = np.tile(np.array([0, 64, 171, 300, 420, 500, 940, 1023], dtype="<u2"), (16, 2))
    cb = np.full((16, 8), 552, dtype="<u2")
    cr = np.full((16, 8), 472, dtype="<u2")
    pixel_format = "yuv422p10le"
    if getattr(request, "param", None) == "spatial":
        pixel_format = "yuv420p10le"
        cb = (384 + 16 * np.arange(8)[None, :] + 8 * np.arange(8)[:, None]).astype(
            "<u2"
        )
        cr = np.full((8, 8), 512, dtype="<u2")
    raw = tmp_path / "camera.raw"
    raw.write_bytes(y.tobytes() + cb.tobytes() + cr.tobytes())
    clip = tmp_path / "camera.mkv"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pixel_format",
            pixel_format,
            "-video_size",
            "16x16",
            "-i",
            str(raw),
            "-frames:v",
            "1",
            "-c:v",
            "ffv1",
            "-vf",
            "setparams=range=limited:colorspace=bt709",
            "-color_range",
            "tv",
            "-colorspace",
            "bt709",
            str(clip),
        ],
        check=True,
        capture_output=True,
    )
    server, url, token = create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        _, opened = call(url, token, "video/start", {})
        status, selected = call(
            url,
            token,
            f"video/upload?source_id={opened['source_id']}",
            clip.read_bytes(),
        )
        assert status == 200, selected
        payload = {
            "request_id": "video-check",
            "source_id": opened["source_id"],
            "frame": selected["frame"],
            "interpretation": {
                **INTERPRETATION,
                "matrix": "bt709",
                "signal_range": "limited",
                "chroma_location": "left",
                "bit_depth": 10,
            },
            "setup": {"cube_size": 17, "bands": []},
        }
        yield server, url, token, payload, y
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.parametrize(
    "matrix,kr,kb", [("bt709", 0.2126, 0.0722), ("bt2020nc", 0.2627, 0.0593)]
)
@pytest.mark.parametrize("signal_range", ["limited", "full"])
def test_confirmed_override_cube_and_display(media, matrix, kr, kb, signal_range):
    server, url, token, payload, y = media
    payload["interpretation"].update(matrix=matrix, signal_range=signal_range)
    session = server.videos.get(payload["source_id"])
    # Verification must not depend on either demonstration artifact.
    (session.root / "demonstration.gbrpf32le").unlink()
    status, result = call(url, token, "verify-video", payload)
    assert status == 200, result
    assert result["provenance"]["source"]["frame"] == payload["frame"]
    assert result["provenance"]["source"]["facts"]["stream"]["color_space"] == "bt709"
    assert result["provenance"]["interpretation"]["matrix"] == matrix
    assert result["provenance"]["interpolation"] == "tetrahedral"
    with _request(
        url + "verify-cube", token=token, payload={"request_id": payload["request_id"]}
    ) as response:
        cube = response.read()
    assert hashlib.sha256(cube).hexdigest() == result["provenance"]["cube_sha256"]
    expected_y = (y.astype(float) - 64) / 876 if signal_range == "limited" else y / 1023
    cb, cr = (
        40 / (896 if signal_range == "limited" else 1023),
        -40 / (896 if signal_range == "limited" else 1023),
    )
    expected = np.stack(
        [
            expected_y + 2 * (1 - kr) * cr,
            expected_y
            - 2 * kb * (1 - kb) / (1 - kr - kb) * cb
            - 2 * kr * (1 - kr) / (1 - kr - kb) * cr,
            expected_y + 2 * (1 - kb) * cb,
        ],
        axis=-1,
    )
    pixels = []
    for x in range(8):
        status, pixel = call(
            url,
            token,
            "verify-pixel",
            {"request_id": payload["request_id"], "x": x, "y": 0},
        )
        assert status == 200, pixel
        np.testing.assert_allclose(
            pixel["source_rgb"], expected[0, x], atol=2e-6, rtol=0
        )
        np.testing.assert_allclose(
            pixel["output_rgb"],
            independent_cube(cube, np.array([pixel["source_rgb"]]))[0],
            atol=1e-12,
            rtol=0,
        )
        pixels.append(pixel)
    assert pixels[0]["source_rgb"][0] < 0
    assert pixels[-1]["source_rgb"][2] > 1
    png = base64.b64decode(result["image"].split(",")[1])
    decoded = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            "pipe:0",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ],
        input=png,
        capture_output=True,
        check=True,
    ).stdout
    # Independent ideal BT.1886 + sRGB equations for Rec.709 full output.
    output = np.clip(np.array([p["output_rgb"] for p in pixels]), 0, 1)
    linear = output**2.4
    display = np.where(
        linear <= 0.0031308, 12.92 * linear, 1.055 * linear ** (1 / 2.4) - 0.055
    )
    np.testing.assert_array_equal(
        np.frombuffer(decoded, dtype=np.uint8).reshape(16, 16, 3)[0, :8],
        np.round(display * 255),
    )
    assert (
        call(url, token, "verify-cancel", {"request_id": payload["request_id"]})[0]
        == 200
    )
    assert (
        call(
            url,
            token,
            "verify-pixel",
            {"request_id": payload["request_id"], "x": 0, "y": 0},
        )[0]
        == 400
    )


@pytest.mark.parametrize("media", ["spatial"], indirect=True)
def test_spatial_chroma_locations_reach_cube_pixels(media):
    _, url, token, payload, y = media
    blue = []
    # Interior bilinear samples on a planar ramp have independently known
    # positions. 4:2:0 center is offset half a luma pixel in both axes;
    # left only vertically, top-left in neither axis.
    for location, cx, cy in [
        ("left", 3, 2.75),
        ("center", 2.75, 2.75),
        ("topleft", 3, 3),
    ]:
        payload["request_id"] = location
        payload["interpretation"]["chroma_location"] = location
        status, result = call(url, token, "verify-video", payload)
        assert status == 200, result
        assert result["provenance"]["interpretation"]["chroma_location"] == location
        status, pixel = call(
            url, token, "verify-pixel", {"request_id": location, "x": 6, "y": 6}
        )
        assert status == 200, pixel
        luminance = (float(y[6, 6]) - 64) / 876
        cb = (384 + 16 * cx + 8 * cy - 512) / 896
        expected = [
            luminance,
            luminance - 2 * 0.0722 * (1 - 0.0722) / 0.7152 * cb,
            luminance + 2 * (1 - 0.0722) * cb,
        ]
        np.testing.assert_allclose(pixel["source_rgb"], expected, atol=2e-6, rtol=0)
        with _request(
            url + "verify-cube", token=token, payload={"request_id": location}
        ) as response:
            cube = response.read()
        np.testing.assert_allclose(
            pixel["output_rgb"],
            independent_cube(cube, np.array([pixel["source_rgb"]]))[0],
            atol=1e-12,
            rtol=0,
        )
        blue.append(pixel["source_rgb"][2])
    assert len(set(blue)) == 3


def test_missing_facts_stale_frame_source_and_cancel(media, monkeypatch):
    server, url, token, payload, _ = media
    for key, value in [
        ("matrix", "unknown"),
        ("signal_range", ""),
        ("chroma_location", ""),
        ("bit_depth", 8),
        ("confirmed", False),
        ("transfer", "V-Log"),
        ("gamut", "V-Gamut"),
    ]:
        invalid = {
            **payload,
            "interpretation": {**payload["interpretation"], key: value},
        }
        assert call(url, token, "verify-video", invalid)[0] == 400
    assert (
        call(
            url,
            token,
            "verify-video",
            {**payload, "frame": {**payload["frame"], "pts": "999"}},
        )[0]
        == 400
    )
    # Cancel at the actual converter process boundary, then allow a fresh check.
    session = server.videos.get(payload["source_id"])
    original = session.run
    entered, resume = threading.Event(), threading.Event()

    def paused(*args, **kwargs):
        entered.set()
        assert resume.wait(5)
        return original(*args, **kwargs)

    monkeypatch.setattr(session, "run", paused)
    replies = []
    worker = threading.Thread(
        target=lambda: replies.append(call(url, token, "verify-video", payload))
    )
    worker.start()
    assert entered.wait(5)
    assert (
        call(url, token, "verify-cancel", {"request_id": payload["request_id"]})[0]
        == 200
    )
    resume.set()
    worker.join(10)
    assert replies[0][0] == 400
    monkeypatch.setattr(session, "run", original)
    payload["request_id"] = "fresh-check"
    assert call(url, token, "verify-video", payload)[0] == 200
    # Even reselecting the same ordinal expires the prior checked artifact.
    assert (
        call(
            url, token, "video/frame", {"source_id": payload["source_id"], "index": 0}
        )[0]
        == 200
    )
    assert (
        call(url, token, "verify-pixel", {"request_id": "fresh-check", "x": 0, "y": 0})[
            0
        ]
        == 400
    )
    payload["request_id"] = "after-frame"
    assert call(url, token, "verify-video", payload)[0] == 200
    assert (
        call(
            url, token, "video/frame", {"source_id": payload["source_id"], "time": "99"}
        )[0]
        == 400
    )
    assert (
        call(url, token, "verify-pixel", {"request_id": "after-frame", "x": 0, "y": 0})[
            0
        ]
        == 400
    )

    def failed_decode(*args, **kwargs):
        raise ValueError("Decoder unavailable for this frame")

    monkeypatch.setattr(session, "run", failed_decode)
    payload["request_id"] = "decode-error"
    status, error = call(url, token, "verify-video", payload)
    assert status == 400 and "Decoder unavailable" in error["error"]
    assert (
        call(
            url, token, "verify-pixel", {"request_id": "decode-error", "x": 0, "y": 0}
        )[0]
        == 400
    )
    monkeypatch.setattr(session, "run", original)
    payload["request_id"] = "before-replace"
    assert call(url, token, "verify-video", payload)[0] == 200
    call(url, token, "video/start", {})
    assert (
        call(
            url, token, "verify-pixel", {"request_id": "before-replace", "x": 0, "y": 0}
        )[0]
        == 400
    )
    assert call(url, token, "verify-video", payload)[0] == 400
