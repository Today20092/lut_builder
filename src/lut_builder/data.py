# src/lut_builder/data.py

import colour
import numpy as np
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import cast

# ---------------------------------------------------------------------------
# Universal Constants
# ---------------------------------------------------------------------------

MIDDLE_GREY = 0.18

# ITU-R BT.709 luminance coefficients.
LUMA_WEIGHTS = np.array([0.2126, 0.7152, 0.0722])

# ---------------------------------------------------------------------------
# Camera Profiles
#
# Each profile may include an optional "sources" list of URLs or document
# titles citing where the numeric values (warning thresholds, stop ranges) were
# derived from. Add or extend this list when referencing a new spec sheet.
# ---------------------------------------------------------------------------

_SOURCE_DATA = {
    "Sony S-Log3": {
        "gamut": "S-Gamut3.Cine",
        "log": "S-Log3",
        "encoded_signal_ceiling": 0.94,
        "encoded_signal_floor": 0.0929,
        "sources": [
            "https://pro.sony/s3/cms-static-content/uploadfile/06/1237494271406.pdf",
        ],
    },
    "Panasonic V-Log": {
        "gamut": "V-Gamut",
        "log": "V-Log",
        "encoded_signal_ceiling": 0.8906,
        "encoded_signal_floor": 0.1251,
        "sources": [
            "https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf",
        ],
    },
    "Canon Log 3": {
        "gamut": "Cinema Gamut",
        "log": "Canon Log 3",
        "encoded_signal_ceiling": 0.90,
        "encoded_signal_floor": 0.04,
        "sources": [
            "https://downloads.canon.com/nw/camera/products/cinema-eos/c300-mark-ii/white-papers/canon-c300-mk-ii-image-performance-wp.pdf"
        ],
    },
    "ARRI LogC3": {
        "gamut": "ARRI Wide Gamut 3",
        "log": "ARRI LogC3",
        "encoded_signal_ceiling": 0.91,
        "encoded_signal_floor": 0.03,
        "sources": [
            "https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2012-01-arrilog-c-logarithmic-cine-camera-image-encoding-data.pdf",
        ],
    },
    "RED Log3G10": {
        "gamut": "REDWideGamutRGB",
        "log": "Log3G10",
        "encoded_signal_ceiling": 1.0,
        "encoded_signal_floor": 0.0,
        "sources": [
            "https://www.red.com/download/ipp2-technical-paper",
        ],
    },
}

_TARGET_DATA = {
    "Rec.709": {
        "gamut": "ITU-R BT.709",
        "gamma": "ITU-R BT.709",
        "encoding": "oetf",
    },
    "Rec.2020": {
        "gamut": "ITU-R BT.2020",
        "gamma": "ITU-R BT.2020",
        "encoding": "oetf",
    },
}

# ---------------------------------------------------------------------------
# Color Helpers
# ---------------------------------------------------------------------------


def hex_to_rgb(hex_code: str) -> list[float]:
    """Converts '#RRGGBB' to a [r, g, b] list of 0.0-1.0 floats."""
    hex_code = hex_code.lstrip("#")
    if len(hex_code) != 6:
        raise ValueError("Hex code must be 6 characters long.")
    return [int(hex_code[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]


def oklch_to_hex(L: float, C: float, H: float) -> str:
    """
    Converts an OKLCH color to the nearest sRGB hex string.

    Uses direct colour-science functions instead of colour.convert() to avoid
    requiring the optional networkx dependency (colour.convert uses a graph
    router that needs networkx installed).

    Conversion path:
      OKLCH → OKLab (manual trig)
      OKLab → XYZ D65  (colour.models.Oklab_to_XYZ)
      XYZ D65 → sRGB   (colour.XYZ_to_sRGB, applies OETF internally)

    Out-of-gamut values are clipped to 0-1, matching browser behavior when
    displaying wide-gamut OKLCH colors on an sRGB display.
    """
    # OKLCH → OKLab
    H_rad = np.deg2rad(H)
    a = C * np.cos(H_rad)
    b = C * np.sin(H_rad)
    oklab = np.array([L, a, b])

    # OKLab → XYZ D65
    xyz = colour.models.Oklab_to_XYZ(oklab)

    # XYZ D65 → sRGB (gamma-encoded, not linear)
    rgb = colour.XYZ_to_sRGB(xyz)
    rgb = np.clip(rgb, 0.0, 1.0)

    r, g, b_ch = (int(round(x * 255)) for x in rgb)
    return f"#{r:02x}{g:02x}{b_ch:02x}"


def oklch_to_rgb(L: float, C: float, H: float) -> list[float]:
    """Returns OKLCH as a [r, g, b] list of 0.0-1.0 floats."""
    return hex_to_rgb(oklch_to_hex(L, C, H))


# ---------------------------------------------------------------------------
# Profile catalog
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CameraSource:
    name: str
    gamut: str
    log: str
    encoded_signal_floor: float
    encoded_signal_ceiling: float
    sources: tuple[str, ...]

@dataclass(frozen=True)
class TargetDisplay:
    name: str
    gamut: str
    transfer: str
    encoding: str


class ProfileCatalog:
    def __init__(
        self,
        sources: Mapping[str, Mapping[str, object]],
        targets: Mapping[str, Mapping[str, object]],
    ) -> None:
        self._sources = sources
        self._targets = targets

    def validate(self) -> None:
        errors = []

        for name, source in self._sources.items():
            gamut = source.get("gamut")
            log = source.get("log")
            floor = source.get("encoded_signal_floor")
            ceiling = source.get("encoded_signal_ceiling")

            if not isinstance(gamut, str):
                errors.append(f"source [{name}] gamut must be a string; got {gamut!r}")
            elif gamut not in colour.RGB_COLOURSPACES:
                errors.append(
                    f"source [{name}] gamut {gamut!r} is not supported; choose a colour.RGB_COLOURSPACES key"
                )
            if not isinstance(log, str):
                errors.append(f"source [{name}] log must be a string; got {log!r}")
            elif log not in colour.LOG_DECODINGS:
                errors.append(
                    f"source [{name}] log {log!r} is not supported; choose a colour.LOG_DECODINGS key"
                )
            if not _is_normalized_number(floor):
                errors.append(
                    f"source [{name}] encoded_signal_floor must be a number from 0 to 1; got {floor!r}"
                )
            if not _is_normalized_number(ceiling):
                errors.append(
                    f"source [{name}] encoded_signal_ceiling must be a number from 0 to 1; got {ceiling!r}"
                )
            if (
                _is_normalized_number(floor)
                and _is_normalized_number(ceiling)
                and cast(float, floor) >= cast(float, ceiling)
            ):
                errors.append(
                    f"source [{name}] encoded_signal_floor must be below encoded_signal_ceiling"
                )

        for name, target in self._targets.items():
            gamut = target.get("gamut")
            transfer = target.get("gamma")
            encoding = target.get("encoding")

            if not isinstance(gamut, str):
                errors.append(f"target [{name}] gamut must be a string; got {gamut!r}")
            elif gamut not in colour.RGB_COLOURSPACES:
                errors.append(
                    f"target [{name}] gamut {gamut!r} is not supported; choose a colour.RGB_COLOURSPACES key"
                )
            if not isinstance(encoding, str) or encoding not in {"oetf", "log"}:
                errors.append(
                    f"target [{name}] encoding must be 'oetf' or 'log'; got {encoding!r}"
                )
            elif not isinstance(transfer, str):
                errors.append(
                    f"target [{name}] transfer must be a string; got {transfer!r}"
                )
            elif transfer not in (colour.OETFS if encoding == "oetf" else colour.LOG_ENCODINGS):
                errors.append(
                    f"target [{name}] transfer {transfer!r} is not supported for {encoding} encoding; choose a colour.{'OETFS' if encoding == 'oetf' else 'LOG_ENCODINGS'} key"
                )

        if errors:
            raise ValueError("Invalid profile catalog:\n- " + "\n- ".join(errors))

    def source(self, name: str) -> CameraSource:
        self.validate()
        source = self._sources[name]
        return CameraSource(
            name=name,
            gamut=cast(str, source["gamut"]),
            log=cast(str, source["log"]),
            encoded_signal_floor=cast(float, source["encoded_signal_floor"]),
            encoded_signal_ceiling=cast(float, source["encoded_signal_ceiling"]),
            sources=tuple(cast(Iterable[str], source.get("sources", ()))),
        )

    def target(self, name: str) -> TargetDisplay:
        self.validate()
        target = self._targets[name]
        return TargetDisplay(
            name=name,
            gamut=cast(str, target["gamut"]),
            transfer=cast(str, target["gamma"]),
            encoding=cast(str, target["encoding"]),
        )

    def sources(self) -> tuple[CameraSource, ...]:
        self.validate()
        return tuple(self.source(name) for name in self._sources)

    def targets(self) -> tuple[TargetDisplay, ...]:
        self.validate()
        return tuple(self.target(name) for name in self._targets)

    def source_names(self) -> tuple[str, ...]:
        self.validate()
        return tuple(self._sources)

    def target_names(self) -> tuple[str, ...]:
        self.validate()
        return tuple(self._targets)


def _is_normalized_number(value: object) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and 0 <= value <= 1


PROFILE_CATALOG = ProfileCatalog(_SOURCE_DATA, _TARGET_DATA)
