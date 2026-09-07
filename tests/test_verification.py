"""Reference checks at the decoded-RGB API shared with frame extraction."""

import numpy as np
import pytest
from itertools import permutations
from dataclasses import replace

from lut_builder.data import PROFILE_CATALOG

from lut_builder.setup import LutSetup
from lut_builder.verification import sdr_view, verify_rgb


INTERPRETATION = {
    "transfer": "S-Log3",
    "gamut": "S-Gamut3.Cine",
    "range": "camera-code-values",
    "decoding": "RGB; no color transform or range scaling",
    "confirmed": True,
}


def test_decoded_rgb_preserves_excursions_and_returns_actual_cube():
    source = np.array([[[-0.125, 0.375, 1.125], [0.5, 0.5, 0.5]]], dtype=np.float32)
    setup = LutSetup(
        "Sony S-Log3",
        "Rec.709",
        cube_size=17,
        bands=[{"stop": 0, "width": 100, "color": "#804020"}],
    )
    result = verify_rgb(source, setup, INTERPRETATION)
    np.testing.assert_array_equal(result.source_rgb, source)
    # Authored Rec.709 triplets are stored directly by the export contract.
    np.testing.assert_allclose(
        result.output_rgb[0], [[128 / 255, 64 / 255, 32 / 255]] * 2, atol=4e-8, rtol=0
    )
    assert b"LUT_3D_SIZE 17" in result.cube
    assert result.provenance["input_domain"]["clamped_channels"] == 2
    assert result.provenance["interpolation"] == "tetrahedral"


def independent_cube(cube, samples):
    """Read red-fastest Iridas rows and solve tetrahedron barycentric weights.

    No Colour reader or interpolator. A linear-system solve supplies an
    independent algorithm rather than duplicating Colour's six-case formula.
    """
    lines = cube.decode().splitlines()
    size = int(
        next(line.split()[1] for line in lines if line.startswith("LUT_3D_SIZE"))
    )
    rows = [
        list(map(float, line.split()))
        for line in lines
        if line and line[0] in "0123456789-."
    ]
    table = np.asarray(rows).reshape(size, size, size, 3).transpose(2, 1, 0, 3)
    result = []
    for sample in samples.reshape(-1, 3):
        position = np.clip(sample, 0, 1) * (size - 1)
        base = np.minimum(np.floor(position).astype(int), size - 2)
        order = np.argsort(-(position - base), kind="stable")
        corners = [base.copy()]
        for axis in order:
            next_corner = corners[-1].copy()
            next_corner[axis] += 1
            corners.append(next_corner)
        weights = np.linalg.solve(
            np.vstack([np.asarray(corners).T, np.ones(4)]), np.append(position, 1)
        )
        result.append(weights @ np.asarray([table[tuple(c)] for c in corners]))
    return np.asarray(result).reshape(samples.shape)


@pytest.mark.parametrize("size", [17, 33, 65])
@pytest.mark.parametrize("mode", ["stops", "ire", "fill"])
def test_serialized_cube_agrees_with_independent_barycentric_reference(size, mode):
    setup = LutSetup(
        "Sony S-Log3",
        "Rec.709",
        cube_size=size,
        band_mode="ire" if mode == "ire" else "stops",
        fill_mode=mode == "fill",
        monochrome=True,
        bands=[
            {"stop": 40 if mode == "ire" else -1, "width": 0.2, "color": "#e02080"},
            {"stop": 41 if mode == "ire" else 0, "width": 0.3, "color": "#20cc70"},
        ],
        low_signal_warning=True,
        low_signal_hex="#123456",
        high_signal_warning=True,
        high_signal_hex="#fedcba",
    )
    rng = np.random.default_rng(36)
    points = list(permutations([0.315, 0.425, 0.535])) + [
        [0, 0, 0],
        [1, 1, 1],
        [-0.02, 0.5, 1.02],
    ]
    # Threshold neighborhoods, including the export's half-grid warning expansion.
    for threshold in [
        0.0929 + 0.5 / (size - 1),
        0.94 - 0.5 / (size - 1),
        0.410557184750733,
    ]:
        points.extend([[threshold + delta] * 3 for delta in [-1e-7, 0, 1e-7]])
    points.extend([[i / (size - 1)] * 3 for i in range(size)])
    source = np.vstack([points, rng.uniform(-0.02, 1.02, (100, 3))])[None, ...]
    result = verify_rgb(source, setup, INTERPRETATION)
    expected = independent_cube(result.cube, source)
    error = np.max(np.abs(result.output_rgb - expected))
    print(f"cube {size} {mode}: independent tetrahedral max={error:.3g}")
    np.testing.assert_allclose(result.output_rgb, expected, atol=1e-12, rtol=0)
    # Any-channel high wins even when another channel is below the low threshold.
    np.testing.assert_allclose(
        result.output_rgb[0, 8], [254 / 255, 220 / 255, 186 / 255], atol=8.1e-8, rtol=0
    )


@pytest.mark.parametrize("profile_name", list(PROFILE_CATALOG.source_names()))
@pytest.mark.parametrize("target", ["Rec.709", "Rec.2020"])
@pytest.mark.parametrize("legal", [False, True])
def test_supported_profiles_targets_and_ranges(profile_name, target, legal):
    profile = PROFILE_CATALOG.source(profile_name)
    interpretation = {**INTERPRETATION, "transfer": profile.log, "gamut": profile.gamut}
    source = np.array([[[0, 0, 0], [0.375, 0.5, 0.625], [1, 1, 1]]], dtype=np.float64)
    setup = LutSetup(
        profile_name,
        target,
        cube_size=17,
        legal_range=legal,
        low_signal_warning=True,
        low_signal_hex="#000000",
        high_signal_warning=True,
        high_signal_hex="#ffffff",
    )
    result = verify_rgb(source, setup, interpretation)
    low, high = (64 / 1023, 940 / 1023) if legal else (0, 1)
    assert result.output_rgb.min() >= low - 1e-10
    assert result.output_rgb.max() <= high + 1e-10
    np.testing.assert_allclose(result.output_rgb[0, 0], [low] * 3, atol=1e-7, rtol=0)
    # Existing authored-sRGB conversion to Rec.2020 uses rounded sRGB matrices.
    # Preserve its slightly tinted white instead of changing export mathematics.
    np.testing.assert_allclose(
        result.output_rgb[0, -1],
        [high] * 3,
        atol=3e-5 if target == "Rec.2020" else 1e-7,
        rtol=0,
    )
    np.testing.assert_allclose(result.display_rgb[0, 0], [0] * 3, atol=1e-6, rtol=0)
    # The export's authored white tint stays below 4e-5 in this SDR view.
    np.testing.assert_allclose(result.display_rgb[0, -1], [1] * 3, atol=4e-5, rtol=0)


@pytest.mark.parametrize("target", ["Rec.709", "Rec.2020"])
@pytest.mark.parametrize("legal", [False, True])
def test_sdr_view_has_independent_known_values_and_expands_range_once(target, legal):
    setup = LutSetup("Sony S-Log3", target, legal_range=legal)
    signal = np.array([[[0, 0, 0], [0.5, 0.5, 0.5], [1, 1, 1], [1, 0, 0]]])
    encoded = signal * (876 / 1023) + 64 / 1023 if legal else signal
    # BT.1886 ideal black: 0.5**2.4 = 0.18946457081379978 cd/m² relative.
    # IEC sRGB encoding is exactly 1.055 * 0.5 - 0.055 = 0.4725.
    expected = [[0, 0, 0], [0.4725] * 3, [1] * 3, [1, 0, 0]]
    output = sdr_view(encoded, setup)
    np.testing.assert_allclose(output[0], expected, atol=1e-12, rtol=0)
    np.testing.assert_array_equal(
        encoded, signal * (876 / 1023) + 64 / 1023 if legal else signal
    )


def test_analytical_neutral_reference_separates_node_precision_from_band_edge_error():
    # Sony S-Log3 published inverse and BT.709 piecewise OETF, independent of Colour.
    def analytical(code):
        linear = np.where(
            code >= 171.2102946929 / 1023,
            10 ** ((code * 1023 - 420) / 261.5) * 0.19 - 0.01,
            (code * 1023 - 95) * 0.01125 / (171.2102946929 - 95),
        )
        return np.clip(
            np.where(
                linear < 0.018,
                4.5 * linear,
                1.099 * np.maximum(linear, 0) ** 0.45 - 0.099,
            ),
            0,
            1,
        )

    setup = LutSetup("Sony S-Log3", "Rec.709", cube_size=17, monochrome=True)
    nodes = np.linspace(0, 1, 17)
    result = verify_rgb(
        np.repeat(nodes[:, None], 3, axis=1)[None, ...], setup, INTERPRETATION
    )
    error = np.max(np.abs(result.output_rgb[0, :, 0] - analytical(nodes)))
    print(f"analytical neutral node max={error:.3g}")
    assert error < 8.1e-8  # float32 rounding <=2^-25 plus 7-place decimal <=5e-8.
    # An extremely narrow band at exact middle grey misses every 17³ neutral node.
    code = (420 + 261.5 * np.log10((0.18 + 0.01) / 0.19)) / 1023
    banded = replace(setup, bands=[{"stop": 0, "width": 0.001, "color": "#ff0000"}])
    at_grey = verify_rgb(np.array([[[code] * 3]]), banded, INTERPRETATION)
    difference = np.max(np.abs(at_grey.output_rgb[0, 0] - [1, 0, 0]))
    print(f"analytical narrow-band vs sampled at grey max={difference:.6f}")
    assert difference > 0.5  # Expected sampled-band loss, not an interpolation failure.


@pytest.mark.parametrize(
    "change,match",
    [
        ({"confirmed": False}, "Confirm"),
        ({"transfer": ""}, "does not match"),
        ({"gamut": "sRGB"}, "does not match"),
        ({"range": "legal"}, "range"),
        ({"decoding": ""}, "decoding"),
    ],
)
def test_unknown_or_mismatched_interpretations_fail(change, match):
    with pytest.raises(ValueError, match=match):
        verify_rgb(
            np.zeros((1, 1, 3)),
            LutSetup("Sony S-Log3", "Rec.709"),
            {**INTERPRETATION, **change},
        )


@pytest.mark.parametrize(
    "source",
    [
        np.zeros((1, 1, 3), dtype=np.uint8),
        np.zeros((1, 3)),
        np.array([[[float("nan"), 0, 0]]]),
        np.array([[[float("inf"), 0, 0]]]),
    ],
)
def test_nonfinite_or_low_precision_arrays_fail(source):
    with pytest.raises(ValueError):
        verify_rgb(source, LutSetup("Sony S-Log3", "Rec.709"), INTERPRETATION)
