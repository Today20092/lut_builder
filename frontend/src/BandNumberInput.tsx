import { Input } from "@/components/ui/input"
import { useId, useState } from "react"
import { stepBandValue } from "./editor"

// Text input keeps unfinished decimals intact and has no wheel stepping.
export function BandNumberInput({ value, onChange, step, min = -Infinity, max = Infinity, ...props }: {
  value: number | ""
  onChange: (value: number) => void
  step: number
  min?: number
  max?: number
  "aria-label": string
  className?: string
  disabled?: boolean
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const parsed = draft === null || !draft.trim() ? NaN : Number(draft)
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max
  const invalid = draft !== null && !valid
  const errorId = useId()
  const hint = Number.isFinite(min) && Number.isFinite(max) ? `Enter a number from ${min} to ${max}.` : Number.isFinite(min) ? `Enter ${min} or more.` : "Enter a number."
  function commit() {
    if (valid) onChange(parsed)
    setDraft(null)
  }
  return <><Input {...props} type="text" inputMode="decimal" value={draft ?? value}
    aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
    onChange={(event) => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return
      if (event.key === "Enter") { event.preventDefault(); commit() }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(null) }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        event.preventDefault()
        const current = valid ? parsed : value === "" ? 0 : value
        onChange(stepBandValue(current, event.key === "ArrowUp" ? 1 : -1, step * (event.shiftKey ? 10 : 1), min, max))
        setDraft(null)
      }
    }} /><span id={errorId} role="status" className="empty:hidden block text-xs text-destructive">{invalid ? `${hint} Leaving restores the last value.` : ""}</span></>
}
