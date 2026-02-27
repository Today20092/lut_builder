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
    shade_table.add_column("Num", style="bold cyan", justify="right")
    shade_table.add_column("Shade", style="white", justify="right")
    shade_table.add_column("Swatch")
    shade_table.add_column("Hex", style="dim")

    for i, shade in enumerate(SHADES, 1):
        L, C, H = TAILWIND_COLORS[family][shade]
        hex_val = oklch_to_hex(L, C, H)
        shade_table.add_row(str(i), shade, swatch(hex_val), hex_val)

    console.print(shade_table)

    while True:
        raw = Prompt.ask(f"  Shade [1-{len(SHADES)}]")
        if raw.isdigit() and 1 <= int(raw) <= len(SHADES):
            shade = SHADES[int(raw) - 1]
            break
        console.print(f"  [red]Enter a number between 1 and {len(SHADES)}.[/red]")

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
        color = pick_color(f"Color for {label} stop band", "#00FF00")
        width = float(Prompt.ask("  Width in stops", default="0.3"))
        bands.append({"stop": stop, "color": color, "width": width})
        console.print(
            f"  [green]✓[/green] {label} stops  {swatch(color)}  {color}  ±{width}"
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
    console.print(f"\n  [green]✓[/green] Config saved to [bold]{path}[/bold]")


def config_from_session(
    profile_name: str,
    target_name: str,
    cube_size: int,
    bands: list[dict],
    black_clip: bool,
    black_hex: str,
    white_clip: bool,
    white_hex: str,
    output_filename: str,
) -> dict:
    return {
        "profile": profile_name,
        "target": target_name,
        "cube_size": cube_size,
        "bands": bands,
        "black_clip": black_clip,
        "black_hex": black_hex,
        "white_clip": white_clip,
        "white_hex": white_hex,
        "output": output_filename,
    }


# ---------------------------------------------------------------------------
# Numbered selection helper
# ---------------------------------------------------------------------------


def numbered_choice(title: str, options: list[str]) -> str:
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Num", style="bold cyan", justify="right")
    table.add_column("Option")
    for i, opt in enumerate(options, 1):
        table.add_row(str(i), opt)
    console.print(table)

    while True:
        raw = Prompt.ask(f"{title} [1-{len(options)}]")
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            chosen = options[int(raw) - 1]
            console.print(f"  → [bold green]{chosen}[/bold green]\n")
            return chosen
        console.print(f"  [red]Enter a number between 1 and {len(options)}.[/red]")


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
):
    """
    Generate a false color exposure LUT for your camera.

    Run without --config for an interactive session, or pass a saved
    config file to regenerate a LUT non-interactively:

        uv run lut-builder --config my_setup.json
    """
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
        black_clip = cfg.get("black_clip", False)
        black_hex = cfg.get("black_hex", "")
        white_clip = cfg.get("white_clip", False)
        white_hex = cfg.get("white_hex", "")
        output_filename = cfg.get(
            "output", f"{profile_name.replace(' ', '')}_Custom.cube"
        )

        console.print(f"  Loaded config: [bold]{config}[/bold]")
        console.print(f"  Profile:  {profile_name}  →  {target_name}")
        console.print(f"  Cube:     {cube_size}³")
        console.print(f"  Bands:    {len(bands)}")
        console.print(f"  Output:   {output_filename}\n")

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
                    black_clip=black_clip,
                    black_hex=black_hex,
                    white_clip=white_clip,
                    white_hex=white_hex,
                    output_filename=output_filename,
                )
                rprint(f"\n[bold green]✓ Done![/bold green]  {out_path}")
            except Exception as e:
                rprint(f"[bold red]Error:[/bold red] {e}")
                raise typer.Exit(1)
        return

    # ------------------------------------------------------------------
    # Interactive path
    # ------------------------------------------------------------------

    # 1. Camera source
    console.print("\n[bold]Camera Source:[/bold]")
    profile_name = numbered_choice("Select", list(CAMERA_PROFILES.keys()))

    # 2. Target display
    console.print("[bold]Target Display:[/bold]")
    target_name = numbered_choice("Select", list(TARGET_PROFILES.keys()))

    # 3. Cube size
    console.print("[bold]LUT Cube Size:[/bold]")
    cube_size = int(numbered_choice("Select", ["17", "33", "65"]))

    # 4. False color bands
    console.print()
    bands = collect_false_color_bands()

    # 5. Clipping
    console.print()
    black_clip = Confirm.ask("Highlight crushed blacks?")
    black_hex = pick_color("Color for crushed blacks", "#FF00FF") if black_clip else ""

    white_clip = Confirm.ask("Highlight clipped whites?")
    white_hex = pick_color("Color for clipped whites", "#FF0000") if white_clip else ""

    # 6. Output filename
    default_name = (
        f"{profile_name.replace(' ', '')}_{target_name.replace('.', '')}.cube"
    )
    output_filename = Prompt.ask("\nOutput filename", default=default_name)

    # 7. Preview
    print_exposure_preview(
        profile_name, bands, black_clip, black_hex, white_clip, white_hex
    )

    # 8. Generate
    with console.status("[bold green]Generating LUT..."):
        try:
            out_path = generate_lut(
                profile_name=profile_name,
                target_name=target_name,
                cube_size=cube_size,
                bands=bands,
                black_clip=black_clip,
                black_hex=black_hex,
                white_clip=white_clip,
                white_hex=white_hex,
                output_filename=output_filename,
            )
            rprint(f"\n[bold green]✓ Done![/bold green]  {out_path}")
        except Exception as e:
            rprint(f"[bold red]Error:[/bold red] {e}")
            raise typer.Exit(1)

    # 9. Offer to save config
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
                black_clip,
                black_hex,
                white_clip,
                white_hex,
                output_filename,
            ),
        )


if __name__ == "__main__":
    app()
