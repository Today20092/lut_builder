import { useState } from "react"
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
  function commit() {
    if (valid) onChange(parsed)
    setDraft(null)
  }
  return <input {...props} type="text" inputMode="decimal" value={draft ?? value}
    aria-invalid={draft !== null && !valid || undefined}
    onChange={(event) => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); commit() }
      if (event.key === "Escape") { event.preventDefault(); setDraft(null) }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault()
        const current = valid ? parsed : value === "" ? 0 : value
        onChange(stepBandValue(current, event.key === "ArrowUp" ? 1 : -1, step, min, max))
        setDraft(null)
      }
    }} />
}
