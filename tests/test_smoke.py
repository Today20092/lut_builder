# tests/test_smoke.py
import json
import tempfile
from pathlib import Path

import pytest

from lut_builder.data import oklch_to_hex
from lut_builder.engine import generate_lut


def test_oklch_to_hex():
    # Pure white in OKLCh (L=1, C=0, H=any) → #ffffff
    result = oklch_to_hex(1.0, 0.0, 0.0)
    assert result.lower() == "#ffffff"

    # Pure black → #000000
    result = oklch_to_hex(0.0, 0.0, 0.0)
    assert result.lower() == "#000000"


def test_hex_validation():
    from lut_builder.cli import pick_color  # noqa: F401 — just ensure it imports
    # Valid hex digits
    valid = "ff6600"
    assert len(valid) == 6
    assert all(c in "0123456789abcdefABCDEF" for c in valid)

    # Invalid
    invalid = "gg0000"
    assert not all(c in "0123456789abcdefABCDEF" for c in invalid)


def test_engine_runs():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir) / "test.cube"
        result = generate_lut(
            profile_name="Sony S-Log3",
            target_name="Rec.709",
            cube_size=17,
            bands=[{"stop": 0.0, "color": "#ff0000", "width": 0.25}],
            band_mode="stops",
            black_clip=False,
            black_hex="",
            white_clip=False,
            white_hex="",
            monochrome=True,
            output_filename=str(out),
            legal_range=False,
            fill_mode=False,
        )
        assert Path(result).exists()
        assert Path(result).stat().st_size > 0


def test_config_round_trip():
    from lut_builder.cli import save_config, load_config, config_from_session

    cfg = config_from_session(
        profile_name="Sony S-Log3",
        target_name="Rec.709",
        cube_size=33,
        bands=[{"stop": 1.0, "color": "#00ff00", "width": 0.5}],
        band_mode="stops",
        black_clip=True,
        black_hex="#0000ff",
        white_clip=False,
        white_hex="",
        monochrome=False,
        output_filename="test.cube",
        legal_range=False,
        fill_mode=False,
    )

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = Path(f.name)

    try:
        save_config(path, cfg)
        loaded = load_config(path)

        assert loaded["version"] == 1
        assert loaded["profile"] == "Sony S-Log3"
        assert loaded["target"] == "Rec.709"
        assert loaded["cube_size"] == 33
        assert loaded["black_clip"] is True
        assert loaded["black_hex"] == "#0000ff"
        assert loaded["fill_mode"] is False
        assert loaded["bands"][0]["color"] == "#00ff00"
    finally:
        path.unlink(missing_ok=True)
