# src/lut_builder/engine.py

import colour
import numpy as np
from datetime import datetime
from pathlib import Path
from .data import (
    CAMERA_PROFILES,
    TARGET_PROFILES,
    MIDDLE_GREY,
    hex_to_rgb,
)


def generate_lut(
    profile_name: str,
    target_name: str,
    cube_size: int,
    bands: list[dict],
    # Each dict: {"stop": float, "color": "#rrggbb", "width": float}
    # Bands are applied in order — later entries overwrite earlier ones on overlap.
    band_mode: str,  # "stops" or "ire"
    black_clip: bool,
    black_hex: str,
    white_clip: bool,
    white_hex: str,
    monochrome: bool,
    output_filename: str,
    legal_range: bool = False,
) -> Path:
    profile = CAMERA_PROFILES[profile_name]
    target = TARGET_PROFILES[target_name]

    # ------------------------------------------------------------------
    # 1. Initialize LUT
    # ------------------------------------------------------------------
    lut = colour.LUT3D(size=cube_size)
    lut.name = f"{profile_name} to {target_name} Custom Assist"
    samples = lut.table.reshape(-1, 3)

    # ------------------------------------------------------------------
    # 2. Colour spaces
    # ------------------------------------------------------------------
    src_cs = colour.RGB_COLOURSPACES[profile["gamut"]]
    tgt_cs = colour.RGB_COLOURSPACES[target["gamut"]]

    # ------------------------------------------------------------------
    # 3. Log -> scene-linear
    # The library guarantees that whatever the camera's log encoding maps
    # to middle grey will decode to exactly MIDDLE_GREY (0.18) in
    # scene-linear space — no per-camera config is needed for this.
    # ------------------------------------------------------------------
    linear_data = colour.models.log_decoding(samples, method=profile["log"])

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
    if monochrome:
        Y_tgt = np.dot(rgb_linear_tgt, tgt_cs.matrix_RGB_to_XYZ[1, :])
        rgb_linear_tgt = np.column_stack([Y_tgt, Y_tgt, Y_tgt])

    # ------------------------------------------------------------------
    # 6. Apply display transfer function
    # Rec.709 and Rec.2020 use an OETF (optical-to-electrical), not a
    # log encoding. Using log_encoding() here was the original bug —
    # it would silently apply the wrong curve and shift all values.
    # ------------------------------------------------------------------
    encoding = target.get("encoding", "oetf")
    if encoding == "oetf":
        final_data = colour.models.oetf(rgb_linear_tgt, function=target["gamma"])
    else:
        final_data = colour.models.log_encoding(rgb_linear_tgt, method=target["gamma"])

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

    for band in bands:
        center = band["stop"]  # stop value or IRE target
        width = band["width"]
        rgb = hex_to_rgb(band["color"])
        mask = (band_values >= (center - width)) & (band_values <= (center + width))
        final_data[mask] = rgb

    # ------------------------------------------------------------------
    # 8. Clipping indicators — based on raw log signal, NOT linear stops
    #
    # Physical sensor clipping is a property of the raw digital signal.
    # Each camera profile defines log_ceiling / log_floor: the code-value
    # limits (0.0–1.0) beyond which the sensor has run out of data.
    #
    # We evaluate clipping against the *samples* array (the raw log input
    # grid), not the decoded linear data, because linear-domain thresholds
    # can miss real sensor saturation.
    #
    # Because a 33-pt LUT has evenly-spaced nodes that rarely land exactly
    # on the ceiling/floor, we apply a small tolerance (half a grid step)
    # so the clip bands render solidly on-screen.
    # ------------------------------------------------------------------
    log_ceiling = profile.get("log_ceiling", 1.0)
    log_floor = profile.get("log_floor", 0.0)
    grid_step = 1.0 / (cube_size - 1)
    clip_tol = grid_step / 2.0

    if black_clip and black_hex:
        black_rgb = hex_to_rgb(black_hex)
        # Clip when the minimum channel sits at or below the sensor floor
        channel_min = np.min(samples, axis=1)
        black_mask = channel_min <= (log_floor + clip_tol)
        final_data[black_mask] = black_rgb

    if white_clip and white_hex:
        white_rgb = hex_to_rgb(white_hex)
        # Clip when the maximum channel hits or exceeds the sensor ceiling
        channel_max = np.max(samples, axis=1)
        white_mask = channel_max >= (log_ceiling - clip_tol)
        final_data[white_mask] = white_rgb

    # ------------------------------------------------------------------
    # 9. Build comment header
    # colour.LUT3D.comments is a list of strings written as '# ...' lines
    # at the top of the .cube file — readable in any text editor and
    # visible in Resolve's LUT browser tooltip.
    # ------------------------------------------------------------------
    comments = [
        f"Generated   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "Tool        : lut-builder  https://github.com/your-username/lut-builder",
        f"Cube size   : {cube_size}x{cube_size}x{cube_size}",
        f"Monochrome  : {'yes' if monochrome else 'no'}",
        f"Output range: {'Legal (64-940)' if legal_range else 'Full (0-1023)'}",
        "",
        f"Source      : {profile_name}",
        f"  Gamut     : {profile['gamut']}",
        f"  Log       : {profile['log']}",
        f"  Log floor : {log_floor:.3f}  (sensor digital black)",
        f"  Log ceil  : {log_ceiling:.3f}  (sensor digital ceiling)",
        "",
        f"Target      : {target_name}",
        f"  Gamut     : {target['gamut']}",
        f"  Transfer  : {target['gamma']} ({target.get('encoding', 'oetf').upper()})",
        "",
    ]

    mode_label = "IRE" if band_mode == "ire" else "Stops"
    if bands:
        comments.append(f"False Color Bands ({mode_label}):")
        for band in sorted(bands, key=lambda b: b["stop"]):
            if band_mode == "ire":
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

    clip_lines = []
    if black_clip and black_hex:
        clip_lines.append(f"  Crushed blacks  ->  {black_hex}")
    if white_clip and white_hex:
        clip_lines.append(f"  Clipped whites  ->  {white_hex}")

    if clip_lines:
        comments.append("Clipping Indicators:")
        comments.extend(clip_lines)
    else:
        comments.append("Clipping Indicators: none")

    lut.comments = comments

    # ------------------------------------------------------------------
    # 10. Optional legal/video range scaling
    #
    # Scales the full-range [0, 1] output to the broadcast legal window:
    #   10-bit codes 64–940 out of 1023  →  [64/1023, 940/1023]
    #
    # Applied after all false color and clip overlays so those colors
    # are also correctly scaled (a clipping indicator at #ff0000 will
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
