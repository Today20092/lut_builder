import json
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, FloatPrompt, Prompt
from rich import print as rprint
from rich.table import Table
from rich.text import Text

from .colors import TAILWIND_COLORS
from .data import CAMERA_PROFILES, TARGET_PROFILES, oklch_to_hex
from .engine import generate_lut
from .presets import suggest_color_for_stop, WIDTH_PRESETS

app = typer.Typer(help="Interactive Custom Camera LUT Generator")
console = Console()

SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]

# ---------------------------------------------------------------------------
# Color picker helpers
# ---------------------------------------------------------------------------


def swatch(hex_color: str) -> Text:
    return Text("██", style=f"bold {hex_color}")


def tailwind_color_picker() -> str:
    """Two-step picker: color family → shade. Returns hex string."""
    console.print("\n  [bold]Pick a Tailwind color family:[/bold]")
    families = list(TAILWIND_COLORS.keys())
    mid = (len(families) + 1) // 2

    family_table = Table(show_header=False, box=None, padding=(0, 1))
    family_table.add_column("LNum", style="bold cyan", justify="right", no_wrap=True)
    family_table.add_column("LSwatch", no_wrap=True)
    family_table.add_column("LName", style="white", no_wrap=True)
    family_table.add_column("Gap", no_wrap=True)
    family_table.add_column("RNum", style="bold cyan", justify="right", no_wrap=True)
    family_table.add_column("RSwatch", no_wrap=True)
    family_table.add_column("RName", style="white", no_wrap=True)

    for i in range(mid):
        lf = families[i]
        L, C, H = TAILWIND_COLORS[lf]["500"]
        l_hex = oklch_to_hex(L, C, H)

        ri = i + mid
        if ri < len(families):
            rf = families[ri]
            Lr, Cr, Hr = TAILWIND_COLORS[rf]["500"]
            r_hex = oklch_to_hex(Lr, Cr, Hr)
            r_num, r_sw, r_name = f"{ri + 1}.", Text("██", style=f"bold {r_hex}"), rf
        else:
            r_num, r_sw, r_name = "", Text(""), ""

        family_table.add_row(
            f"{i + 1}.",
            Text("██", style=f"bold {l_hex}"),
            lf,
            "",
            r_num,
            r_sw,
            r_name,
        )

    console.print(family_table)

    while True:
        raw = Prompt.ask(f"\n  Family [1-{len(families)}]")
        if raw.isdigit() and 1 <= int(raw) <= len(families):
            family = families[int(raw) - 1]
            break
        console.print(f"  [red]Enter a number between 1 and {len(families)}.[/red]")

    console.print(f"\n  [bold]Pick a shade for [cyan]{family}[/cyan]:[/bold]")
    shade_table = Table(show_header=False, box=None, padding=(0, 2))
    shade_table.add_column("Shade", style="bold cyan", justify="right")
    shade_table.add_column("Swatch")
    shade_table.add_column("Hex", style="dim")

    for shade in SHADES:
        L, C, H = TAILWIND_COLORS[family][shade]
        hex_val = oklch_to_hex(L, C, H)
        shade_table.add_row(shade, swatch(hex_val), hex_val)

    console.print(shade_table)

    while True:
        raw = Prompt.ask("  Shade", default="500")
        if raw in SHADES:
            shade = raw
            break
        console.print(f"  [red]Enter a valid shade: {', '.join(SHADES)}[/red]")

    L, C, H = TAILWIND_COLORS[family][shade]
    hex_val = oklch_to_hex(L, C, H)
    console.print(
        Text.assemble(
            "  → ",
            (f"{family}-{shade}", "bold"),
            "  ",
            swatch(hex_val),
            (f"  {hex_val}", "dim"),
            "\n",
        )
    )
    return hex_val


def pick_color(prompt_label: str, default_hex: str) -> str:
    console.print(f"\n  [bold]{prompt_label}[/bold]")
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Num", style="bold cyan", justify="right")
    table.add_column("Option")
    table.add_row("1", "Enter hex code")
    table.add_row("2", "Pick Tailwind color")
    console.print(table)

    while True:
        raw = Prompt.ask("  Input method [1-2]")
        if raw in ("1", "2"):
            break
        console.print("  [red]Enter 1 or 2.[/red]")

    if raw == "1":
        return Prompt.ask("  Hex code", default=default_hex)
    return tailwind_color_picker()


# ---------------------------------------------------------------------------
# Band & stop collection
# ---------------------------------------------------------------------------


def parse_stops(raw: str) -> list[float]:
    stops = []
    for part in raw.split(","):
        part = part.strip()
        if part:
            try:
                stops.append(float(part))
            except ValueError:
                console.print(f"  [red]Skipping invalid value: '{part}'[/red]")
    return stops


def pick_width() -> float:
    """
    Show named width presets with coverage descriptions.
    Returns the chosen ± stop width as a float.
    """
    console.print("\n  [bold]Band width:[/bold]")
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Num", style="bold cyan", justify="right")
    table.add_column("Label", style="white", no_wrap=True)
    table.add_column("Info", style="dim")

    for i, preset in enumerate(WIDTH_PRESETS, 1):
        table.add_row(str(i), preset["label"], preset["description"])

    console.print(table)

    while True:
        raw = Prompt.ask(f"  Width [1-{len(WIDTH_PRESETS)}]")
        if raw.isdigit() and 1 <= int(raw) <= len(WIDTH_PRESETS):
            preset = WIDTH_PRESETS[int(raw) - 1]
            if preset["width"] is not None:
                console.print(f"  → [bold green]{preset['label']}[/bold green]\n")
                return preset["width"]
            # Custom
            while True:
                val = Prompt.ask("  Enter width in stops (e.g. 0.15)")
                try:
                    w = float(val)
                    if w > 0:
                        return w
                    console.print("  [red]Must be greater than 0.[/red]")
                except ValueError:
                    console.print("  [red]Enter a number.[/red]")
        else:
            console.print(
                f"  [red]Enter a number between 1 and {len(WIDTH_PRESETS)}.[/red]"
            )


def collect_false_color_bands() -> list[dict]:
    if not Confirm.ask("Add false color exposure band(s)?"):
        return []

    while True:
        raw = Prompt.ask(
            "  Stop values, comma-separated  [bold](e.g. -2, -1, 0, 1, 2)[/bold]",
            default="0",
        )
        stops = parse_stops(raw)
        if stops:
            break
        console.print("  [red]Enter at least one valid stop value.[/red]")

    bands = []
    for stop in sorted(stops):
        label = f"+{stop:.1f}" if stop >= 0 else f"{stop:.1f}"
        console.print(f"\n  [bold cyan]Band at {label} stops:[/bold cyan]")

        # Suggest a color based on the stop value
        fam, shade, suggested_hex = suggest_color_for_stop(stop)
        console.print(
            Text.assemble(
                "  Suggested: ",
                (f"{fam}-{shade}", "bold"),
                "  ",
                swatch(suggested_hex),
                (f"  {suggested_hex}", "dim"),
            )
        )

        use_suggestion = Confirm.ask("  Use this color?", default=True)
        if use_suggestion:
            color = suggested_hex
        else:
            color = pick_color(f"Color for {label} stop band", suggested_hex)

        width = pick_width()
        bands.append({"stop": stop, "color": color, "width": width})
        console.print(
            Text.assemble(
                "  [green]✓[/green] ",
                (label, "bold"),
                " stops  ",
                swatch(color),
                (f"  {color}  ±{width}", "dim"),
            )
        )

    return bands


# ---------------------------------------------------------------------------
# Terminal exposure preview
# ---------------------------------------------------------------------------


def print_exposure_preview(
    profile_name: str,
    bands: list[dict],
    black_clip: bool,
    black_hex: str,
    white_clip: bool,
    white_hex: str,
) -> None:
    """
    Renders a horizontal stop bar in the terminal showing every exposure band
    and clip indicator colored in their chosen colors.
    """
    from .data import CAMERA_PROFILES

    profile = CAMERA_PROFILES[profile_name]
    lo = profile["black_clip_stops"]  # e.g. -7.0
    hi = profile["white_clip_stops"]  # e.g.  8.2
    total = hi - lo
    BAR_WIDTH = 64
    UNASSIGNED = "#3f3f46"  # zinc-700 — dark gray for normal exposure

    # Build a color lookup for each bar position
    bar_colors: list[str] = []
    for pos in range(BAR_WIDTH):
        stop = lo + (pos / (BAR_WIDTH - 1)) * total
        color = UNASSIGNED

        # Bands (last defined wins on overlap, matching engine behavior)
        for band in bands:
            if (
                stop >= band["stop"] - band["width"]
                and stop <= band["stop"] + band["width"]
            ):
                color = band["color"]

        # Clips override bands
        if black_clip and black_hex and stop <= lo:
            color = black_hex
        if white_clip and white_hex and stop >= hi:
            color = white_hex

        bar_colors.append(color)

    # Build the bar as a Rich Text object
    bar = Text()
    for color in bar_colors:
        bar.append("█", style=f"bold {color}")

    # Build the stop labels ruler below the bar
    # Show integer stops that fall within the range
    label_line = Text()
    start_stop = int(lo) if lo == int(lo) else int(lo) + 1
    last_pos = -999
    for s in range(start_stop, int(hi) + 1):
        pos = int(((s - lo) / total) * (BAR_WIDTH - 1))
        label = f"+{s}" if s > 0 else str(s)
        padding = pos - last_pos - 1
        if padding >= 0:
            label_line.append(" " * padding)
            label_line.append(label, style="dim")
            last_pos = pos + len(label) - 1

    console.print()
    console.print(
        f"  [bold]Exposure Preview[/bold]  [dim]{lo:+.1f} stops → {hi:+.1f} stops[/dim]"
    )
    console.print("  " + bar.markup if hasattr(bar, "markup") else bar)
    console.print(Text.assemble("  ", label_line))

    # Legend
    if bands or (black_clip and black_hex) or (white_clip and white_hex):
        console.print()
        if black_clip and black_hex:
            console.print(
                Text.assemble(
                    "  ",
                    swatch(black_hex),
                    (f"  crushed blacks  ≤ {lo:+.1f} stops", "dim"),
                )
            )
        for band in sorted(bands, key=lambda b: b["stop"]):
            label = (
                f"+{band['stop']:.1f}" if band["stop"] >= 0 else f"{band['stop']:.1f}"
            )
            console.print(
                Text.assemble(
                    "  ",
                    swatch(band["color"]),
                    (f"  {label} stops  ±{band['width']}", "dim"),
                )
            )
        if white_clip and white_hex:
            console.print(
                Text.assemble(
                    "  ",
                    swatch(white_hex),
                    (f"  clipped whites  ≥ {hi:+.1f} stops", "dim"),
                )
            )
    console.print()


# ---------------------------------------------------------------------------
# Config file  (JSON)
# ---------------------------------------------------------------------------


def load_config(path: Path) -> dict:
    """Load a JSON config file and return it as a dict."""
    with open(path) as f:
        return json.load(f)


def save_config(path: Path, cfg: dict) -> None:
    """Save the current session config to a JSON file."""
    with open(path, "w") as f:
        json.dump(cfg, f, indent=2)
