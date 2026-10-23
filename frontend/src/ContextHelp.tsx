import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

/** Explanatory help must open with a tap as well as a mouse or keyboard. */
export function ContextHelp({ label, children }: { label: string; children: string }) {
  return <Popover>
    <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" />} aria-label={label}>
      <CircleHelp aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent className="max-w-[calc(100vw-2rem)]">
      <PopoverTitle>{label}</PopoverTitle>
      <PopoverDescription>{children}</PopoverDescription>
    </PopoverContent>
  </Popover>
}
