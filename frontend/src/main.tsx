import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toast"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Toaster timeout={3500} limit={1} />
    </TooltipProvider>
  </StrictMode>
)
