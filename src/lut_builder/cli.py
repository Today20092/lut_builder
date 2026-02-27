# src/lut_builder/cli.py
import typer
from rich.console import Console
from rich.prompt import Prompt, Confirm
from rich import print as rprint
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from .data import CAMERA_PROFILES, TARGET_PROFILES, oklch_to_hex
from .colors import TAILWIND_COLORS
from .engine import generate_lut

app = typer.Typer(help="Interactive Custom Camera LUT Generator")
console = Console()

SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]


# ---------------------------------------------------------------------------
# UI Helpers
# ---------------------------------------------------------------------------


def numbered_choice(title: str, options: list[str]) -> str:
    """Display a numbered list and return the chosen option string."""
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Num", style="bold cyan", justify="right")
    table.add_column("Option", style="white")
    for i, opt in enumerate(options, 1):
        table.add_row(str(i), opt)
    console.print(table)

    while True:
        raw = Prompt.ask(f"{title} [1-{len(options)}]")
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            chosen = options[int(raw) - 1]
            console.print(f"  → [bold green]{chosen}[/bold green]\n")
            return chosen
        console.print(
            f"  [red]Please enter a number between 1 and {len(options)}.[/red]"
        )


def swatch(hex_color: str) -> Text:
    """Return a Rich Text swatch block in the given hex color."""
    return Text("██", style=f"bold {hex_color}")


def tailwind_color_picker() -> str:
    """
    Two-step Tailwind color picker.
    Step 1: pick a color family shown in an aligned two-column Rich table.
    Step 2: pick a shade with a live swatch preview.
    Returns the hex string of the chosen color.
    """
    # Step 1 — 6-column table so num / swatch / name each align independently
    # on both sides: left_num | left_swatch | left_name | gap | right_num | right_swatch | right_name
    console.print("\n  [bold]Pick a Tailwind color family:[/bold]")
    families = list(TAILWIND_COLORS.keys())
    mid = (len(families) + 1) // 2

    family_table = Table(show_header=False, box=None, padding=(0, 1))
    family_table.add_column("LNum", style="bold cyan", justify="right", no_wrap=True)
    family_table.add_column("LSwatch", no_wrap=True)
    family_table.add_column("LName", style="white", no_wrap=True)
    family_table.add_column("Gap", no_wrap=True)  # spacer
    family_table.add_column("RNum", style="bold cyan", justify="right", no_wrap=True)
    family_table.add_column("RSwatch", no_wrap=True)
    family_table.add_column("RName", style="white", no_wrap=True)

    for i in range(mid):
        left_family = families[i]
        L, C, H = TAILWIND_COLORS[left_family]["500"]
        left_hex = oklch_to_hex(L, C, H)

        right_idx = i + mid
        if right_idx < len(families):
            right_family = families[right_idx]
            Lr, Cr, Hr = TAILWIND_COLORS[right_family]["500"]
            right_hex = oklch_to_hex(Lr, Cr, Hr)
            r_num = f"{right_idx + 1}."
            r_swatch = Text("██", style=f"bold {right_hex}")
            r_name = right_family
        else:
            r_num, r_swatch, r_name = "", Text(""), ""

        family_table.add_row(
            f"{i + 1}.",
            Text("██", style=f"bold {left_hex}"),
            left_family,
            "",  # spacer column
            r_num,
            r_swatch,
            r_name,
        )

    console.print(family_table)

    while True:
        raw = Prompt.ask(f"\n  Family [1-{len(families)}]")
        if raw.isdigit() and 1 <= int(raw) <= len(families):
            family = families[int(raw) - 1]
            break
        console.print(f"  [red]Enter a number between 1 and {len(families)}.[/red]")

    # Step 2 — shade with swatch preview
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
    sw = swatch(hex_val)
    console.print(
        Text.assemble(
            "  → ",
            (f"{family}-{shade}", "bold"),
            "  ",
            sw,
            (f"  {hex_val}", "dim"),
            "\n",
        )
    )
    return hex_val


def pick_color(prompt_label: str, default_hex: str) -> str:
    """
    Ask whether the user wants to enter a hex code or pick from Tailwind.
    Returns a hex string either way.
    """
    console.print(f"\n  [bold]{prompt_label}[/bold]")
    method = numbered_choice("Input method", ["Enter hex code", "Pick Tailwind color"])
    if method == "Enter hex code":
        return Prompt.ask("  Hex code", default=default_hex)
    else:
        return tailwind_color_picker()


def parse_stops(raw: str) -> list[float]:
    """Parse a comma-separated string of stop values into a list of floats."""
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
    """
    Ask for all stop values at once as a comma-separated list,
    then ask for a color and width for each one.
    """
    if not Confirm.ask("Do you want to add False Color exposure band(s)?"):
        return []

    while True:
        raw = Prompt.ask(
            "  Enter stop values as a comma-separated list\n"
            "  (e.g. [bold]-2, -1, 0, 1, 2[/bold]  |  0 = middle grey)",
            default="0",
        )
        stops = parse_stops(raw)
        if stops:
            break
        console.print("  [red]Please enter at least one valid stop value.[/red]")

    bands = []
    for stop in stops:
        label = f"+{stop:.1f}" if stop >= 0 else f"{stop:.1f}"
        console.print(f"\n  [bold cyan]Band at {label} stops:[/bold cyan]")
        color = pick_color(f"Color for {label} stop band", "#00FF00")
        width = float(Prompt.ask("  Width in stops (e.g. 0.3)", default="0.3"))
        bands.append({"stop": stop, "color": color, "width": width})
        console.print(f"  [green]✓[/green] stop={label}, color={color}, width=±{width}")

    return bands


# ---------------------------------------------------------------------------
# Main Command
# ---------------------------------------------------------------------------


@app.command()
def build():
    console.print(Panel.fit("[bold cyan]Welcome to the Custom LUT Builder[/bold cyan]"))

    # 1. Source profile
    console.print("\n[bold]Camera Source:[/bold]")
    profile_choices = list(CAMERA_PROFILES.keys())
    profile_name = numbered_choice("Select", profile_choices)

    # 2. Target profile
    console.print("[bold]Target Display:[/bold]")
    target_choices = list(TARGET_PROFILES.keys())
    target_name = numbered_choice("Select", target_choices)

    # 3. Cube size
    console.print("[bold]LUT Cube Size:[/bold]")
    cube_size = int(numbered_choice("Select", ["17", "33", "65"]))

    # 4. False color bands
    console.print()
    bands = collect_false_color_bands()

    # 5. Clipping
    console.print()
    black_clip = Confirm.ask("Highlight crushed blacks?")
    black_hex = ""
    if black_clip:
        black_hex = pick_color("Color for crushed blacks", "#FF00FF")

    white_clip = Confirm.ask("Highlight clipped whites?")
    white_hex = ""
    if white_clip:
        white_hex = pick_color("Color for clipped whites", "#FF0000")

    # 6. Output filename
    default_name = (
        f"{profile_name.replace(' ', '')}_{target_name.replace('.', '')}.cube"
    )
    output_name = Prompt.ask("\nOutput filename", default=default_name)

    # 7. Generate
    console.print()
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
                output_filename=output_name,
            )
            rprint(f"\n[bold green]Success![/bold green] LUT saved to: {out_path}")
        except Exception as e:
            rprint(f"[bold red]Error generating LUT:[/bold red] {e}")


if __name__ == "__main__":
    app()
