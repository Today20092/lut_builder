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
    low_signal_warning: bool = False
    low_signal_hex: str = ""
    high_signal_warning: bool = False
    high_signal_hex: str = ""
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
            (self.low_signal_warning, self.low_signal_hex, "low_signal_hex"),
            (self.high_signal_warning, self.high_signal_hex, "high_signal_hex"),
        ):
            if enabled and not HEX_COLOR.fullmatch(color):
                raise ValueError(f"{name} must be a hex color when its warning is enabled")

    @classmethod
    def from_config(cls, config: Mapping[str, Any]) -> "LutSetup":
        aliases = {
            "cube_size": "cube_size",
            "bands": "bands",
            "band_mode": "band_mode",
            "black_clip": "low_signal_warning",
            "black_hex": "low_signal_hex",
            "white_clip": "high_signal_warning",
            "white_hex": "high_signal_hex",
            "low_signal_warning": "low_signal_warning",
            "low_signal_hex": "low_signal_hex",
            "high_signal_warning": "high_signal_warning",
            "high_signal_hex": "high_signal_hex",
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
            "low_signal_warning": self.low_signal_warning,
            "low_signal_hex": self.low_signal_hex,
            "high_signal_warning": self.high_signal_warning,
            "high_signal_hex": self.high_signal_hex,
            "monochrome": self.monochrome,
            "legal_range": self.legal_range,
            "output": self.output_filename,
        }


def map_exposure(
    values: np.ndarray,
    setup: LutSetup,
    *,
    low_signal_mask: np.ndarray | None = None,
    high_signal_mask: np.ndarray | None = None,
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

    if setup.low_signal_warning and low_signal_mask is not None:
        colors[np.asarray(low_signal_mask)] = setup.low_signal_hex
    if setup.high_signal_warning and high_signal_mask is not None:
        colors[np.asarray(high_signal_mask)] = setup.high_signal_hex
    return colors


def exposure_preview(setup: LutSetup) -> dict:
    """Return the same exposure-axis preview used by CLI and browser clients."""
    width = 64
    if setup.band_mode == "ire":
        minimum, maximum = 0.0, 100.0
    else:
        minimum, maximum = -7.0, 7.0

    values = np.linspace(minimum, maximum, width)
    width_buffer = ((maximum - minimum) / (width - 1)) / 2.0
    colors = map_exposure(values, setup, width_buffer=width_buffer)
    return {
        "minimum": minimum,
        "maximum": maximum,
        "unit": "IRE" if setup.band_mode == "ire" else "stops",
        "values": values.tolist(),
        "colors": [color or "#3f3f46" for color in colors],
        "width_buffer": width_buffer,
    }
