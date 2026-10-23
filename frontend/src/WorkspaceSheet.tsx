import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react"
import { Effect } from "effect"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

/** One scoped task; dismissal restores its parent and also works with browser Back. */
export function WorkspaceSheet({ open, title, onClose, children, returnFocus }: { open: boolean; title: string; onClose: () => void; children: ReactNode; returnFocus?: RefObject<HTMLElement | null> }) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  function dismiss() {
    if (window.history.state?.lutBuilderSheet === id) window.history.back()
    else close.current()
  }
  useEffect(() => {
    if (!open || !dialog.current) return
    const element = dialog.current
    const trigger = returnFocus?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const scroll = window.scrollY
    element.showModal()
    window.history.pushState({ ...window.history.state, lutBuilderSheet: id }, "")
    const controller = new AbortController()
    void Effect.runPromise(Effect.callback<never>(() => {
      const pop = () => { if (window.history.state?.lutBuilderSheet !== id) close.current() }
      window.addEventListener("popstate", pop)
      return Effect.sync(() => window.removeEventListener("popstate", pop))
    }), { signal: controller.signal }).catch(() => undefined)
    return () => {
      controller.abort()
      element.close()
      if (window.history.state?.lutBuilderSheet === id) window.history.back()
      requestAnimationFrame(() => {
        if (trigger?.isConnected && !trigger.closest('[hidden]')) trigger.focus({ preventScroll: true })
        window.scrollTo(0, scroll)
      })
    }
  }, [open, id, returnFocus])
  return <dialog ref={dialog} className="workspace-sheet" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); dismiss() }} onClick={event => { if (event.target === event.currentTarget) dismiss() }}>
    <div className="workspace-sheet-surface"><header className="workspace-sheet-header"><h2 id={`${id}-title`}>{title}</h2><Button type="button" variant="ghost" onClick={dismiss} aria-label={`Close ${title}`}><X aria-hidden="true" /><span>Close</span></Button></header><div className="workspace-sheet-content">{children}</div></div>
  </dialog>
}
