# src/lut_builder/cli.py

import json
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt
from rich import print as rprint
from rich.table import Table
from rich.text import Text

from .colors import TAILWIND_COLORS
from .data import CAMERA_PROFILES, TARGET_PROFILES, oklch_to_hex
from .engine import generate_lut
from .presets import (
    suggest_color_for_stop,
    suggest_color_for_ire,
    WIDTH_PRESETS,
    IRE_WIDTH_PRESETS,
)

app = typer.Typer(help="Interactive Custom Camera LUT Generator")
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
    "  If set to 'Legal / Video Range', the physical black/white\n"
    "  clipping indicators will not align correctly.\n"
)

LEGAL_LEVELS_NOTE = (
    "\n  [bold cyan]ℹ  Legal Range Output[/bold cyan]\n"
    "  This LUT outputs legal/video range (10-bit codes 64–940).\n"
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
    console.print(table)

    while True:
        raw = Prompt.ask("  Input method [0-2]")
        if raw == "0":
            return BACK
        if raw in ("1", "2"):
            break
        console.print("  [red]Enter 0, 1, or 2.[/red]")

    if raw == "1":
        return Prompt.ask("  Hex code", default=default_hex)
    return tailwind_color_picker()


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


def collect_false_color_bands(band_mode: str = "stops"):
    """
    Collect false color band definitions with full back-navigation support.

    Navigation:
      - 'b' at "Add bands?" → returns BACK to the parent step loop
      - 'b' at stop-values entry → returns to "Add bands?" question
      - '0' at a band's color/width prompt → goes back one band (or to stop-values)
    Returns a list of band dicts, or BACK.
    """
    unit = "IRE" if band_mode == "ire" else "stops"
    suggest_fn = suggest_color_for_ire if band_mode == "ire" else suggest_color_for_stop

    if band_mode == "ire":
        prompt_text = "  IRE values, comma-separated  [bold](e.g. 20, 42, 55, 70, 85)[/bold]"
        default_val = "42"
    else:
        prompt_text = "  Stop values, comma-separated  [bold](e.g. -2, -1, 0, 1, 2)[/bold]"
        default_val = "0"

    # States: "ask_add" → "get_values" → "band_color" ↔ "band_width"
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
            bands = []
            bi = 0
            step = "band_color"

        # ── pick color for band[bi] ───────────────────────────────────────
        elif step == "band_color":
            if bi >= len(sorted_values):
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
                step = "band_width"
            else:
                color = pick_color(f"Color for {label} band", suggested_hex)
                if color is BACK:
                    continue  # re-show suggestion for same band
                current_color = color
                step = "band_width"

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

    The bar spans from the camera's black_clip_stops to white_clip_stops.
    Each character represents one position along that range. Positions inside
    a band are painted that band's color. Clip regions use their clip color.
    Unassigned regions are rendered as dim gray.
    """
    from .data import CAMERA_PROFILES

    profile = CAMERA_PROFILES[profile_name]
    lo = profile["black_clip_stops"]  # e.g. -7.0
    hi = profile["white_clip_stops"]  # e.g.  8.2
    total = hi - lo
    BAR_WIDTH = 64
    UNASSIGNED = "#3f3f46"  # zinc-700 — dark gray for normal exposure

    # Each character spans this many stops — bands narrower than one
    # character would vanish without a small buffer.
    half_step = (total / (BAR_WIDTH - 1)) / 2.0

    # Build a color lookup for each bar position
    bar_colors: list[str] = []
    for pos in range(BAR_WIDTH):
        stop = lo + (pos / (BAR_WIDTH - 1)) * total
        color = UNASSIGNED

        # Bands (last defined wins on overlap, matching engine behavior)
        # The half_step buffer ensures every band paints at least one char.
        for band in bands:
            if (
                stop >= band["stop"] - band["width"] - half_step
                and stop <= band["stop"] + band["width"] + half_step
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
    last_pos = -1
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
    console.print(f"\n  [green]✓[/green] Config saved to [bold]{path}[/bold]")


def config_from_session(
    profile_name: str,
    target_name: str,
    cube_size: int,
    bands: list[dict],
    band_mode: str,
    black_clip: bool,
    black_hex: str,
    white_clip: bool,
    white_hex: str,
    monochrome: bool,
    output_filename: str,
    legal_range: bool,
) -> dict:
    return {
        "profile": profile_name,
        "target": target_name,
        "cube_size": cube_size,
        "bands": bands,
        "band_mode": band_mode,
        "black_clip": black_clip,
        "black_hex": black_hex,
        "white_clip": white_clip,
        "white_hex": white_hex,
        "monochrome": monochrome,
        "legal_range": legal_range,
        "output": output_filename,
    }


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
    """List all supported camera and target display profiles."""
    cam_table = Table(title="Camera Profiles", box=None, padding=(0, 3))
    cam_table.add_column("#", style="bold cyan", justify="right")
    cam_table.add_column("Camera", style="white")
    cam_table.add_column("Gamut", style="dim")
    cam_table.add_column("Log", style="dim")
    cam_table.add_column("Black", style="dim", justify="right")
    cam_table.add_column("White", style="dim", justify="right")

    from .data import CAMERA_PROFILES, TARGET_PROFILES

    for i, (name, p) in enumerate(CAMERA_PROFILES.items(), 1):
        cam_table.add_row(
            str(i),
            name,
            p["gamut"],
            p["log"],
            f"{p['black_clip_stops']:+.1f} stops",
            f"{p['white_clip_stops']:+.1f} stops",
        )

    tgt_table = Table(title="Target Display Profiles", box=None, padding=(0, 3))
    tgt_table.add_column("#", style="bold cyan", justify="right")
    tgt_table.add_column("Target", style="white")
    tgt_table.add_column("Gamut", style="dim")
    tgt_table.add_column("Transfer", style="dim")

    for i, (name, t) in enumerate(TARGET_PROFILES.items(), 1):
        tgt_table.add_row(
            str(i),
            name,
            t["gamut"],
            f"{t['gamma']} ({t.get('encoding', 'oetf').upper()})",
        )

    console.print()
    console.print(cam_table)
    console.print()
    console.print(tgt_table)
    console.print()

    any_sources = any(p.get("sources") for p in CAMERA_PROFILES.values())
    if any_sources:
        console.print("[bold]Sources[/bold]")
        for name, p in CAMERA_PROFILES.items():
            sources = p.get("sources", [])
            if sources:
                console.print(f"  [dim]{name}[/dim]")
                for url in sources:
                    console.print(f"    [dim]• {url}[/dim]")
        console.print()


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
    Generate a false color exposure LUT for your camera.

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
        cfg = load_config(config)
        profile_name = cfg["profile"]
        target_name = cfg["target"]
        cube_size = cfg["cube_size"]
        bands = cfg.get("bands", [])
        band_mode = cfg.get("band_mode", "stops")
        black_clip = cfg.get("black_clip", False)
        black_hex = cfg.get("black_hex", "")
        white_clip = cfg.get("white_clip", False)
        white_hex = cfg.get("white_hex", "")
        monochrome = cfg.get("monochrome", False)
        legal_range = cfg.get("legal_range", False)
        output_filename = resolve_output(
            cfg.get("output", f"{profile_name.replace(' ', '')}_Custom.cube")
        )

        summary = Table(show_header=False, box=None, padding=(0, 1))
        summary.add_column("Key", style="dim", justify="right")
        summary.add_column("Value")
        summary.add_row("config", f"[bold]{config}[/bold]")
        summary.add_row("profile", f"{profile_name}  [dim]→[/dim]  {target_name}")
        summary.add_row("cube", f"{cube_size}³")
        summary.add_row("bands", f"{len(bands)}  [dim]({band_mode} mode)[/dim]")
        summary.add_row("mono", "yes" if monochrome else "no")
        summary.add_row("range", "Legal [dim](64-940)[/dim]" if legal_range else "Full [dim](0-1023)[/dim]")
        summary.add_row("output", f"[bold]{output_filename}[/bold]")
        console.print(summary)
        console.print()

        print_exposure_preview(
            profile_name, bands, black_clip, black_hex, white_clip, white_hex
        )

        with console.status("[bold green]Generating LUT..."):
            try:
                out_path = generate_lut(
                    profile_name=profile_name,
                    target_name=target_name,
                    cube_size=cube_size,
                    bands=bands,
                    band_mode=band_mode,
                    black_clip=black_clip,
                    black_hex=black_hex,
                    white_clip=white_clip,
                    white_hex=white_hex,
                    monochrome=monochrome,
                    legal_range=legal_range,
                    output_filename=output_filename,
                )
                rprint(f"\n[bold green]✓ Done![/bold green]  {out_path}")
                console.print(LEGAL_LEVELS_NOTE if legal_range else DATA_LEVELS_WARNING)
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
        result = numbered_choice("Select", list(CAMERA_PROFILES.keys()), allow_back=False)
        if result is BACK:
            return BACK
        return {**state, "profile_name": result}

    def step_target(state):
        console.print("[bold]Target Display:[/bold]")
        result = numbered_choice("Select", list(TARGET_PROFILES.keys()), allow_back=True)
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
                "IRE (target display signal level 0-100)",
            ],
            allow_back=True,
        )
        if result is BACK:
            return BACK
        return {**state, "band_mode": "ire" if "IRE" in result else "stops"}

    def step_bands(state):
        console.print()
        result = collect_false_color_bands(state["band_mode"])
        if result is BACK:
            return BACK
        return {**state, "bands": result}

    def step_black_clip(state):
        console.print()
        while True:
            result = confirm_with_back("Highlight crushed blacks?")
            if result is BACK:
                return BACK
            if not result:
                return {**state, "black_clip": False, "black_hex": ""}
            _, _, suggested = suggest_color_for_stop(-99)
            console.print(Text.assemble(
                "\n  Suggested: violet-800  ",
                swatch(suggested),
                (f"  {suggested}", "dim"),
            ))
            use = confirm_with_back("  Use this color?", default=True)
            if use is BACK:
                continue  # redo from "Highlight crushed blacks?"
            color = suggested if use else pick_color("Color for crushed blacks", suggested)
            if color is BACK:
                continue
            return {**state, "black_clip": True, "black_hex": color}

    def step_white_clip(state):
        while True:
            result = confirm_with_back("\nHighlight clipped whites?")
            if result is BACK:
                return BACK
            if not result:
                return {**state, "white_clip": False, "white_hex": ""}
            _, _, suggested = suggest_color_for_stop(99)
            console.print(Text.assemble(
                "\n  Suggested: red-600  ",
                swatch(suggested),
                (f"  {suggested}", "dim"),
            ))
            use = confirm_with_back("  Use this color?", default=True)
            if use is BACK:
                continue
            color = suggested if use else pick_color("Color for clipped whites", suggested)
            if color is BACK:
                continue
            return {**state, "white_clip": True, "white_hex": color}

    def step_mono(state):
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
            f"{state['profile_name'].replace(' ', '')}_{state['target_name'].replace('.', '')}.cube"
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
        step_black_clip,
        step_white_clip,
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

    profile_name = state["profile_name"]
    target_name = state["target_name"]
    cube_size = state["cube_size"]
    band_mode = state["band_mode"]
    bands = state["bands"]
    black_clip = state["black_clip"]
    black_hex = state["black_hex"]
    white_clip = state["white_clip"]
    white_hex = state["white_hex"]
    monochrome = state["monochrome"]
    legal_range = state["legal_range"]
    output_filename = state["output_filename"]

    # Preview
    print_exposure_preview(
        profile_name, bands, black_clip, black_hex, white_clip, white_hex
    )

    # Generate
    with console.status("[bold green]Generating LUT..."):
        try:
            out_path = generate_lut(
                profile_name=profile_name,
                target_name=target_name,
                cube_size=cube_size,
                bands=bands,
                band_mode=band_mode,
                black_clip=black_clip,
                black_hex=black_hex,
                white_clip=white_clip,
                white_hex=white_hex,
                monochrome=monochrome,
                legal_range=legal_range,
                output_filename=output_filename,
            )
            rprint(f"\n[bold green]✓ Done![/bold green]  {out_path}")
            console.print(LEGAL_LEVELS_NOTE if legal_range else DATA_LEVELS_WARNING)
        except Exception as e:
            rprint(f"[bold red]Error:[/bold red] {e}")
            raise typer.Exit(1)

    # Offer to save config
    console.print()
    if Confirm.ask("Save this setup as a config file for reuse?"):
        default_cfg_name = Path(output_filename).stem + ".json"
        cfg_path = Path(Prompt.ask("Config filename", default=default_cfg_name))
        save_config(
            cfg_path,
            config_from_session(
                profile_name,
                target_name,
                cube_size,
                bands,
                band_mode,
                black_clip,
                black_hex,
                white_clip,
                white_hex,
                monochrome,
                output_filename,
                legal_range,
            ),
        )


if __name__ == "__main__":
    app()
