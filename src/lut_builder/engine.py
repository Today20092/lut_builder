import colour
import numpy as np
from datetime import datetime
from pathlib import Path
from .data import (
    CAMERA_PROFILES,
    TARGET_PROFILES,
    MIDDLE_GREY,
    LUMA_WEIGHTS,
    hex_to_rgb,
)


def generate_lut(
    profile_name: str,
    target_name: str,
    cube_size: int,
    bands: list[dict],
    black_clip: bool,
    black_hex: str,
    white_clip: bool,
    white_hex: str,
    output_filename: str,
    opacity: float = 1.0,
    clip_tolerance: float = 0.05,
) -> Path:
    profile = CAMERA_PROFILES[profile_name]
    target = TARGET_PROFILES[target_name]

    # 1. Initialize LUT
    lut = colour.LUT3D(size=cube_size)
    lut.name = f"{profile_name} to {target_name} Custom Assist"
    samples = lut.table.reshape(-1, 3)

    # 2. Colour spaces
    src_cs = colour.RGB_COLOURSPACES[profile["gamut"]]
    tgt_cs = colour.RGB_COLOURSPACES[target["gamut"]]

    # 3. Log → scene-linear
    linear_data = colour.models.log_decoding(samples, method=profile["log"])

    # 4. Perceptual luminance → stops (used for bands, but not absolute clipping)
    luma = np.dot(linear_data, LUMA_WEIGHTS)
    stops = np.log2(np.maximum(luma, 1e-6) / MIDDLE_GREY)

    # 5. Gamut transform & PRE-OETF Gamut Clipping
    # Prevent negative values from wide gamuts blowing up the math
    rgb_linear_tgt = colour.RGB_to_RGB(linear_data, src_cs, tgt_cs)
    rgb_linear_tgt = np.clip(rgb_linear_tgt, 0.0, None)

    # 6. Apply display transfer function
    encoding = target.get("encoding", "oetf")
    if encoding == "oetf":
        final_data = colour.models.oetf(rgb_linear_tgt, function=target["gamma"])
    else:
        final_data = colour.models.log_encoding(rgb_linear_tgt, method=target["gamma"])

    # 7. Apply false color bands with OPACITY
    for band in bands:
        stop = band["stop"]
        width = band["width"]
        rgb = np.array(hex_to_rgb(band["color"]))
        mask = (stops >= (stop - width)) & (stops <= (stop + width))

        # Blend the false color over the base image
        final_data[mask] = (final_data[mask] * (1.0 - opacity)) + (rgb * opacity)

    # 8. Clipping indicators (Channel-based, not Luma-based)
    # White Clip: Any channel hits the top threshold
    max_linear = colour.models.log_decoding(
        np.array([[1.0, 1.0, 1.0]]), method=profile["log"]
    )
    max_luma = float(np.dot(max_linear[0], LUMA_WEIGHTS))
    max_stops_in_domain = np.log2(max(max_luma, 1e-6) / MIDDLE_GREY)
    effective_white_clip = min(profile["white_clip_stops"], max_stops_in_domain)

    # Calculate linear thresholds
    white_lin_target = MIDDLE_GREY * (2**effective_white_clip)
    white_threshold = white_lin_target * (1.0 - clip_tolerance)

    black_lin_target = MIDDLE_GREY * (2 ** profile["black_clip_stops"])
    black_threshold = black_lin_target + (black_lin_target * clip_tolerance)

    if black_clip and black_hex:
        black_rgb = hex_to_rgb(black_hex)
        # Check if the MINIMUM channel is below the black threshold
        min_channels = np.min(linear_data, axis=1)
        black_mask = min_channels <= black_threshold
        final_data[black_mask] = black_rgb

    if white_clip and white_hex:
        white_rgb = hex_to_rgb(white_hex)
        # Check if the MAXIMUM channel is above the white threshold
        max_channels = np.max(linear_data, axis=1)
        white_mask = max_channels >= white_threshold
        final_data[white_mask] = white_rgb

    # 9. Build comment header
    comments = [
        f"Generated   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "Tool        : lut-builder",
        f"Cube size   : {cube_size}³",
        "",
        f"Source      : {profile_name}",
        f"  Gamut     : {profile['gamut']}",
        f"  Log       : {profile['log']}",
        f"  Black clip: {profile['black_clip_stops']:+.1f} stops (tol: {clip_tolerance * 100:.0f}%)",
        f"  White clip: {effective_white_clip:+.2f} stops (tol: {clip_tolerance * 100:.0f}%)",
        "",
        f"Target      : {target_name}",
        f"  Gamut     : {target['gamut']}",
        f"  Transfer  : {target['gamma']} ({target.get('encoding', 'oetf').upper()})",
        "",
        f"Overlay Opac: {opacity * 100:.0f}%",
        "",
    ]

    if bands:
        comments.append("False Color Bands:")
        for band in sorted(bands, key=lambda b: b["stop"]):
            sign = "+" if band["stop"] >= 0 else ""
            comments.append(
                f"  Stop {sign}{band['stop']:.1f}  "
                f"±{band['width']:.2f} stops  →  {band['color']}"
            )
    else:
        comments.append("False Color Bands: none")

    comments.append("")

    clip_lines = []
    if black_clip and black_hex:
        clip_lines.append(f"  Crushed blacks  →  {black_hex}")
    if white_clip and white_hex:
        clip_lines.append(f"  Clipped whites  →  {white_hex}")

    if clip_lines:
        comments.append("Clipping Indicators:")
        comments.extend(clip_lines)
    else:
        comments.append("Clipping Indicators: none")

    lut.comments = comments

    # 10. Write .cube file
    lut.table = (
        np.clip(final_data, 0, 1)
        .reshape(cube_size, cube_size, cube_size, 3)
        .astype(np.float32)
    )

    output_path = Path(output_filename)
    colour.write_LUT(lut, str(output_path))
    return output_path
