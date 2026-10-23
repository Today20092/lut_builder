import type { ComponentProps } from "react"
import { ArrowUpRight } from "lucide-react"

export function HelpLink({ children, ...props }: ComponentProps<"a">) {
  return <a {...props} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-4">{children}<ArrowUpRight className="size-4 shrink-0" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
}
