import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { isTypingTarget } from "./keyboard"

export function KeyboardHelp({ canUndo, onUndo }: { canUndo: boolean; onUndo: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  function open() {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.current?.open) dialog.current?.showModal()
  }

  useEffect(() => {
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || isTypingTarget(event.target) ||
        document.querySelector('dialog[open], [data-workbench-popup]') ||
        (event.target instanceof Element && event.target.closest('dialog, [data-workbench-popup]'))) return
      if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        open()
      } else if (canUndo && event.key.toLowerCase() === "z" && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        onUndo()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [canUndo, onUndo])

  return <>
    <Button ref={trigger} type="button" variant="outline" aria-keyshortcuts="Shift+/" onClick={open}>Keyboard shortcuts (?)</Button>
    <dialog ref={dialog} aria-labelledby="keyboard-help-title" className="m-auto max-h-[90dvh] w-[min(38rem,calc(100%-2rem))] overflow-auto rounded-xl border bg-card p-6 text-card-foreground backdrop:bg-black/70"
      onClose={() => (previousFocus.current?.isConnected ? previousFocus.current : trigger.current)?.focus()}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="keyboard-help-title" className="text-lg font-semibold">Keyboard shortcuts</h2><Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Close shortcuts</Button></div>
      <dl className="grid gap-3 text-sm">
        <div><dt className="font-semibold">Tab / Shift+Tab · Enter / Space</dt><dd>Move between controls and activate buttons. Native selects, sliders and radio groups use arrow keys.</dd></div>
        <div><dt className="font-semibold">? · Ctrl/Cmd+Z</dt><dd>Open this help · Undo the most recent band edit. Text fields keep their own typing and undo shortcuts. Band undo is one step; redo is unavailable.</dd></div>
        <div><dt className="font-semibold">Graph: Delete / Backspace</dt><dd>Remove the selected band while the graph has focus. Undo restores it. Fill mode keeps at least two colors.</dd></div>
        <div><dt className="font-semibold">Graph: arrows · Shift+arrows · Alt+Left/Right</dt><dd>Move a center or resize an edge · Adjust by ten steps · Select the previous/next band.</dd></div>
        <div><dt className="font-semibold">Gradient dots: arrows · Shift+arrows · Home / End</dt><dd>Move a color stop · Move ten steps · Move to its allowed limits. The exposure reference stop stays fixed.</dd></div>
        <div><dt className="font-semibold">Preview: F · Video: Left/Right · Shift+Left/Right</dt><dd>Expand the focused image preview · Select the previous/next decoded frame · Jump ten frames. Focus the preview or a button, rather than a field or slider. Frame shortcuts pause while decoding.</dd></div>
        <div><dt className="font-semibold">Escape</dt><dd>Cancel the active field draft, close a color picker or dialog, or cancel a palette preview. It affects only the active interaction.</dd></div>
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">File, palette, verification and export actions use their visible controls. Browser shortcuts remain available. Disabled actions keep the same restrictions when using the keyboard.</p>
    </dialog>
  </>
}
