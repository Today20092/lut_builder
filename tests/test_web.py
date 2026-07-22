import json
import re
import threading
from urllib.error import HTTPError
from urllib.request import Request, urlopen

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
