import { createContext, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Effect } from "effect"

const query = "(max-width: 959px)"
function subscribe(notify: () => void) {
  if (!window.matchMedia) return () => {}
  const controller = new AbortController()
  void Effect.runPromise(Effect.callback<never>(() => {
    const media = window.matchMedia(query)
    media.addEventListener("change", notify)
    return Effect.sync(() => media.removeEventListener("change", notify))
  }), { signal: controller.signal }).catch(() => undefined)
  return () => controller.abort()
}
export function useMobileWorkspace() {
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false, () => false)
}

export const WorkspaceNavigation = createContext({ mobile: false })

export type WorkspaceSection = "bands" | "palette" | "presets" | "media" | "configuration"

export function sectionFromHistory(state: unknown): WorkspaceSection | null {
  if (!state || typeof state !== "object" || !("lutBuilderSection" in state)) return null
  const value = state.lutBuilderSection
  return value === "bands" || value === "palette" || value === "presets" || value === "media" || value === "configuration" ? value : null
}

export function useWorkspaceLocation() {
  const [section, setSection] = useState<WorkspaceSection>("bands")
  const scroll = useRef<Partial<Record<WorkspaceSection, number>>>({})
  const show = useCallback((next: WorkspaceSection) => {
    if (next === section) return
    const editing = (value: WorkspaceSection) => value === "bands" || value === "palette"
    scroll.current[section] = window.scrollY
    setSection(next)
    requestAnimationFrame(() => {
      document.getElementById("workspace-screen-title")?.focus({ preventScroll: true })
      window.scrollTo(0, editing(section) && editing(next) ? scroll.current[section] ?? 0 : scroll.current[next] ?? 0)
    })
  }, [section])
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, lutBuilderSection: section }, "")
    const controller = new AbortController()
    void Effect.runPromise(Effect.callback<never>(() => {
      const pop = () => {
        const next = sectionFromHistory(window.history.state)
        if (next) show(next)
      }
      window.addEventListener("popstate", pop)
      return Effect.sync(() => window.removeEventListener("popstate", pop))
    }), { signal: controller.signal }).catch(() => undefined)
    return () => controller.abort()
  }, [section, show])
  return { section, open: (next: WorkspaceSection) => {
    if (next !== section) window.history.pushState({ ...window.history.state, lutBuilderSection: next }, "")
    show(next)
  } }
}
