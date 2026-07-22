from dataclasses import dataclass, field
import re
from typing import Any, Mapping

import numpy as np

from .data import PROFILE_CATALOG


CUBE_SIZES = {17, 33, 65}
HEX_COLOR = re.compile(r"#[0-9a-fA-F]{6}$")


@dataclass
class LutSetup:
    profile_name: str
    target_name: str
    cube_size: int = 33
    bands: list[dict] = field(default_factory=list)
    band_mode: str = "stops"
    black_clip: bool = False
    black_hex: str = ""
    white_clip: bool = False
    white_hex: str = ""
    monochrome: bool = False
    output_filename: str = ""
    legal_range: bool = False
    fill_mode: bool = False

    def __post_init__(self) -> None:
        if self.profile_name not in PROFILE_CATALOG.source_names():
            raise ValueError(f"unknown profile: {self.profile_name}")
        if self.target_name not in PROFILE_CATALOG.target_names():
            raise ValueError(f"unknown target: {self.target_name}")
        if self.cube_size not in CUBE_SIZES:
            raise ValueError(f"cube_size must be one of {sorted(CUBE_SIZES)}")
        if self.band_mode not in {"stops", "ire"}:
            raise ValueError("band_mode must be 'stops' or 'ire'")
        if not self.output_filename:
            self.output_filename = (
                f"{self.profile_name.replace(' ', '')}_Custom.cube"
            )

        normalized = []
        for band in self.bands:
            try:
                center = float(band["stop"])
                width = float(band.get("width", 0.0))
                color = band["color"]
            except (KeyError, TypeError, ValueError) as error:
                raise ValueError("each band needs numeric stop/width and a color") from error
            if width < 0:
                raise ValueError("band width cannot be negative")
            if self.band_mode == "ire" and not 0 <= center <= 100:
                raise ValueError("IRE band stop must be between 0 and 100")
            if not isinstance(color, str) or not HEX_COLOR.fullmatch(color):
                raise ValueError(f"invalid band color: {color!r}")
            normalized.append({"stop": center, "color": color.lower(), "width": width})
        self.bands = normalized

        for enabled, color, name in (
            (self.black_clip, self.black_hex, "black_hex"),
            (self.white_clip, self.white_hex, "white_hex"),
        ):
            if enabled and not HEX_COLOR.fullmatch(color):
                raise ValueError(f"{name} must be a hex color when clipping is enabled")

    @classmethod
    def from_config(cls, config: Mapping[str, Any]) -> "LutSetup":
        aliases = {
            "cube_size": "cube_size",
            "bands": "bands",
            "band_mode": "band_mode",
            "black_clip": "black_clip",
            "black_hex": "black_hex",
            "white_clip": "white_clip",
            "white_hex": "white_hex",
            "monochrome": "monochrome",
            "output": "output_filename",
            "legal_range": "legal_range",
            "fill_mode": "fill_mode",
        }
        values = {
            attribute: config[key]
            for key, attribute in aliases.items()
            if key in config
        }
        if values.get("band_mode") == "fill":
            values["band_mode"] = "stops"
            values.setdefault("fill_mode", True)
        return cls(config["profile"], config["target"], **values)

    def to_config(self) -> dict:
        return {
            "profile": self.profile_name,
            "target": self.target_name,
            "cube_size": self.cube_size,
            "bands": self.bands,
            "band_mode": self.band_mode,
            "fill_mode": self.fill_mode,
            "black_clip": self.black_clip,
            "black_hex": self.black_hex,
            "white_clip": self.white_clip,
            "white_hex": self.white_hex,
            "monochrome": self.monochrome,
            "legal_range": self.legal_range,
            "output": self.output_filename,
        }


def map_exposure(
    values: np.ndarray,
    setup: LutSetup,
    *,
    black_clip_mask: np.ndarray | None = None,
    white_clip_mask: np.ndarray | None = None,
    width_buffer: float = 0.0,
) -> np.ndarray:
    """Return the configured overlay color for each exposure value."""
    values = np.asarray(values)
    colors = np.full(values.shape, None, dtype=object)

    if setup.fill_mode and setup.bands:
        bands = sorted(setup.bands, key=lambda band: band["stop"])
        centers = np.array([band["stop"] for band in bands])
        nearest = np.argmin(np.abs(values[..., None] - centers), axis=-1)
        for index, band in enumerate(bands):
            colors[nearest == index] = band["color"]
    else:
        for band in setup.bands:
            width = band["width"] + width_buffer
            mask = (values >= band["stop"] - width) & (
                values <= band["stop"] + width
            )
            colors[mask] = band["color"]

    if setup.black_clip and black_clip_mask is not None:
        colors[np.asarray(black_clip_mask)] = setup.black_hex
    if setup.white_clip and white_clip_mask is not None:
        colors[np.asarray(white_clip_mask)] = setup.white_hex
    return colors
