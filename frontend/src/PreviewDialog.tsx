import type { ReactNode, RefObject } from "react"
import { Minimize } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/** Enlarged view of on-page content; closing returns focus to the control that opened it. */
export function PreviewDialog({
  open,
  onClose,
  title,
  closeLabel,
  returnFocus,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  closeLabel: string
  returnFocus: RefObject<HTMLElement | null>
  className?: string
  children: ReactNode
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogPopup
        showCloseButton={false}
        bottomStickOnMobile={false}
        finalFocus={returnFocus}
        className={cn("block overflow-auto p-4 sm:max-w-6xl", className)}
      >
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center justify-between gap-3 bg-popover pb-2">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <Button type="button" variant="outline" onClick={onClose}>
            <Minimize data-icon="inline-start" aria-hidden="true" />
            {closeLabel}
          </Button>
        </div>
        {children}
      </DialogPopup>
    </Dialog>
  )
}
