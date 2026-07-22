import pytest
import numpy as np
import colour

from lut_builder.engine import generate_lut
from lut_builder.setup import LutSetup, exposure_preview, map_exposure


def test_version_1_config_normalizes_to_interactive_setup():
    config = {
        "version": 1,
        "profile": "Sony S-Log3",
        "target": "Rec.709",
        "bands": [{"stop": 0, "color": "#ff0000", "width": 0.25}],
    }

    assert LutSetup.from_config(config) == LutSetup(
        profile_name="Sony S-Log3",
        target_name="Rec.709",
        bands=[{"stop": 0.0, "color": "#ff0000", "width": 0.25}],
    )


def test_exposure_preview_keeps_fixed_mode_viewports():
    stops = exposure_preview(
        LutSetup(
            "Sony S-Log3",
            "Rec.709",
            bands=[{"stop": 12, "color": "#ff0000", "width": 4}],
        )
    )
    ire = exposure_preview(
        LutSetup("Sony S-Log3", "Rec.709", band_mode="ire")
    )

    assert (stops["minimum"], stops["maximum"]) == (-7, 7)
    assert (ire["minimum"], ire["maximum"]) == (0, 100)


def test_setup_defaults():
    setup = LutSetup("Sony S-Log3", "Rec.709")

    assert setup.cube_size == 33
    assert setup.bands == []
    assert setup.band_mode == "stops"
    assert setup.fill_mode is False
    assert setup.low_signal_warning is False
    assert setup.high_signal_warning is False
    assert setup.legal_range is False
    assert setup.output_filename == "SonyS-Log3_Custom.cube"


def test_version_1_fill_mode_is_preserved():
    setup = LutSetup.from_config(
        {
            "version": 1,
            "profile": "Sony S-Log3",
            "target": "Rec.709",
            "band_mode": "fill",
        }
    )

    assert setup.band_mode == "stops"
    assert setup.fill_mode is True


def test_setup_rejects_invalid_values():
    with pytest.raises(ValueError, match="cube_size"):
        LutSetup("Sony S-Log3", "Rec.709", cube_size=16)

    with pytest.raises(ValueError, match="band_mode"):
        LutSetup("Sony S-Log3", "Rec.709", band_mode="wat")

    with pytest.raises(ValueError, match="width"):
        LutSetup(
            "Sony S-Log3",
            "Rec.709",
            bands=[{"stop": 0, "color": "#ff0000", "width": -1}],
        )


def test_setup_orders_bands_by_position_and_preserves_creation_order_at_ties():
    setup = LutSetup(
        "Sony S-Log3",
        "Rec.709",
        bands=[
            {"stop": 1, "color": "#00ff00", "width": 1},
            {"stop": -1, "color": "#ff0000", "width": 1},
            {"stop": 1, "color": "#0000ff", "width": 1},
        ],
    )

    assert setup.bands == [
        {"stop": -1.0, "color": "#ff0000", "width": 1.0},
        {"stop": 1.0, "color": "#00ff00", "width": 1.0},
        {"stop": 1.0, "color": "#0000ff", "width": 1.0},
    ]


def test_exposure_mapping_uses_stop_order_then_warning_priority():
    setup = LutSetup(
        "Sony S-Log3",
        "Rec.709",
        bands=[
            {"stop": 0.5, "color": "#00ff00", "width": 1},
            {"stop": 0, "color": "#ff0000", "width": 1},
        ],
        low_signal_warning=True,
        low_signal_hex="#0000ff",
        high_signal_warning=True,
        high_signal_hex="#ffffff",
    )

    colors = map_exposure(
        np.array([-0.75, 0.0, 0.75]),
        setup,
        low_signal_mask=np.array([True, False, False]),
        high_signal_mask=np.array([True, False, True]),
    )

    assert colors.tolist() == ["#ffffff", "#00ff00", "#ffffff"]


def test_fill_uses_stops_as_color_boundaries():
    fill = LutSetup(
        "Sony S-Log3",
        "Rec.709",
        bands=[
            {"stop": 80, "color": "#ffffff", "width": 0},
            {"stop": 20, "color": "#000000", "width": 0},
        ],
        band_mode="ire",
        fill_mode=True,
    )

    assert map_exposure(np.array([0, 19, 20, 21, 100]), fill).tolist() == [
        "#000000",
        "#000000",
        "#ffffff",
        "#ffffff",
        "#ffffff",
    ]


def test_preview_labels_ire_values_as_ire():
    from lut_builder.cli import console, print_exposure_preview

    setup = LutSetup(
        "Sony S-Log3",
        "Rec.709",
        bands=[{"stop": 42, "color": "#00ff00", "width": 2}],
        band_mode="ire",
    )

    with console.capture() as capture:
        print_exposure_preview(setup)

    output = capture.get()
    assert "0 IRE → 100 IRE" in output
    assert "42 IRE  ±2.0 IRE" in output
    assert "42 IRE stops" not in output


def test_generated_cube_applies_ire_bands(tmp_path):
    output = tmp_path / "ire.cube"
    setup = LutSetup(
        "Sony S-Log3",
        "Rec.709",
        cube_size=17,
        bands=[{"stop": 50, "color": "#ff00ff", "width": 2}],
        band_mode="ire",
        output_filename=str(output),
    )

    generate_lut(setup)
    table = colour.read_LUT(str(output)).table.reshape(-1, 3)

    assert np.any(np.all(np.isclose(table, [1, 0, 1]), axis=1))
    assert np.any(~np.all(np.isclose(table, [1, 0, 1]), axis=1))
