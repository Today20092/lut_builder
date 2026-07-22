import json
import re
import threading
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np

from lut_builder.setup import LutSetup, map_exposure
from lut_builder.web import create_server


def _request(url, *, token=None, payload=None, content_type="application/json"):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {}
    if token:
        headers["X-LUT-Builder-Token"] = token
    if content_type:
        headers["Content-Type"] = content_type
    return urlopen(Request(url, data=data, headers=headers), timeout=30)


def test_local_bootstrap_and_default_lut_generation():
    server, url, token = create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        assert server.server_address[0] == "127.0.0.1"

        with _request(url) as response:
            page = response.read().decode()
        assert token in page
        assert "Sony S-Log3" in page
        assert "Rec.709" in page
        assert '"cube_size": 65' in page
        assert '"stop": 0.0' in page
        assert '"width": 0.3' in page
        assert '"monochrome": true' in page
        assert '"legal_range": false' in page
        asset_paths = re.findall(r'(?:src|href)="(/assets/[^"]+)"', page)
        assert asset_paths
        assets = ""
        for path in asset_paths:
            with _request(url.rstrip("/") + path) as response:
                assets += response.read().decode(errors="ignore")
        assert "prefers-color-scheme:dark" in assets
        assert "data-slot" in assets
        assert "Stops" in assets
        assert "Monochrome" in assets
        assert "Full range" in assets

        for request in (
            Request(url + "generate", data=b"{}", method="POST"),
            Request(
                url + "generate",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            ),
        ):
            try:
                urlopen(request, timeout=5)
            except HTTPError as error:
                assert error.code in {403, 415}
            else:
                raise AssertionError("untrusted mutation request was accepted")

        with _request(
            url + "generate",
            token=token,
            payload={"output": "../unsafe name.exe"},
        ) as response:
            cube = response.read().decode()
            disposition = response.headers["Content-Disposition"]

        assert 'filename="unsafe_name.cube"' in disposition
        assert "LUT_3D_SIZE 65" in cube
        assert cube.count("\n") > 65**3
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_preview_and_generation_accept_complete_version_1_setup():
    server, url, token = create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    config = {
        "version": 1,
        "profile": "Sony S-Log3",
        "target": "Rec.709",
        "cube_size": 17,
        "bands": [
            {"stop": -1, "width": 0.6, "color": "#ef4444"},
            {"stop": 0, "width": 0.6, "color": "#22c55e"},
        ],
        "band_mode": "stops",
        "fill_mode": False,
        "low_signal_warning": True,
        "low_signal_hex": "#6b21a8",
        "high_signal_warning": True,
        "high_signal_hex": "#dc2626",
        "monochrome": True,
        "legal_range": True,
        "output": "../complete setup.exe",
    }

    try:
        with _request(url + "preview", token=token, payload=config) as response:
            preview = json.load(response)

        values = np.asarray(preview["values"])
        expected = map_exposure(
            values,
            LutSetup.from_config(config),
            width_buffer=preview["width_buffer"],
        )
        assert preview["colors"] == [color or "#3f3f46" for color in expected]
        assert [item["kind"] for item in preview["legend"]] == [
            "low",
            "band",
            "band",
            "high",
        ]

        with _request(url + "generate", token=token, payload=config) as response:
            cube = response.read().decode()
            disposition = response.headers["Content-Disposition"]

        assert 'filename="complete_setup.cube"' in disposition
        assert "LUT_3D_SIZE 17" in cube
        assert cube.count("\n") > 17**3
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_invalid_preview_is_actionable_and_does_not_poison_next_request():
    server, url, token = create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        try:
            _request(
                url + "preview",
                token=token,
                payload={"version": 1, "profile": "Not a camera", "target": "Rec.709"},
            )
        except HTTPError as error:
            assert error.code == 400
            assert "unknown profile" in json.load(error)["error"]
        else:
            raise AssertionError("invalid preview was accepted")

        with _request(url + "preview", token=token, payload={
            "version": 1,
            "profile": "Sony S-Log3",
            "target": "Rec.709",
        }) as response:
            assert json.load(response)["values"]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_preview_accepts_legacy_version_1_warning_names():
    server, url, token = create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        with _request(url + "preview", token=token, payload={
            "version": 1,
            "profile": "Sony S-Log3",
            "target": "Rec.709",
            "black_clip": True,
            "black_hex": "#123456",
            "white_clip": True,
            "white_hex": "#abcdef",
        }) as response:
            setup = json.load(response)["setup"]

        assert setup["low_signal_warning"] is True
        assert setup["low_signal_hex"] == "#123456"
        assert setup["high_signal_warning"] is True
        assert setup["high_signal_hex"] == "#abcdef"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
