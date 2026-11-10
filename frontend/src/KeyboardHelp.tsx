import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { isTypingTarget } from "./keyboard"

export function KeyboardHelp({ canUndo, onUndo }: { canUndo: boolean; onUndo: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  function open() {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setIsOpen(true)
  }

  useEffect(() => {
    function handleKey(event: globalThis.KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        isTypingTarget(event.target) ||
        document.querySelector("dialog[open], [data-workbench-popup]") ||
        (event.target instanceof Element && event.target.closest("dialog, [data-workbench-popup]"))
      )
        return
      if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        open()
      } else if (
        canUndo &&
        event.key.toLowerCase() === "z" &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault()
        onUndo()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [canUndo, onUndo])

  return (
    <>
      <Button ref={trigger} type="button" variant="outline" aria-keyshortcuts="Shift+/" onClick={open}>
        Keyboard shortcuts (?)
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogPopup
          data-workbench-popup
          showCloseButton={false}
          finalFocus={() => (previousFocus.current?.isConnected ? previousFocus.current : trigger.current)}
        >
          <DialogHeader className="flex-row items-center justify-between gap-3">
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogClose render={<Button type="button" variant="outline" />}>Close shortcuts</DialogClose>
          </DialogHeader>
          <DialogPanel>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="font-semibold">{keys("Tab / Shift+Tab · Enter / Space")}</dt>
                <dd>
                  Move between controls and activate buttons. Native selects, sliders and radio groups use arrow keys.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{keys("? · Ctrl/Cmd+Z")}</dt>
                <dd>
                  Open this help · Undo the most recent band edit. Text fields keep their own typing and undo shortcuts.
                  Band undo is one step; redo is unavailable.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{keys("Graph: Delete / Backspace")}</dt>
                <dd>
                  Ask to remove the selected band while the graph has focus. Confirm removal in the dialog; Undo
                  restores it. Fill mode keeps at least two colors.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{keys("Graph: arrows · Shift+arrows · Alt+Left/Right")}</dt>
                <dd>Move a center or resize an edge · Adjust by ten steps · Select the previous/next band.</dd>
              </div>
              <div>
                <dt className="font-semibold">{keys("Gradient dots: arrows · Shift+arrows · Home / End")}</dt>
                <dd>
                  Move a color stop · Move ten steps · Move to its allowed limits. The exposure reference stop stays
                  fixed.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{keys("Preview: F · Video: Left/Right · Shift+Left/Right")}</dt>
                <dd>
                  Expand the focused image preview · Select the previous/next decoded frame · Jump ten frames. Focus the
                  preview or a button, rather than a field or slider. Frame shortcuts pause while decoding.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{keys("Escape")}</dt>
                <dd>
                  Cancel the active field draft, close a color picker or dialog, or cancel a palette preview. It affects
                  only the active interaction.
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              File, palette, verification and export actions use their visible controls. Browser shortcuts remain
              available. Disabled actions keep the same restrictions when using the keyboard.
            </p>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  )
}

// Separators stay as text so shortcut labels read the same to screen readers.
function keys(label: string): ReactNode {
  return label
    .split(/( · | \/ |: )/)
    .map((part, index) => (index % 2 || /^[a-z]+$/.test(part) ? part : <Kbd key={index}>{part}</Kbd>))
}
