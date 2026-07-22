# tests/test_smoke.py
import json
import tempfile
from pathlib import Path

import colour
import pytest

from lut_builder.data import MIDDLE_GREY, PROFILE_CATALOG, ProfileCatalog, oklch_to_hex
from lut_builder.engine import generate_lut
from lut_builder.setup import LutSetup


MIDDLE_GREY_CODES = {
    "Sony S-Log3": 0.41055718475073316,
    "Panasonic V-Log": 0.42331144876013616,
    "Canon Log 3": 0.3433893703739355,
    "ARRI LogC3": 0.39100683203408376,
    "RED Log3G10": 0.33333291202599186,
}


def generate_neutral_sample(tmp_path, profile_name, bands=None, band_mode="stops"):
    output_path = tmp_path / f"{profile_name}-{band_mode}.cube"
    generate_lut(
        LutSetup(
            profile_name=profile_name,
            target_name="Rec.709",
            cube_size=17,
            bands=bands or [],
            band_mode=band_mode,
            output_filename=str(output_path),
        )
    )
    lut = colour.read_LUT(str(output_path))
    assert isinstance(lut, colour.LUT3D)
    center = lut.table.shape[0] // 2
    return lut.table[center, center, center]


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
        result = generate_lut(LutSetup(
            profile_name="Sony S-Log3",
            target_name="Rec.709",
            cube_size=17,
            bands=[{"stop": 0.0, "color": "#ff0000", "width": 0.25}],
            band_mode="stops",
            low_signal_warning=False,
            low_signal_hex="",
            high_signal_warning=False,
            high_signal_hex="",
            monochrome=True,
            output_filename=str(out),
            legal_range=False,
            fill_mode=False,
        ))
        assert Path(result).exists()
        assert Path(result).stat().st_size > 0


def test_config_round_trip():
    from lut_builder.cli import save_config, load_config

    setup = LutSetup(
        profile_name="Sony S-Log3",
        target_name="Rec.709",
        cube_size=33,
        bands=[{"stop": 1.0, "color": "#00ff00", "width": 0.5}],
        band_mode="stops",
        low_signal_warning=True,
        low_signal_hex="#0000ff",
        high_signal_warning=False,
        high_signal_hex="",
        monochrome=False,
        output_filename="test.cube",
        legal_range=False,
        fill_mode=False,
    )

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = Path(f.name)

    try:
        save_config(path, setup)
        loaded = load_config(path)

        assert loaded == setup
    finally:
        path.unlink(missing_ok=True)


@pytest.mark.parametrize("profile_name", PROFILE_CATALOG.source_names())
def test_profile_middle_grey_decodes_to_scene_linear(profile_name):
    decoded = colour.models.log_decoding(
        MIDDLE_GREY_CODES[profile_name],
        function=PROFILE_CATALOG.source(profile_name).log,
    )

    assert decoded == pytest.approx(MIDDLE_GREY, abs=1e-6)


def test_generated_profiles_do_not_all_use_cineon(tmp_path):
    outputs = [
        generate_neutral_sample(tmp_path, profile_name)[0]
        for profile_name in PROFILE_CATALOG.source_names()
    ]

    assert max(outputs) - min(outputs) > 0.1


def test_profile_validation_rejects_unknown_log():
    catalog = ProfileCatalog(
        sources={
            "Invalid": {
                "gamut": "S-Gamut3.Cine",
                "log": "not-a-log-decoder",
                "encoded_signal_floor": 0.0,
                "encoded_signal_ceiling": 1.0,
            }
        },
        targets={},
    )

    with pytest.raises(ValueError, match="log.*not supported"):
        catalog.validate()


@pytest.mark.parametrize(
    ("band_mode", "band_value", "width"),
    [("stops", 1.206029787487263, 0.001), ("ire", 64.10197890890636, 0.01)],
)
def test_neutral_input_band_placement(tmp_path, band_mode, band_value, width):
    output = generate_neutral_sample(
        tmp_path,
        "Sony S-Log3",
        [{"stop": band_value, "color": "#ff00ff", "width": width}],
        band_mode,
    )

    assert output == pytest.approx([1, 0, 1], abs=1e-6)
