# src/lut_builder/cli.py

import json
import warnings
from dataclasses import replace
from pathlib import Path
from typing import Optional

# Suppress colour-science optional dependency warnings
warnings.filterwarnings("ignore", module="colour")

import typer
import numpy as np
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt
from rich import print as rprint
from rich.table import Table
from rich.text import Text

from .colors import TAILWIND_COLORS
from .data import PROFILE_CATALOG, oklch_to_hex
from .engine import generate_lut
from .setup import LutSetup, map_exposure
from .presets import (
    suggest_color_for_stop,
    suggest_color_for_ire,
    WIDTH_PRESETS,
    IRE_WIDTH_PRESETS,
)

app = typer.Typer(help="Interactive diagnostic scene-exposure LUT generator")
console = Console()

SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]

# Sentinel returned by any prompt helper to signal "go back one step".
BACK = object()


def confirm_with_back(question: str, default: bool = True):
    """Yes/No prompt that also accepts 'b' to go back. Returns True, False, or BACK."""
    y = "[bold green]Y[/bold green]" if default else "[dim]y[/dim]"
    n = "[dim]n[/dim]" if default else "[bold green]N[/bold green]"
    while True:
        console.print(f"{question} \\[{y}/{n}/[dim]b[/dim]] ", end="", highlight=False)
        raw = input().strip().lower()
        if raw == "":
            return default
        if raw in ("y", "yes"):
            return True
        if raw in ("n", "no"):
            return False
        if raw in ("b", "back"):
            return BACK
        console.print("  [red]Enter y, n, or b (back).[/red]")

DATA_LEVELS_WARNING = (
    "\n  [bold yellow]⚠  Monitor Configuration[/bold yellow]\n"
    "  Ensure your camera/monitor HDMI/SDI output is set to\n"
    "  [bold]Data / Full Range[/bold] (0-255 / 0-1023).\n"
    "  Full-range IRE maps 0–100 IRE to codes 0–1023.\n"
)

LEGAL_LEVELS_NOTE = (
    "\n  [bold cyan]ℹ  Legal Range Output[/bold cyan]\n"
    "  This LUT outputs legal/video range (10-bit codes 64–940).\n"
    "  Legal-range IRE maps 0–100 IRE to codes 64–940.\n"
    "  Set your camera/monitor HDMI/SDI output to\n"
    "  [bold]Legal / Video Range[/bold] for correct alignment.\n"
)

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


def pick_color(prompt_label: str, default_hex: str):
    console.print(f"\n  [bold]{prompt_label}[/bold]")
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Num", style="bold cyan", justify="right")
    table.add_column("Option")
    table.add_row("0", "← Back")
    table.add_row("1", "Enter hex code")
    table.add_row("2", "Pick Tailwind color")
    table.add_row("3", "Enter family-shade (e.g. red-600)")
    console.print(table)

    while True:
        raw = Prompt.ask("  Input method [0-3]")
        if raw == "0":
            return BACK
        if raw in ("1", "2", "3"):
            break
        console.print("  [red]Enter 0, 1, 2, or 3.[/red]")

    if raw == "1":
        while True:
            hex_val = Prompt.ask("  Hex code", default=default_hex)
            hex_val = hex_val.strip().lstrip("#")
            if len(hex_val) == 6 and all(c in "0123456789abcdefABCDEF" for c in hex_val):
                return f"#{hex_val}"
            console.print("  [red]Invalid hex code. Enter 6 hex digits, e.g. #ff6600.[/red]")
    if raw == "2":
        return tailwind_color_picker()
    # raw == "3": family-shade shorthand
    families = list(TAILWIND_COLORS.keys())
    while True:
        raw2 = Prompt.ask("  family-shade")
        parts = raw2.strip().lower().rsplit("-", 1)
        if len(parts) == 2:
            fam, shade = parts
            if fam in TAILWIND_COLORS and shade in SHADES:
                L, C, H = TAILWIND_COLORS[fam][shade]
                hex_val = oklch_to_hex(L, C, H)
                console.print(Text.assemble("  → ", (f"{fam}-{shade}", "bold"), "  ", swatch(hex_val), "  ", hex_val))
                return hex_val
        console.print(f"  [red]Enter a valid family-shade like 'red-600'. Families: {', '.join(list(families)[:5])}...[/red]")


# ---------------------------------------------------------------------------
# Band & stop collection
# ---------------------------------------------------------------------------


def parse_values(raw: str) -> list[float]:
    """Parse a comma-separated string of numbers."""
    values = []
    for part in raw.split(","):
        part = part.strip()
        if part:
            try:
                values.append(float(part))
            except ValueError:
                console.print(f"  [red]Skipping invalid value: '{part}'[/red]")
    return values


def pick_width(band_mode: str = "stops") -> float:
    """
    Show named width presets with coverage descriptions.
    Returns the chosen ± width as a float (stops or IRE depending on mode).
    """
    presets = IRE_WIDTH_PRESETS if band_mode == "ire" else WIDTH_PRESETS
    unit = "IRE" if band_mode == "ire" else "stops"

    console.print(f"\n  [bold]Band width ({unit}):[/bold]")
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Num", style="bold cyan", justify="right")
    table.add_column("Label", style="white", no_wrap=True)
    table.add_column("Info", style="dim")

    table.add_row("0", "← Back", "")
    for i, preset in enumerate(presets, 1):
        table.add_row(str(i), preset["label"], preset["description"])

    console.print(table)

    while True:
        raw = Prompt.ask(f"  Width [0-{len(presets)}]")
        if raw == "0":
            return BACK
        if raw.isdigit() and 1 <= int(raw) <= len(presets):
            preset = presets[int(raw) - 1]
            if preset["width"] is not None:
                console.print(f"  → [bold green]{preset['label']}[/bold green]\n")
                return preset["width"]
            # Custom
            while True:
                val = Prompt.ask(f"  Enter width in {unit} (e.g. 0.15)")
                try:
                    w = float(val)
                    if w > 0:
                        return w
                    console.print("  [red]Must be greater than 0.[/red]")
                except ValueError:
                    console.print("  [red]Enter a number.[/red]")
        else:
            console.print(f"  [red]Enter a number between 0 and {len(presets)}.[/red]")


def collect_false_color_bands(band_mode: str = "stops", fill_mode: bool = False):
    """
    Collect false color band definitions with full back-navigation support.

    Navigation:
      - 'b' at "Add bands?" → returns BACK to the parent step loop
      - 'b' at stop-values entry → returns to "Add bands?" question
      - '0' at a band's color/width prompt → goes back one band (or to stop-values)
    Returns a list of band dicts, or BACK.
    In fill_mode, the "band_width" step is skipped (width=0.0 sentinel stored).
    """
    unit = "IRE" if band_mode == "ire" else "stops"
    suggest_fn = suggest_color_for_ire if band_mode == "ire" else suggest_color_for_stop

    if band_mode == "ire":
        prompt_text = "  IRE values, comma-separated  [bold](e.g. 20, 42, 55, 70, 85)[/bold]"
        default_val = "42"
    else:
        prompt_text = "  Stop values, comma-separated  [bold](e.g. -2, -1, 0, 1, 2)[/bold]"
        default_val = "0"

    # States: "ask_add" → "get_values" → "band_color" → "band_width" (skipped in fill_mode)
    step = "ask_add"
    sorted_values: list[float] = []
    bands: list[dict] = []
    bi = 0          # current band index
    current_color = ""

    while True:
        # ── ask whether to add bands at all ──────────────────────────────
        if step == "ask_add":
            result = confirm_with_back("Add false color exposure band(s)?")
            if result is BACK:
                return BACK
            if not result:
                return []
            step = "get_values"

        # ── collect stop / IRE values ─────────────────────────────────────
        elif step == "get_values":
            raw = Prompt.ask(prompt_text + "  [dim](b=back)[/dim]", default=default_val)
            if raw.strip().lower() in ("b", "back"):
                step = "ask_add"
                continue
            values = parse_values(raw)
            if not values:
                console.print("  [red]Enter at least one valid value.[/red]")
                continue
            sorted_values = sorted(values)
            if band_mode == "ire":
                out_of_range = [v for v in sorted_values if not (0 <= v <= 100)]
            else:
                out_of_range = [v for v in sorted_values if not (-8 <= v <= 8)]
            if out_of_range:
                console.print(f"  [yellow]Warning: {out_of_range} may be outside the useful range for this camera.[/yellow]")
            bands = []
            bi = 0
            step = "band_color"

        # ── pick color for band[bi] ───────────────────────────────────────
        elif step == "band_color":
            if bi >= len(sorted_values):
                for j in range(len(bands) - 1):
                    a, b = bands[j], bands[j + 1]
                    if a["stop"] + a["width"] > b["stop"] - b["width"]:
                        console.print(
                            f"  [yellow]Warning: band at {a['stop']} and {b['stop']} overlap — "
                            f"the later band's color will win in the overlap zone.[/yellow]"
                        )
                return bands

            val = sorted_values[bi]
            label = f"{val:.0f} IRE" if band_mode == "ire" else (
                f"+{val:.1f}" if val >= 0 else f"{val:.1f}"
            )
            console.print(f"\n  [bold cyan]Band at {label}:[/bold cyan]")

            fam, shade, suggested_hex = suggest_fn(val)
            console.print(Text.assemble(
                "  Suggested: ",
                (f"{fam}-{shade}", "bold"),
                "  ",
                swatch(suggested_hex),
                (f"  {suggested_hex}", "dim"),
            ))

            use = confirm_with_back("  Use this color?", default=True)
            if use is BACK:
                if bi == 0:
                    step = "get_values"
                else:
                    bi -= 1
                    bands.pop()
                continue

            if use:
                current_color = suggested_hex
            else:
                color = pick_color(f"Color for {label} band", suggested_hex)
                if color is BACK:
                    continue  # re-show suggestion for same band
                current_color = color
            step = "band_append" if fill_mode else "band_width"

        # ── append band in fill mode (no width needed) ────────────────────
        elif step == "band_append":
            val = sorted_values[bi]
            label = f"{val:.0f} IRE" if band_mode == "ire" else (
                f"+{val:.1f}" if val >= 0 else f"{val:.1f}"
            )
            bands.append({"stop": val, "color": current_color, "width": 0.0})
            console.print(Text.assemble(
                ("  ✓ ", "green"),
                (label, "bold"),
                "  [fill zone]  ",
                swatch(current_color),
                (f"  {current_color}", "dim"),
            ))
            bi += 1
            step = "band_color"

        # ── pick width for band[bi] ───────────────────────────────────────
        elif step == "band_width":
            val = sorted_values[bi]
            label = f"{val:.0f} IRE" if band_mode == "ire" else (
                f"+{val:.1f}" if val >= 0 else f"{val:.1f}"
            )
            width = pick_width(band_mode)
            if width is BACK:
                step = "band_color"
                continue

            bands.append({"stop": val, "color": current_color, "width": width})
            console.print(Text.assemble(
                ("  ✓ ", "green"),
                (label, "bold"),
                f"  ±{width} {unit}  " if band_mode == "ire" else f"  ±{width} stops  ",
                swatch(current_color),
                (f"  {current_color}", "dim"),
            ))
            bi += 1
            step = "band_color"


# ---------------------------------------------------------------------------
# Terminal exposure preview
# ---------------------------------------------------------------------------


def print_exposure_preview(setup: LutSetup) -> None:
    """
    Renders a horizontal stop bar in the terminal showing every exposure band
    and encoded-signal warning colored in their chosen colors.
    """
    bands = setup.bands
    profile = PROFILE_CATALOG.source(setup.profile_name)
    low_signal_warning = setup.low_signal_warning
    low_signal_hex = setup.low_signal_hex
    high_signal_warning = setup.high_signal_warning
    high_signal_hex = setup.high_signal_hex
    fill_mode = setup.fill_mode

    # Dynamically determine the range from the user's exposure bands.
    if setup.band_mode == "ire":
        lo_stops, hi_stops = 0.0, 100.0
    elif fill_mode and bands:
        lo_stops = min(band["stop"] for band in bands) - 1.0
        hi_stops = max(band["stop"] for band in bands) + 1.0
    elif bands:
        lo_stops = min(band["stop"] - band["width"] for band in bands) - 1.0
        hi_stops = max(band["stop"] + band["width"] for band in bands) + 1.0
    else:
        lo_stops, hi_stops = -7.0, 7.0

    lo = lo_stops
    hi = hi_stops
    total = hi - lo
    BAR_WIDTH = 64
    UNASSIGNED = "#3f3f46"  # zinc-700 — dark gray for normal exposure

    # Each character spans this many stops — bands narrower than one
    # character would vanish without a small buffer.
    half_step = (total / (BAR_WIDTH - 1)) / 2.0

    # Build a color lookup for each bar position
    values = np.linspace(lo, hi, BAR_WIDTH)
    mapped = map_exposure(
        values,
        setup,
        width_buffer=half_step,
    )
    bar_colors = [color or UNASSIGNED for color in mapped]

    # Build the bar as a Rich Text object
    bar = Text()
    for color in bar_colors:
        bar.append("█", style=f"bold {color}")

    # Build the stop labels ruler below the bar
    # Show integer stops that fall within the range
    label_line = Text()
    label_step = 10 if setup.band_mode == "ire" else 1
    start_stop = int(lo) if lo == int(lo) else int(lo) + 1
    last_pos = -1
    for s in range(start_stop, int(hi) + 1, label_step):
        pos = int(((s - lo) / total) * (BAR_WIDTH - 1))
        label = str(s) if setup.band_mode == "ire" else (f"+{s}" if s > 0 else str(s))
        padding = pos - last_pos - 1
        if padding >= 0:
            label_line.append(" " * padding)
            label_line.append(label, style="dim")
            last_pos = pos + len(label) - 1

    console.print()
    range_label = (
        f"{lo:.0f} IRE → {hi:.0f} IRE"
        if setup.band_mode == "ire"
        else f"{lo:+.1f} stops → {hi:+.1f} stops"
    )
    console.print(f"  [bold]Exposure Preview[/bold]  [dim]{range_label}[/dim]")
    console.print("  " + bar.markup if hasattr(bar, "markup") else bar)
    console.print(Text.assemble("  ", label_line))

    # Legend
    if bands or (low_signal_warning and low_signal_hex) or (high_signal_warning and high_signal_hex):
        console.print()
        if low_signal_warning and low_signal_hex:
            console.print(
                Text.assemble(
                    "  ",
                    swatch(low_signal_hex),
                    (
                        "  low warning when any channel ≤ "
                        f"{profile.encoded_signal_floor:.3f} encoded signal "
                        "(not shown on stop axis)",
                        "dim",
                    ),
                )
            )
        for band in sorted(bands, key=lambda b: b["stop"]):
            label = (
                f"{band['stop']:.0f} IRE"
                if setup.band_mode == "ire"
                else f"{band['stop']:+.1f} stops"
            )
            if fill_mode:
                suffix = "  [fill zone]"
            elif setup.band_mode == "ire":
                suffix = f"  ±{band['width']} IRE"
            else:
                suffix = f"  ±{band['width']} stops"
            console.print(
                Text.assemble(
                    "  ",
                    swatch(band["color"]),
                    (f"  {label}{suffix}", "dim"),
                )
            )
        if high_signal_warning and high_signal_hex:
            console.print(
                Text.assemble(
                    "  ",
                    swatch(high_signal_hex),
                    (
                        "  high warning when any channel ≥ "
                        f"{profile.encoded_signal_ceiling:.3f} encoded signal "
                        "(not shown on stop axis)",
                        "dim",
                    ),
                )
            )
    console.print()


# ---------------------------------------------------------------------------
# Config file  (JSON)
# ---------------------------------------------------------------------------


def load_config(path: Path) -> LutSetup:
    """Load and validate a version 1 JSON config."""
    try:
        with open(path) as f:
            data = json.load(f)
    except FileNotFoundError:
        console.print(f"[red]Config file not found: {path}[/red]")
        raise typer.Exit(1)
    except json.JSONDecodeError as e:
        console.print(f"[red]Invalid JSON in config file: {e}[/red]")
        raise typer.Exit(1)
    if data.get("version", 0) not in (1, 2):
        console.print("[yellow]Warning: config has no version field — it may be outdated.[/yellow]")
    try:
        return LutSetup.from_config(data)
    except (KeyError, TypeError, ValueError) as error:
        console.print(f"[red]Invalid config: {error}[/red]")
        raise typer.Exit(1) from error


def save_config(path: Path, setup: LutSetup) -> None:
    """Save the current session config to a JSON file."""
    cfg_with_version = {"version": 2, **setup.to_config()}
    with open(path, "w") as f:
        json.dump(cfg_with_version, f, indent=2)
    console.print(f"\n  [green]✓[/green] Config saved to [bold]{path}[/bold]")


# ---------------------------------------------------------------------------
# Numbered selection helper
# ---------------------------------------------------------------------------


def numbered_choice(title: str, options: list[str], allow_back: bool = False) -> str:
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Num", style="bold cyan", justify="right")
    table.add_column("Option")
    for i, opt in enumerate(options, 1):
        table.add_row(str(i), opt)
    if allow_back:
        table.add_row("[dim]0[/dim]", "[dim]← back[/dim]")
    console.print(table)

    lo = "0" if allow_back else "1"
    while True:
        raw = Prompt.ask(f"{title} [{lo}-{len(options)}]")
        if allow_back and raw == "0":
            return BACK
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            chosen = options[int(raw) - 1]
            console.print(f"  → [bold green]{chosen}[/bold green]\n")
            return chosen
        console.print(f"  [red]Enter a number between {lo} and {len(options)}.[/red]")


# ---------------------------------------------------------------------------
# list command
# ---------------------------------------------------------------------------


@app.command(name="list")
def list_profiles():
    """List all supported camera profiles and diagnostic output encodings."""
    cam_table = Table(title="Camera Profiles", box=None, padding=(0, 3))
    cam_table.add_column("#", style="bold cyan", justify="right")
    cam_table.add_column("Camera", style="white")
    cam_table.add_column("Gamut", style="dim")
    cam_table.add_column("Log", style="dim")

    sources = PROFILE_CATALOG.sources()
    targets = PROFILE_CATALOG.targets()

    for i, source in enumerate(sources, 1):
        cam_table.add_row(
            str(i),
            source.name,
            source.gamut,
            source.log,
        )

    tgt_table = Table(title="Diagnostic Output Encodings", box=None, padding=(0, 3))
    tgt_table.add_column("#", style="bold cyan", justify="right")
    tgt_table.add_column("Target", style="white")
    tgt_table.add_column("Gamut", style="dim")
    tgt_table.add_column("Transfer", style="dim")

    for i, target in enumerate(targets, 1):
        tgt_table.add_row(
            str(i),
            target.name,
            target.gamut,
            f"{target.transfer} ({target.encoding.upper()})",
        )

    console.print()
    console.print(cam_table)
    console.print()
    console.print(tgt_table)
    console.print()

    if any(source.sources for source in sources):
        console.print("[bold]Sources[/bold]")
        for source in sources:
            if source.sources:
                console.print(f"  [dim]{source.name}[/dim]")
                for url in source.sources:
                    console.print(f"    [dim]• {url}[/dim]")
        console.print()


# ---------------------------------------------------------------------------
# Colors command
# ---------------------------------------------------------------------------


@app.command(name="colors")
def list_colors(search: Optional[str] = typer.Argument(None, help="Filter by family name")):
    """Browse the Tailwind color palette. Optionally filter by family name."""
    families = list(TAILWIND_COLORS.keys())
    if search:
        families = [f for f in families if search.lower() in f]
    if not families:
        console.print(f"  [yellow]No color families matching '{search}'.[/yellow]")
        return
    for family in families:
        row = Text()
        row.append(f"  {family:<12}", style="white")
        for shade in SHADES:
            L, C, H = TAILWIND_COLORS[family][shade]
            hex_val = oklch_to_hex(L, C, H)
            row.append("█", style=f"bold {hex_val}")
        row.append(f"  {', '.join(SHADES)}", style="dim")
        console.print(row)


# ---------------------------------------------------------------------------
# Main command
# ---------------------------------------------------------------------------


@app.command()
def build(
    config: Optional[Path] = typer.Option(
        None,
        "--config",
        "-c",
        help="Path to a JSON config file. Skips all interactive prompts.",
        exists=True,
        file_okay=True,
        dir_okay=False,
        readable=True,
    ),
    output_dir: Optional[Path] = typer.Option(
        None,
        "--output-dir",
        "-o",
        help="Directory to write the .cube file into. Created if it doesn't exist.",
    ),
):
    """
    Generate a diagnostic false-color scene-exposure LUT for your camera.

    Run without arguments for an interactive session, pass --config to
    regenerate non-interactively, and --output-dir to control where the
    .cube file lands:

        uv run lut-builder --config my_setup.json --output-dir ~/luts
    """

    def resolve_output(filename: str) -> str:
        """Ensure .cube extension, prepend output_dir if provided."""
        p = Path(filename)
        if p.suffix.lower() != ".cube":
            p = p.with_suffix(".cube")
        if output_dir is not None:
            output_dir.mkdir(parents=True, exist_ok=True)
            return str(output_dir / p.name)
        return str(p)

    console.print(Panel.fit("[bold cyan]LUT Builder[/bold cyan]"))

    # ------------------------------------------------------------------
    # Non-interactive path — load everything from config file
    # ------------------------------------------------------------------
    if config is not None:
        setup = load_config(config)
        setup = replace(
            setup, output_filename=resolve_output(setup.output_filename)
        )

        summary = Table(show_header=False, box=None, padding=(0, 1))
        summary.add_column("Key", style="dim", justify="right")
        summary.add_column("Value")
        summary.add_row("config", f"[bold]{config}[/bold]")
        summary.add_row("profile", f"{setup.profile_name}  [dim]→[/dim]  {setup.target_name}")
        summary.add_row("cube", f"{setup.cube_size}³")
        summary.add_row("bands", f"{len(setup.bands)}  [dim]({setup.band_mode} mode)[/dim]")
        summary.add_row("mono", "yes" if setup.monochrome else "no")
        summary.add_row("range", "Legal [dim](64-940)[/dim]" if setup.legal_range else "Full [dim](0-1023)[/dim]")
        summary.add_row("output", f"[bold]{setup.output_filename}[/bold]")
        console.print(summary)
        console.print()

        print_exposure_preview(setup)

        with console.status("[bold green]Generating LUT..."):
            try:
                out_path = generate_lut(setup)
                rprint(f"\n[bold green]✓ Done![/bold green]  {Path(out_path).resolve()}")
                console.print(LEGAL_LEVELS_NOTE if setup.legal_range else DATA_LEVELS_WARNING)
            except Exception as e:
                rprint(f"[bold red]Error:[/bold red] {e}")
                raise typer.Exit(1)
        return

    # ------------------------------------------------------------------
    # Interactive path — step-based loop with back navigation.
    #
    # Each step is a closure that reads from a shared `state` dict and
    # returns either an updated dict (advance) or BACK (go one step back).
    # Step 0 (camera source) never goes back — it's the entry point.
    # ------------------------------------------------------------------

    def step_profile(state):
        console.print("\n[bold]Camera Source:[/bold]")
        result = numbered_choice("Select", list(PROFILE_CATALOG.source_names()), allow_back=False)
        if result is BACK:
            return BACK
        return {**state, "profile_name": result}

    def step_target(state):
        console.print("[bold]Diagnostic output encoding:[/bold]")
        result = numbered_choice("Select", list(PROFILE_CATALOG.target_names()), allow_back=True)
        if result is BACK:
            return BACK
        return {**state, "target_name": result}

    def step_cube(state):
        console.print(
            "[bold]LUT Cube Size:[/bold]  "
            "[dim]65 is highly recommended for sharp false color band edges.\n"
            "  17 or 33 may produce soft, blurry edges due to trilinear interpolation.[/dim]"
        )
        result = numbered_choice(
            "Select", ["17", "33", "65 (Recommended)"], allow_back=True
        )
        if result is BACK:
            return BACK
        return {**state, "cube_size": int(result.split()[0])}

    def step_band_mode(state):
        console.print("[bold]Band Mode:[/bold]")
        result = numbered_choice(
            "Select",
            [
                "Stops (relative to 18% middle grey)",
                "IRE (0-100 within the selected full/legal signal range)",
                "Fill (every pixel gets a false color — full-coverage Voronoi zones)",
            ],
            allow_back=True,
        )
        if result is BACK:
            return BACK
        if "IRE" in result:
            return {**state, "band_mode": "ire", "fill_mode": False}
        elif "Fill" in result:
            return {**state, "band_mode": "stops", "fill_mode": True}
        else:
            return {**state, "band_mode": "stops", "fill_mode": False}

    def step_bands(state):
        console.print()
        result = collect_false_color_bands(
            state["band_mode"],
            fill_mode=state.get("fill_mode", False),
        )
        if result is BACK:
            return BACK
        return {**state, "bands": result}

    def step_low_signal_warning(state):
        console.print()
        while True:
            result = confirm_with_back("Warn when any channel crosses the low encoded-signal threshold?")
            if result is BACK:
                return BACK
            if not result:
                return {**state, "low_signal_warning": False, "low_signal_hex": ""}
            _, _, suggested = suggest_color_for_stop(-99)
            console.print(Text.assemble(
                "\n  Suggested: violet-800  ",
                swatch(suggested),
                (f"  {suggested}", "dim"),
            ))
            use = confirm_with_back("  Use this color?", default=True)
            if use is BACK:
                continue
            color = suggested if use else pick_color("Low encoded-signal warning color", suggested)
            if color is BACK:
                continue
            return {**state, "low_signal_warning": True, "low_signal_hex": color}

    def step_high_signal_warning(state):
        while True:
            result = confirm_with_back("\nWarn when any channel crosses the high encoded-signal threshold?")
            if result is BACK:
                return BACK
            if not result:
                return {**state, "high_signal_warning": False, "high_signal_hex": ""}
            _, _, suggested = suggest_color_for_stop(99)
            console.print(Text.assemble(
                "\n  Suggested: red-600  ",
                swatch(suggested),
                (f"  {suggested}", "dim"),
            ))
            use = confirm_with_back("  Use this color?", default=True)
            if use is BACK:
                continue
            color = suggested if use else pick_color("High encoded-signal warning color", suggested)
            if color is BACK:
                continue
            return {**state, "high_signal_warning": True, "high_signal_hex": color}

    def step_mono(state):
        if state.get("fill_mode", False):
            # Every pixel is false-colored in fill mode; monochrome is meaningless.
            return {**state, "monochrome": False}
        console.print()
        result = confirm_with_back(
            "Desaturate the underlying base image to monochrome?", default=True
        )
        if result is BACK:
            return BACK
        return {**state, "monochrome": result}

    def step_legal(state):
        console.print()
        result = confirm_with_back(
            "Output legal/video range? [dim](64-940 for broadcast; full range 0-1023 otherwise)[/dim]",
            default=False,
        )
        if result is BACK:
            return BACK
        return {**state, "legal_range": result}

    def step_output(state):
        default_name = (
            f"output/luts/{state['profile_name'].replace(' ', '')}_{state['target_name'].replace('.', '')}.cube"
        )
        raw = Prompt.ask("\nOutput filename (b=back)", default=default_name)
        if raw.strip().lower() in ("b", "back"):
            return BACK
        return {**state, "output_filename": resolve_output(raw)}

    steps = [
        step_profile,
        step_target,
        step_cube,
        step_band_mode,
        step_bands,
        step_low_signal_warning,
        step_high_signal_warning,
        step_mono,
        step_legal,
        step_output,
    ]

    state: dict = {}
    i = 0
    while i < len(steps):
        result = steps[i](state)
        if result is BACK:
            i = max(0, i - 1)
        else:
            state = result
            i += 1

    setup = LutSetup(**state)

    # Preview
    print_exposure_preview(setup)

    # Generate
    with console.status("[bold green]Generating LUT..."):
        try:
            out_path = generate_lut(setup)
            rprint(f"\n[bold green]✓ Done![/bold green]  {out_path}")
            console.print(LEGAL_LEVELS_NOTE if setup.legal_range else DATA_LEVELS_WARNING)
        except Exception as e:
            rprint(f"[bold red]Error:[/bold red] {e}")
            raise typer.Exit(1)

    # Offer to save config
    console.print()
    if Confirm.ask("Save this setup as a config file for reuse?"):
        default_cfg_name = f"output/configs/{Path(setup.output_filename).stem}.json"
        cfg_path = Path(Prompt.ask("Config filename", default=default_cfg_name))
        save_config(cfg_path, setup)


if __name__ == "__main__":
    app()
