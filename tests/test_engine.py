from pathlib import Path

import colour
import numpy as np
import pytest

from lut_builder.engine import generate_lut
from lut_builder.data import MIDDLE_GREY, PROFILE_CATALOG
from lut_builder.setup import LutSetup


OVERLAY_HEX = "#336699"
TARGET_COLORS = {
    "Rec.709": {
        OVERLAY_HEX: [0.2, 0.4, 0.6],
        "#ff0000": [1.0, 0.0, 0.0],
        "#0000ff": [0.0, 0.0, 1.0],
    },
    "Rec.2020": {
        OVERLAY_HEX: [0.25036167, 0.33688871, 0.53790870],
        "#ff0000": [0.79205726, 0.23103347, 0.07363906],
        "#0000ff": [0.16870061, 0.05112640, 0.94678254],
    },
}
def _generate_lut(tmp_path: Path, *, size: int, target: str, mode: str):
    output = tmp_path / f"{target}-{mode}-{size}.cube"
    center, width = (0.0, 0.5) if mode == "stops" else (42.0, 6.0)
    generate_lut(
        LutSetup(
            profile_name="Sony S-Log3",
            target_name=target,
            cube_size=size,
            bands=[{"stop": center, "color": OVERLAY_HEX, "width": width}],
            band_mode=mode,
            low_signal_warning=True,
            low_signal_hex="#ff0000",
            high_signal_warning=True,
            high_signal_hex="#0000ff",
            monochrome=True,
            output_filename=str(output),
        )
    )
    return colour.read_LUT(str(output))


@pytest.mark.parametrize("target_name", ["Rec.709", "Rec.2020"])
def test_srgb_overlay_is_written_in_target_gamut(tmp_path, target_name):
    lut = _generate_lut(tmp_path, size=17, target=target_name, mode="stops")
    for color, expected in TARGET_COLORS[target_name].items():
        assert np.any(np.all(np.isclose(lut.table, expected, atol=1e-6), axis=-1))


@pytest.mark.parametrize("size", [17, 33, 65])
@pytest.mark.parametrize("mode,center,width", [("stops", 0.0, 0.5), ("ire", 42.0, 6.0)])
def test_neutral_ramp_band_edges_and_half_grid_clipping(
    tmp_path, size, mode, center, width
):
    lut = _generate_lut(tmp_path, size=size, target="Rec.709", mode=mode)
    ramp = np.linspace(0, 1, size)
    diagonal = lut.table[np.arange(size), np.arange(size), np.arange(size)]
    profile = PROFILE_CATALOG.source("Sony S-Log3")
    linear = colour.models.log_decoding(ramp, function=profile.log)
    values = (
        colour.models.oetf(linear, function="ITU-R BT.709") * 100
        if mode == "ire"
        else np.log2(np.maximum(linear, 1e-6) / MIDDLE_GREY)
    )
    tolerance = 0.5 / (size - 1)
    low = ramp <= profile.encoded_signal_floor + tolerance
    high = ramp >= profile.encoded_signal_ceiling - tolerance
    overlay = (values >= center - width) & (values <= center + width) & ~low & ~high

    for mask, color in (
        (overlay, TARGET_COLORS["Rec.709"][OVERLAY_HEX]),
        (low & ~high, TARGET_COLORS["Rec.709"]["#ff0000"]),
        (high, TARGET_COLORS["Rec.709"]["#0000ff"]),
    ):
        actual = np.all(np.isclose(diagonal, color, atol=1e-6), axis=1)
        assert np.array_equal(actual, mask)

    for edge in np.flatnonzero(overlay[:-1] != overlay[1:]):
        midpoint = (ramp[edge] + ramp[edge + 1]) / 2
        interpolated = lut.apply(np.array([midpoint] * 3))
        corners = lut.table[
            edge : edge + 2, edge : edge + 2, edge : edge + 2
        ].reshape(-1, 3)
        assert np.all(interpolated >= corners.min(axis=0) - 1e-6)
        assert np.all(interpolated <= corners.max(axis=0) + 1e-6)
        assert not np.allclose(interpolated, diagonal[edge], atol=1e-6)
        assert not np.allclose(interpolated, diagonal[edge + 1], atol=1e-6)
