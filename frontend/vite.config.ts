import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: process.env.LUT_BUILDER_PAGES === "true" ? "/lut_builder/" : "/",
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  build: {
    outDir: "../src/lut_builder/static",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
