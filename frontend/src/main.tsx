import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { TooltipProvider } from "@/components/ui/tooltip"

// Throwaway UI study; the normal application and its data fetching are unchanged.
const Page = import.meta.env.DEV && new URLSearchParams(location.search).has("variant")
  ? (await import("./UiPrototype.tsx")).default
  : App

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  </StrictMode>
)
