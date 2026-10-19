import colors from "tailwindcss/colors"
import { oklchToHex, type PaletteColor } from "./editor"

export const tailwindPalette: PaletteColor[] = Object.entries(colors).flatMap(([family, shades]) =>
  typeof shades === "string" ? [] : Object.entries(shades).map(([shade, value]) => {
    const [, lightness, chroma, hue] = /^oklch\(([\d.]+)% ([\d.]+) ([\d.]+|none)\)$/.exec(value)!
    return { name: `${family}-${shade}`, hex: oklchToHex({ l: Number(lightness) / 100, c: Number(chroma), h: hue === "none" ? 0 : Number(hue) }) }
  }),
)
