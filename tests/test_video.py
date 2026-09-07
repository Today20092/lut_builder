"""Real decoder and HTTP checks for the selected-frame contract."""

import json
import http.client
from pathlib import Path
import shutil
import subprocess
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

import numpy as np
import pytest

from lut_builder.web import create_server


def call(url, token, path, payload):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    request = Request(
        url + path,
        data=body,
        headers={
            "Content-Type": "application/octet-stream"
            if isinstance(payload, bytes)
            else "application/json",
            "X-LUT-Builder-Token": token,
        },
    )
    try:
        with urlopen(request, timeout=90) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


def make_clip(path: Path):
    # Known presentation times 5.0, 5.1, 5.3, 5.6, with B-frame reordering.
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=32x24:rate=10:duration=0.7",
            "-vf",
            r"select=eq(n\,0)+eq(n\,1)+eq(n\,3)+eq(n\,6),setpts=PTS+5/TB",
            "-fps_mode",
            "passthrough",
            "-c:v",
            "libx264",
            "-bf",
            "2",
            "-color_range",
            "tv",
            "-colorspace",
            "bt709",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


@pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
    reason="Real FFmpeg/FFprobe required",
)
def test_select_vfr_nonzero_pts_adjacent_end_and_cleanup(tmp_path):
    clip = tmp_path / "known.mp4"
    make_clip(clip)
    server, url, token = create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        status, opened = call(url, token, "video/start", {})
        assert status == 200
        source = opened["source_id"]
        status, selected = call(
            url, token, f"video/upload?source_id={source}", clip.read_bytes()
        )
        assert status == 200, selected
        assert selected["frame"]["relative_time"] == "0"
        assert selected["frame"]["pts"] == "51200"
        assert selected["frame"]["time_base"] == "1/10240"
        assert selected["display"].startswith("data:image/png;base64,")
        assert selected["facts"]["stream"]["color_transfer"] is None
        status, selected = call(
            url, token, "video/frame", {"source_id": source, "time": "0.11"}
        )
        assert status == 200, selected
        assert selected["frame"]["index"] == 2
        assert selected["frame"]["relative_time"] == "3/10"
        assert selected["source"]["pixel_format"] == "yuv420p"
        assert selected["source"]["precision_bits"] == 8
        assert selected["provenance"]["lut_applied"] is False
        # Independently decode the whole clip, with no select filter. The selected
        # native pixels must equal the known third sequential output frame.
        sequential = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(clip),
                "-fps_mode",
                "passthrough",
                "-pix_fmt",
                "yuv420p",
                "-f",
                "rawvideo",
                "pipe:1",
            ],
            check=True,
            capture_output=True,
        ).stdout
        session = server.videos.get(source)
        assert (session.root / "source.raw").read_bytes() == sequential[2304:3456]
        for index, time in [(1, "1/10"), (2, "3/10"), (3, "3/5")]:
            status, selected = call(
                url, token, "video/frame", {"source_id": source, "index": index}
            )
            assert status == 200, selected
            assert selected["frame"]["relative_time"] == time
        for time in ["0.60001", "-1", "NaN", "1/0"]:
            status, error = call(
                url, token, "video/frame", {"source_id": source, "time": time}
            )
            assert status == 400, error
        assert call(url, token, "video/cancel", {"source_id": source})[0] == 200
        assert not session.root.exists()
        assert (
            call(url, token, "video/frame", {"source_id": source, "index": 0})[0] == 400
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
    reason="Real FFmpeg/FFprobe required",
)
@pytest.mark.parametrize("signal_range", ["tv", "pc"])
def test_native_ten_bit_excursions_survive_and_demo_is_separate(tmp_path, signal_range):
    # Planar 4:2:2, neutral superblack and superwhite. No quantization tolerance
    # for the retained FFV1 source; float conversion tolerance is 2e-6.
    y = np.full((16, 16), 1023, dtype="<u2")
    y[:, :8] = 0
    native = y.tobytes() + np.full((2, 16, 8), 512, dtype="<u2").tobytes()
    raw_path = tmp_path / "patch.raw"
    raw_path.write_bytes(native)
    clip = tmp_path / "patch.mkv"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pixel_format",
            "yuv422p10le",
            "-video_size",
            "16x16",
            "-color_range",
            signal_range,
            "-i",
            str(raw_path),
            "-frames:v",
            "1",
            "-c:v",
            "ffv1",
            "-vf",
            f"setparams=range={'limited' if signal_range == 'tv' else 'full'}:colorspace=bt709",
            "-color_range",
            signal_range,
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
        source = opened["source_id"]
        status, result = call(
            url, token, f"video/upload?source_id={source}", clip.read_bytes()
        )
        assert status == 200, result
        session = server.videos.get(source)
        assert (session.root / "source.raw").read_bytes() == native
        floats = np.fromfile(
            session.root / "demonstration.gbrpf32le", dtype="<f4"
        ).reshape(3, 16, 16)
        np.testing.assert_allclose(
            floats[:, :, :8], -64 / 876 if signal_range == "tv" else 0, atol=2e-6
        )
        np.testing.assert_allclose(
            floats[:, :, 8:], 959 / 876 if signal_range == "tv" else 1, atol=2e-6
        )
        assert result["source"]["precision_bits"] == 10
        assert result["source"]["range_conversion_applied"] is False
        assert result["provenance"]["interpretation_confirmed"] is False
        assert call(url, token, "video/start", {})[0] == 200
        assert not session.root.exists()
        assert (
            call(url, token, "video/frame", {"source_id": source, "index": 0})[0] == 400
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
    reason="Real FFmpeg/FFprobe required",
)
@pytest.mark.parametrize(
    "codec,pixels,options",
    [
        ("libx264", "yuv420p10le", []),
        ("libx265", "yuv420p10le", ["-x265-params", "pools=1:frame-threads=1"]),
        ("prores_ks", "yuv422p10le", ["-profile:v", "2"]),
    ],
)
def test_supported_ten_bit_camera_codecs(tmp_path, codec, pixels, options):
    clip = tmp_path / "sample.mov"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=32x24:rate=10:duration=0.2",
            "-c:v",
            codec,
            "-threads",
            "1",
            "-pix_fmt",
            pixels,
            *options,
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
        status, result = call(
            url,
            token,
            f"video/upload?source_id={opened['source_id']}",
            clip.read_bytes(),
        )
        assert status == 200, result
        assert result["source"]["precision_bits"] == 10
        assert result["source"]["pixel_format"] == pixels
        assert result["provenance"]["tools"]["ffmpeg"].startswith("ffmpeg version")
        session = server.videos.get(opened["source_id"])
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    assert not session.root.exists()


def test_cancel_partial_upload_releases_files_and_missing_tools_are_actionable(
    monkeypatch,
):
    server, url, token = create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    connection = http.client.HTTPConnection(urlsplit(url).netloc, timeout=5)
    try:
        assert call(url, "wrong token", "video/start", {})[0] == 403
        _, opened = call(url, token, "video/start", {})
        source = opened["source_id"]
        session = server.videos.get(source)
        connection.putrequest("POST", f"/video/upload?source_id={source}")
        connection.putheader("Content-Type", "application/octet-stream")
        connection.putheader("Content-Length", "100000")
        connection.putheader("X-LUT-Builder-Token", token)
        connection.endheaders()
        connection.send(b"partial")
        deadline = time.monotonic() + 5
        while not (session.root / "input").exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert (session.root / "input").exists()
        assert call(url, token, "video/cancel", {"source_id": source})[0] == 200
        while session.root.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert not session.root.exists()
        _, opened = call(url, token, "video/start", {})
        monkeypatch.setenv("PATH", "")
        status, result = call(
            url, token, f"video/upload?source_id={opened['source_id']}", b"not video"
        )
        assert status == 400
        assert "ffmpeg is missing" in result["error"]
    finally:
        connection.close()
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
    reason="Real FFmpeg/FFprobe required",
)
@pytest.mark.parametrize("failed_tree_termination", [False, True])
def test_invalid_media_and_processing_deadline_cleanup(
    tmp_path, monkeypatch, failed_tree_termination
):
    from lut_builder import video

    server, url, token = create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        _, opened = call(url, token, "video/start", {})
        session = server.videos.get(opened["source_id"])
        status, result = call(
            url, token, f"video/upload?source_id={session.id}", b"invalid media"
        )
        assert status == 400
        assert "could not decode" in result["error"]
        assert not session.root.exists()
        clip = tmp_path / "known.mp4"
        make_clip(clip)
        if failed_tree_termination:
            original_run = subprocess.run

            def fail_taskkill(args, **kwargs):
                if str(args[0]).endswith("taskkill.exe"):
                    raise OSError("Tree termination unavailable")
                return original_run(args, **kwargs)

            monkeypatch.setattr(subprocess, "run", fail_taskkill)
        _, opened = call(url, token, "video/start", {})
        session = server.videos.get(opened["source_id"])
        monkeypatch.setattr(video, "COMMAND_SECONDS", 0.05)
        status, result = call(
            url, token, f"video/upload?source_id={session.id}", clip.read_bytes()
        )
        assert status == 400
        assert "processing limit" in result["error"]
        assert not session.root.exists()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
