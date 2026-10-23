import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"

const pages = process.env.LUT_BUILDER_PAGES === "true"

export default defineConfig({
  site: "https://today20092.github.io",
  base: pages ? "/lut_builder/docs" : "/docs",
  trailingSlash: "always",
  outDir: "../../src/lut_builder/static/docs",
  integrations: [starlight({
    title: "LUT Builder manual",
    description: "Make and understand diagnostic false-color LUTs for your camera.",
    social: [
      { icon: "github", label: "GitHub project", href: "https://github.com/Today20092/lut_builder" },
      { icon: "heart", label: "Support this project on Ko-fi", href: "https://ko-fi.com/ayoubab1" },
    ],
    customCss: ["./src/styles/manual.css"],
    components: { Sidebar: "./src/components/Sidebar.astro" },
    sidebar: [
      { label: "Start here", items: [
        { label: "About this manual", slug: "" },
        { label: "About LUT Builder & support", slug: "about" },
        { label: "Make your first LUT", slug: "first-lut" },
      ] },
      { label: "Using the builder", items: [
        { label: "Controls and colors", slug: "controls" },
        { label: "Save, export, and apply", slug: "save-and-apply" },
        { label: "Verify camera media", slug: "verification" },
        { label: "Troubleshooting", slug: "troubleshooting" },
        { label: "Keyboard and touch", slug: "keyboard" },
      ] },
      { label: "Understand the result", items: [
        { label: "Recorded-signal warnings", slug: "signal-limits" },
        { label: "Camera thresholds and sources", slug: "profiles" },
      ] },
    ],
  })],
})
