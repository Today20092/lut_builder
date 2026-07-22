# src/lut_builder/engine.py

import colour
import numpy as np
from datetime import datetime
from pathlib import Path
from .data import (
    MIDDLE_GREY,
    PROFILE_CATALOG,
    hex_to_rgb,
)
from .setup import LutSetup, map_exposure


def _srgb_overlay_to_target(hex_code: str, target, target_space) -> np.ndarray:
    """Convert an sRGB hex color to the target gamut and transfer function."""
    srgb_values = np.asarray(hex_to_rgb(hex_code))
    if target.gamut == "ITU-R BT.709":
        return srgb_values
    srgb = colour.RGB_COLOURSPACES["sRGB"]
    linear_srgb = colour.cctf_decoding(srgb_values, function="sRGB")
    target_linear = colour.RGB_to_RGB(linear_srgb, srgb, target_space)
    if target.encoding == "oetf":
        return colour.models.oetf(target_linear, function=target.transfer)
    return colour.models.log_encoding(target_linear, function=target.transfer)


def generate_lut(setup: LutSetup) -> Path:
    profile_name = setup.profile_name
    target_name = setup.target_name
    cube_size = setup.cube_size
    bands = setup.bands
    band_mode = setup.band_mode
    low_signal_warning = setup.low_signal_warning
    low_signal_hex = setup.low_signal_hex
    high_signal_warning = setup.high_signal_warning
    high_signal_hex = setup.high_signal_hex
    monochrome = setup.monochrome
    output_filename = setup.output_filename
    legal_range = setup.legal_range
    fill_mode = setup.fill_mode
    profile = PROFILE_CATALOG.source(profile_name)
    target = PROFILE_CATALOG.target(target_name)

    # ------------------------------------------------------------------
    # 1. Initialize LUT
    # ------------------------------------------------------------------
    lut = colour.LUT3D(size=cube_size)
    lut.name = f"{profile_name} to {target_name} Custom Assist"
    samples = lut.table.reshape(-1, 3)

    # ------------------------------------------------------------------
    # 2. Colour spaces
    # ------------------------------------------------------------------
    src_cs = colour.RGB_COLOURSPACES[profile.gamut]
    tgt_cs = colour.RGB_COLOURSPACES[target.gamut]

    # ------------------------------------------------------------------
    # 3. Log -> scene-linear
    # The library guarantees that whatever the camera's log encoding maps
    # to middle grey will decode to exactly MIDDLE_GREY (0.18) in
    # scene-linear space — no per-camera config is needed for this.
    # ------------------------------------------------------------------
    linear_data = colour.models.log_decoding(samples, function=profile.log)

    # ------------------------------------------------------------------
    # 4. Scene luminance -> stops
    #
    # Convert scene-linear RGB to CIE XYZ using the *source* colourspace's
    # own primary matrix, then extract Y (the luminance channel).
    #
    # This is correct because the linear data is still in the camera's
    # native wide gamut.  Applying Rec.709 luma weights (0.2126, 0.7152,
    # 0.0722) directly would be wrong — those coefficients only describe
    # Rec.709 primaries, not S-Gamut3.Cine / V-Gamut / etc.
    #
    # CIE Y is gamut-independent: the same physical light produces the
    # same Y regardless of which RGB encoding carries it.
    # ------------------------------------------------------------------
    # The second row of the RGB-to-XYZ matrix contains the Y (luminance)
    # coefficients for this colourspace's primaries.  A direct dot product
    # is simpler and avoids colour.RGB_to_XYZ API version differences.
    Y = np.dot(linear_data, src_cs.matrix_RGB_to_XYZ[1, :])
    stops = np.log2(np.maximum(Y, 1e-6) / MIDDLE_GREY)

    # ------------------------------------------------------------------
    # 5. Gamut transform (wide camera gamut -> target display gamut)
    #    Done in linear light before applying any transfer function.
    # ------------------------------------------------------------------
    rgb_linear_tgt = colour.RGB_to_RGB(linear_data, src_cs, tgt_cs)

    # ------------------------------------------------------------------
    # 5b. Optional monochrome base image
    #
    # Standard false color monitors desaturate the underlying image so
    # the colored bands pop against a neutral background.
    #
    # We derive CIE Y from the *target*-gamut linear data and set
    # R = G = B = Y.  For any properly normalised colourspace the second
    # row of matrix_RGB_to_XYZ sums to 1.0, so [Y, Y, Y] reproduces
    # the correct luminance and maps to a perfectly neutral grey.
    # ------------------------------------------------------------------
    if monochrome and not fill_mode:
        Y_tgt = np.dot(rgb_linear_tgt, tgt_cs.matrix_RGB_to_XYZ[1, :])
        rgb_linear_tgt = np.column_stack([Y_tgt, Y_tgt, Y_tgt])

    # ------------------------------------------------------------------
    # 6. Apply display transfer function
    # Rec.709 and Rec.2020 use an OETF (optical-to-electrical), not a
    # log encoding. Using log_encoding() here was the original bug —
    # it would silently apply the wrong curve and shift all values.
    # ------------------------------------------------------------------
    encoding = target.encoding
    if encoding == "oetf":
        final_data = colour.models.oetf(rgb_linear_tgt, function=target.transfer)
    else:
        final_data = colour.models.log_encoding(rgb_linear_tgt, method=target.transfer)

    # ------------------------------------------------------------------
    # 6b. Compute IRE values (only when band_mode == "ire")
    #
    # IRE is the display signal level as a percentage (0–100).
    # We compute display-domain luma (Y') from the gamma-encoded output
    # using the *target* colourspace's luminance coefficients — the
    # second row of its RGB-to-XYZ matrix.
    #
    # For Rec.709 this gives [0.2126, 0.7152, 0.0722]; for Rec.2020
    # it gives [0.2627, 0.6780, 0.0593] — always correct for the
    # target in use without hardcoding.
    # ------------------------------------------------------------------
    if band_mode == "ire":
        tgt_luma_weights = tgt_cs.matrix_RGB_to_XYZ[1, :]
        ire = np.dot(final_data, tgt_luma_weights) * 100.0

    # ------------------------------------------------------------------
    # 7. Apply false color bands (in order — last wins on overlap)
    #
    # In "stops" mode, bands are centered on a stop value relative to
    # 18% middle grey.  In "ire" mode, bands target a specific
    # display signal level (0–100 IRE) on the final output curve.
    # ------------------------------------------------------------------
    band_values = ire if band_mode == "ire" else stops

    # ------------------------------------------------------------------
    # 8. Encoded-signal warnings
    #
    # These configurable code-value thresholds flag the encoded LUT input.
    # They cannot prove physical sensor clipping from processed RGB.
    #
    # Because a 33-pt LUT has evenly-spaced nodes that rarely land exactly
    # on the thresholds, we apply a small tolerance (half a grid step)
    # so the warnings render solidly on-screen.
    # ------------------------------------------------------------------
    signal_ceiling = profile.encoded_signal_ceiling
    signal_floor = profile.encoded_signal_floor
    grid_step = 1.0 / (cube_size - 1)
    warning_tolerance = grid_step / 2.0

    low_mask = None
    if low_signal_warning:
        channel_min = np.min(samples, axis=1)
        low_mask = channel_min <= (signal_floor + warning_tolerance)

    high_mask = None
    if high_signal_warning:
        channel_max = np.max(samples, axis=1)
        high_mask = channel_max >= (signal_ceiling - warning_tolerance)

    overlay_colors = map_exposure(
        band_values,
        setup,
        low_signal_mask=low_mask,
        high_signal_mask=high_mask,
    )
    for color in dict.fromkeys(
        [band["color"] for band in bands] + [low_signal_hex, high_signal_hex]
    ):
        if color:
            final_data[overlay_colors == color] = _srgb_overlay_to_target(
                color, target, tgt_cs
            )

    # ------------------------------------------------------------------
    # 9. Build comment header
    # colour.LUT3D.comments is a list of strings written as '# ...' lines
    # at the top of the .cube file — readable in any text editor and
    # visible in Resolve's LUT browser tooltip.
    # ------------------------------------------------------------------
    comments = [
        f"Generated   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "Tool        : lut-builder  https://github.com/Today20092/lut_builder",
        f"Cube size   : {cube_size}x{cube_size}x{cube_size}",
        f"Monochrome  : {'yes' if monochrome else 'no'}",
        f"Output range: {'Legal (64-940)' if legal_range else 'Full (0-1023)'}",
        (
            "IRE         : 0=code 64, 100=code 940 (legal-range convention)"
            if legal_range
            else "IRE         : 0=code 0, 100=code 1023 (full-range convention)"
        ),
        "Purpose     : diagnostic scene-exposure transform; not a finished viewing transform",
        "",
        f"Source      : {profile_name}",
        f"  Gamut     : {profile.gamut}",
        f"  Log       : {profile.log}",
        f"  Signal low: {signal_floor:.3f}  (encoded-signal warning threshold)",
        f"  Signal high: {signal_ceiling:.3f}  (encoded-signal warning threshold)",
        "",
        f"Target      : {target_name}",
        f"  Gamut     : {target.gamut}",
        f"  Transfer  : {target.transfer} ({target.encoding.upper()})",
        "",
    ]

    sources = profile.sources
    if sources:
        comments.append("References  :")
        for url in sources:
            comments.append(f"  {url}")
        comments.append("")

    mode_label = "IRE" if band_mode == "ire" else "Stops"
    fill_label = " [Fill]" if fill_mode else ""
    if bands:
        comments.append(f"False Color Bands ({mode_label}{fill_label}):")
        for band in sorted(bands, key=lambda b: b["stop"]):
            if fill_mode:
                if band_mode == "ire":
                    comments.append(
                        f"  {band['stop']:.0f} IRE  ->  {band['color']}  (fill zone)"
                    )
                else:
                    sign = "+" if band["stop"] >= 0 else ""
                    comments.append(
                        f"  Stop {sign}{band['stop']:.1f}  ->  {band['color']}  (fill zone)"
                    )
            elif band_mode == "ire":
                comments.append(
                    f"  {band['stop']:.0f} IRE  "
                    f"+/-{band['width']:.0f} IRE  ->  {band['color']}"
                )
            else:
                sign = "+" if band["stop"] >= 0 else ""
                comments.append(
                    f"  Stop {sign}{band['stop']:.1f}  "
                    f"+/-{band['width']:.2f} stops  ->  {band['color']}"
                )
    else:
        comments.append("False Color Bands: none")

    comments.append("")

    warning_lines = []
    if low_signal_warning and low_signal_hex:
        warning_lines.append(f"  Low channel  ->  {low_signal_hex}")
    if high_signal_warning and high_signal_hex:
        warning_lines.append(f"  High channel ->  {high_signal_hex}")

    if warning_lines:
        comments.append("Encoded-Signal Warnings (any channel crossing threshold):")
        comments.extend(warning_lines)
    else:
        comments.append("Encoded-Signal Warnings: none")

    lut.comments = comments

    # ------------------------------------------------------------------
    # 10. Optional legal/video range scaling
    #
    # Scales the full-range [0, 1] output to the broadcast legal window:
    #   10-bit codes 64–940 out of 1023  →  [64/1023, 940/1023]
    #
    # Applied after all false color and warning overlays so those colors
    # are also correctly scaled (a warning color at #ff0000 will
    # land at the legal-range equivalent, not full-range 1.0).
    # ------------------------------------------------------------------
    if legal_range:
        legal_low = 64 / 1023   # ≈ 0.0626
        legal_high = 940 / 1023  # ≈ 0.9189
        final_data = final_data * (legal_high - legal_low) + legal_low

    # ------------------------------------------------------------------
    # 11. Write .cube file
    # ------------------------------------------------------------------
    lut.table = (
        np.clip(final_data, 0, 1)
        .reshape(cube_size, cube_size, cube_size, 3)
        .astype(np.float32)
    )

    output_path = Path(output_filename)
    colour.write_LUT(lut, str(output_path))
    return output_path
