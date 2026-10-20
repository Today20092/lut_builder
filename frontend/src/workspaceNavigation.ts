import { createContext, useSyncExternalStore } from "react"
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

export const WorkspaceNavigation = createContext<{ mobile: boolean; task: string; openTask: (task: string) => void }>({ mobile: false, task: "", openTask: () => {} })
