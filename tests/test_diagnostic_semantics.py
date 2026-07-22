import colour
import numpy as np
import pytest

from lut_builder.data import PROFILE_CATALOG
from lut_builder.cli import console, print_exposure_preview
from lut_builder.engine import generate_lut
from lut_builder.setup import LutSetup


def test_camera_profiles_name_encoded_signal_thresholds():
    for profile in PROFILE_CATALOG.sources():
        assert 0 <= profile.encoded_signal_floor < profile.encoded_signal_ceiling <= 1


def test_encoded_signal_warnings_trigger_when_one_channel_crosses_threshold(tmp_path):
    output = tmp_path / "warnings.cube"
    generate_lut(
        LutSetup(
            profile_name="Sony S-Log3",
            target_name="Rec.709",
            cube_size=17,
            low_signal_warning=True,
            low_signal_hex="#1100ff",
            high_signal_warning=True,
            high_signal_hex="#ff2200",
            output_filename=str(output),
        )
    )

    lut = colour.read_LUT(output)
    np.testing.assert_allclose(
        lut.apply([0.0, 0.5, 0.5]), [17 / 255, 0, 1], atol=1e-6
    )
    np.testing.assert_allclose(
        lut.apply([0.5, 0.5, 1.0]), [1, 34 / 255, 0], atol=1e-6
    )


def test_preview_labels_warning_thresholds_as_encoded_signal():
    with console.capture() as capture:
        print_exposure_preview(
            LutSetup(
                "Sony S-Log3",
                "Rec.709",
                low_signal_warning=True,
                low_signal_hex="#1100ff",
                high_signal_warning=True,
                high_signal_hex="#ff2200",
            )
        )

    preview = " ".join(capture.get().split())
    assert "any channel ≤ 0.093 encoded signal" in preview
    assert "any channel ≥ 0.940 encoded signal" in preview
    assert "not shown on stop axis" in preview


@pytest.mark.parametrize(
    ("legal_range", "expected_levels"),
    [
        (False, [0.0, 0.409007728864, 1.0]),
        (True, [0.062561094819, 0.412796452087, 0.918866080156]),
    ],
)
def test_black_middle_grey_and_white_follow_selected_range(
    tmp_path, legal_range, expected_levels
):
    output = tmp_path / f"range-{legal_range}.cube"
    generate_lut(
        LutSetup(
            profile_name="Sony S-Log3",
            target_name="Rec.709",
            cube_size=65,
            band_mode="ire",
            output_filename=str(output),
            legal_range=legal_range,
        )
    )

    lut = colour.read_LUT(output)
    encoded_neutrals = [0.092864125122, 0.410557184751, 0.596027343690]
    actual = [lut.apply([level] * 3)[0] for level in encoded_neutrals]
    np.testing.assert_allclose(actual, expected_levels, atol=0.02)

    comments = output.read_text()
    assert "diagnostic scene-exposure transform" in comments
    assert ("0=code 64, 100=code 940" if legal_range else "0=code 0, 100=code 1023") in comments


@pytest.mark.parametrize("profile_name", PROFILE_CATALOG.source_names())
@pytest.mark.parametrize("target_name", PROFILE_CATALOG.target_names())
def test_legal_range_constrains_non_neutral_gamut_excursions(
    tmp_path, profile_name, target_name
):
    luts = {}
    for legal_range in (False, True):
        output = tmp_path / f"{profile_name}-{target_name}-{legal_range}.cube"
        generate_lut(
            LutSetup(
                profile_name=profile_name,
                target_name=target_name,
                cube_size=17,
                output_filename=str(output),
                legal_range=legal_range,
            )
        )
        luts[legal_range] = colour.read_LUT(output)

    non_neutral = np.ptp(colour.LUT3D(size=17).table, axis=-1) > 0
    excursions = non_neutral & np.any(np.isin(luts[False].table, [0, 1]), axis=-1)
    legal_low, legal_high = 64 / 1023, 940 / 1023
    assert np.any(excursions)
    assert np.min(luts[True].table) >= legal_low
    assert np.max(luts[True].table) <= legal_high
