import json
import sys

from lut_builder.engine import serialize_lut
from lut_builder.setup import LutSetup


def cube_values(config: dict) -> list[list[float]]:
    text = serialize_lut(LutSetup.from_config(config)).decode("utf-8")
    values = []
    in_table = False
    for line in text.splitlines():
        if line.startswith("LUT_3D_SIZE "):
            in_table = True
        elif in_table and line and not line.startswith("#"):
            values.append([float(channel) for channel in line.split()])
    return values


setups = json.load(sys.stdin)
json.dump([cube_values(setup) for setup in setups], sys.stdout, separators=(",", ":"))
