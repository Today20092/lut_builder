import numpy as np
import pytest
import hashlib
import colour

from lut_builder.engine import generate_lut
from lut_builder.setup import LutSetup
from lut_builder.verification import sdr_view
from lut_builder.verification import verify_rgb

from lut_builder.imported_lut import parse_cube
from lut_builder.imported_lut import MAX_CUBE_BYTES


IDENTITY = "LUT_3D_SIZE 2\n" + "\n".join(
    f"{r} {g} {b}" for b in (0, 1) for g in (0, 1) for r in (0, 1)
)


def test_imported_cube_preserves_axes_domain_and_excursions():
    cube = parse_cube("DOMAIN_MIN -1 -2 -3\nDOMAIN_MAX 1 2 3\n" + IDENTITY)
    np.testing.assert_allclose(cube.apply([[0.5, 0, -1.5]]), [[0.75, 0.5, 0.25]])
    np.testing.assert_allclose(cube.apply([[-100, 100, 0]]), [[0, 1, 0.5]])


@pytest.mark.parametrize(
    "text",
    [
        IDENTITY + "\n0 0 0",
        IDENTITY.replace("1 1 1", "NaN 1 1"),
        "LUT_1D_SIZE 2\n0 0 0\n1 1 1",
        "LUT_3D_SIZE 1\n0 0 0",
        "DOMAIN_MIN 1 0 0\n" + IDENTITY,
        "LUT_3D_SIZE 2\n" + IDENTITY,
    ],
)
def test_imported_cube_rejects_unsupported_or_corrupt_data(text):
    with pytest.raises(ValueError):
        parse_cube(text)


def imported(text=IDENTITY, **changes):
    return dict(
        version=1,
        name="look.cube",
        cube=text,
        source_profile="Panasonic V-Log",
        output_gamut="Rec.709",
        output_transfer="gamma2.2",
        output_range="full",
        sha256=hashlib.sha256(text.encode()).hexdigest(),
        **changes,
    )


def test_composition_preserves_base_and_encodes_overlay_once(tmp_path):
    setup = LutSetup(
        "Panasonic V-Log",
        "Rec.709",
        cube_size=33,
        ire_basis="camera",
        imported_lut=imported(),
        bands=[dict(stop=0, width=0.8, color="#808080")],
        output_filename=str(tmp_path / "composed.cube"),
    )
    lut = colour.read_LUT(str(generate_lut(setup)))
    assert isinstance(lut, colour.LUT3D)
    np.testing.assert_allclose(
        lut.table[2, 8, 25], [2 / 32, 8 / 32, 25 / 32], atol=1e-7
    )
    # V-Log code 0.4375 is near middle gray on the 33 lattice.
    expected = ((128 / 255 + 0.055) / 1.055) ** 2.4
    np.testing.assert_allclose(
        lut.table[14, 14, 14], [expected ** (1 / 2.2)] * 3, atol=1e-7
    )
    np.testing.assert_allclose(
        sdr_view(lut.table[14, 14, 14], setup), [128 / 255] * 3, atol=2e-7
    )
    assert LutSetup.from_config(setup.to_config()).imported_lut == setup.imported_lut


def test_verified_comparison_uses_preserved_camera_rgb_without_changing_export():
    setup = LutSetup(
        "Panasonic V-Log",
        "Rec.709",
        cube_size=17,
        ire_basis="camera",
        imported_lut=imported(),
        bands=[dict(stop=0, width=1, color="#ff0000")],
    )
    source = np.array([[[0.4375] * 3]], dtype=np.float64)
    result = verify_rgb(
        source,
        setup,
        dict(
            confirmed=True,
            transfer="V-Log",
            gamut="V-Gamut",
            range="camera-code-values",
            decoding="RGB; no color transform or range scaling",
        ),
    )
    expected_look_display = 1.055 * (0.4375**2.2) ** (1 / 2.4) - 0.055
    assert result.look_display_rgb is not None
    np.testing.assert_allclose(
        result.look_display_rgb, [[[expected_look_display] * 3]], atol=2e-7
    )
    assert result.provenance["output"]["transfer"] == "gamma2.2"
    assert "cube" not in result.provenance["settings"]["imported_lut"]


@pytest.mark.parametrize("mode,center,width", [("stops", 0, 0.8), ("ire", 43.75, 0.2)])
def test_source_classification_is_identical_for_different_creative_looks(
    tmp_path, mode, center, width
):
    masks = []
    for value in ("0 0 0", "0.2 0.3 0.4"):
        text = "LUT_3D_SIZE 2\n" + "\n".join([value] * 8)
        setup = LutSetup(
            "Panasonic V-Log",
            "Rec.709",
            cube_size=33,
            ire_basis="camera",
            band_mode=mode,
            imported_lut=imported(text),
            bands=[dict(stop=center, width=width, color="#ff00ff")],
            output_filename=str(tmp_path / "classify.cube"),
        )
        lut = colour.read_LUT(str(generate_lut(setup)))
        assert isinstance(lut, colour.LUT3D)
        mask = np.all(lut.table == [1, 0, 1], axis=-1)
        assert mask[14, 14, 14]
        assert not mask[0, 0, 0]
        assert not mask[32, 32, 32]
        masks.append(mask)
    np.testing.assert_array_equal(masks[0], masks[1])


def test_cli_saves_embedded_look_as_version3_without_breaking_legacy2(tmp_path):
    import json
    from lut_builder.cli import save_config, load_config

    setup = LutSetup(
        "Panasonic V-Log", "Rec.709", ire_basis="camera", imported_lut=imported()
    )
    path = tmp_path / "portable.json"
    save_config(path, setup)
    assert json.loads(path.read_text())["version"] == 3
    assert load_config(path).imported_lut == setup.imported_lut


@pytest.mark.parametrize("size", [17, 33, 65])
def test_nonlinear_look_preserved_at_export_nodes_with_excursions(tmp_path, size):
    axis = np.linspace(0, 1, 5)
    text = "LUT_3D_SIZE 5\n" + "\n".join(
        f"{r * r + 0.1 * g} {0.8 * g * g + 0.05 * b} {0.6 * b * b + 0.2 * r - 0.1}"
        for b in axis
        for g in axis
        for r in axis
    )
    setup = LutSetup(
        "Panasonic V-Log",
        "Rec.709",
        cube_size=size,
        ire_basis="camera",
        imported_lut=imported(text),
        output_filename=str(tmp_path / "nonlinear.cube"),
    )
    actual = colour.read_LUT(str(generate_lut(setup)))
    assert isinstance(actual, colour.LUT3D)
    # Independent Colour LUT construction, rather than the imported parser under test.
    table = colour.LUT3D.linear_table(5)
    r, g, b = np.moveaxis(table, -1, 0)
    oracle = colour.LUT3D(
        np.stack(
            [r * r + 0.1 * g, 0.8 * g * g + 0.05 * b, 0.6 * b * b + 0.2 * r - 0.1],
            axis=-1,
        )
    )
    expected = oracle.apply(
        colour.LUT3D.linear_table(size),
        interpolator=colour.algebra.table_interpolation_tetrahedral,
    )
    np.testing.assert_allclose(actual.table, expected, rtol=6e-8, atol=5.1e-8)
    assert actual.table[0, 0, 0, 2] < 0
    assert actual.table[-1, -1, -1, 0] > 1


@pytest.mark.parametrize("transfer", ["gamma2.2", "gamma2.4", "sRGB", "BT.709"])
@pytest.mark.parametrize("target", ["Rec.709", "Rec.2020"])
@pytest.mark.parametrize("legal", [False, True])
def test_overlay_display_roundtrip_and_base_range_never_repacked(
    tmp_path, transfer, target, legal
):
    text = "LUT_3D_SIZE 2\n" + "\n".join(["0.25 0.35 0.45"] * 8)
    look = imported(text)
    look.update(
        output_transfer=transfer,
        output_gamut=target,
        output_range="legal" if legal else "full",
    )
    setup = LutSetup(
        "Panasonic V-Log",
        target,
        cube_size=17,
        ire_basis="camera",
        imported_lut=look,
        legal_range=legal,
        bands=[dict(stop=0, width=1, color="#336699")],
        output_filename=str(tmp_path / "overlay.cube"),
    )
    lut = colour.read_LUT(str(generate_lut(setup)))
    assert isinstance(lut, colour.LUT3D)
    np.testing.assert_allclose(lut.table[0, 0, 0], [0.25, 0.35, 0.45], atol=1e-7)
    np.testing.assert_allclose(
        sdr_view(lut.table[7, 7, 7], setup), [0.2, 0.4, 0.6], atol=5e-7
    )


def test_import_trust_boundaries_identity_version_range_and_resource_limits():
    from dataclasses import replace

    setup = LutSetup(
        "Panasonic V-Log", "Rec.709", ire_basis="camera", imported_lut=imported()
    )
    for change in [
        dict(profile_name="Sony S-Log3"),
        dict(target_name="Rec.2020"),
        dict(legal_range=True),
        dict(monochrome=True),
        dict(ire_basis="target"),
        dict(bands=[dict(stop=0, width=0, color="#ffffff")]),
        dict(imported_lut={**imported(), "sha256": "0" * 64}),
        dict(imported_lut={**imported(), "version": 2}),
    ]:
        with pytest.raises(ValueError):
            replace(setup, **change)
    for text in [
        IDENTITY.replace("1 1 1", "1e100 1 1"),
        "#" + "é" * (MAX_CUBE_BYTES // 2) + "\n" + IDENTITY,
        "DOMAIN_MIN -1e308 0 0\nDOMAIN_MAX 1e308 1 1\n" + IDENTITY,
    ]:
        with pytest.raises(ValueError):
            parse_cube(text)
    with pytest.raises(ValueError, match="missing"):
        LutSetup.from_config({**setup.to_config(), "version": 3, "imported_lut": None})
    with pytest.raises(ValueError, match="version 3"):
        LutSetup.from_config({**setup.to_config(), "version": 1})


@pytest.mark.parametrize("size", [17, 33, 65])
def test_sampled_marker_edges_are_measured_not_promised_exact(tmp_path, size):
    text = "LUT_3D_SIZE 2\n" + "\n".join(["0 0 0"] * 8)
    setup = LutSetup(
        "Panasonic V-Log",
        "Rec.709",
        cube_size=size,
        ire_basis="camera",
        imported_lut=imported(text),
        bands=[dict(stop=0, width=0.25, color="#ffffff")],
        output_filename=str(tmp_path / "edge.cube"),
    )
    lut = colour.read_LUT(str(generate_lut(setup)))
    assert isinstance(lut, colour.LUT3D)
    x = np.linspace(0, 1, 20001)
    rgb = np.column_stack([x] * 3)
    actual = lut.apply(
        rgb, interpolator=colour.algebra.table_interpolation_tetrahedral
    )[:, 0]
    stop = np.log2(
        np.maximum(colour.models.log_decoding(x, function="V-Log"), 1e-6) / 0.18
    )
    support = stop[actual > 0.01]
    peak = float(actual.max())
    edge = None if not len(support) else [float(support[0]), float(support[-1])]
    print(f"EDGE size={size} half_width=.25 peak={peak:.6f} support_stops={edge}")
    assert np.isfinite(actual).all()
    if len(support):
        assert support[-1] - support[0] > 0.5
    setup.bands = [dict(stop=0, width=0.001, color="#ffffff")]
    narrow = colour.read_LUT(str(generate_lut(setup)))
    assert isinstance(narrow, colour.LUT3D)
    neutral = np.array([narrow.table[i, i, i, 0] for i in range(size)])
    print(
        f"NARROW size={size} half_width=.001 neutral_nodes_hit={np.count_nonzero(neutral)}"
    )
    assert not np.count_nonzero(neutral)
