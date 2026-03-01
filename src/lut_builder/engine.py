# src/lut_builder/engine.py

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
    # Each dict: {"stop": float, "color": "#rrggbb", "width": float}
    # Bands are applied in order — later entries overwrite earlier ones on overlap.
    black_clip: bool,
    black_hex: str,
    white_clip: bool,
    white_hex: str,
    output_filename: str,
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
    # 3. Log → scene-linear
    # The library guarantees that whatever the camera's log encoding maps
    # to middle grey will decode to exactly MIDDLE_GREY (0.18) in
    # scene-linear space — no per-camera config is needed for this.
    # ------------------------------------------------------------------
    linear_data = colour.models.log_decoding(samples, method=profile["log"])

    # ------------------------------------------------------------------
    # 4. Perceptual luminance → stops
    # ITU-R BT.709 weights (in data.py as LUMA_WEIGHTS) rather than a
    # simple RGB mean. A plain mean treats all three channels as equally
    # bright, which does not match human vision.
    #
    #   +1 stop → luma = 0.36  → log2(0.36 / 0.18) =  1.0
    #   -1 stop → luma = 0.09  → log2(0.09 / 0.18) = -1.0
    # ------------------------------------------------------------------
    luma = np.dot(linear_data, LUMA_WEIGHTS)
    stops = np.log2(np.maximum(luma, 1e-6) / MIDDLE_GREY)

    # ------------------------------------------------------------------
    # 5. Gamut transform (wide camera gamut → target display gamut)
    #    Done in linear light before applying any transfer function.
    # ------------------------------------------------------------------
    rgb_linear_tgt = colour.RGB_to_RGB(linear_data, src_cs, tgt_cs)

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
    # 7. Apply false color bands (in order — last wins on overlap)
    # ------------------------------------------------------------------
    for band in bands:
        stop = band["stop"]
        width = band["width"]
        rgb = hex_to_rgb(band["color"])
        mask = (stops >= (stop - width)) & (stops <= (stop + width))
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
        f"Cube size   : {cube_size}³",
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

    # ------------------------------------------------------------------
    # 10. Write .cube file
    # ------------------------------------------------------------------
    lut.table = (
        np.clip(final_data, 0, 1)
        .reshape(cube_size, cube_size, cube_size, 3)
        .astype(np.float32)
    )

    output_path = Path(output_filename)
    colour.write_LUT(lut, str(output_path))
    return output_path
