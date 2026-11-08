import type { ComponentProps } from "react"
import { ArrowUpRight } from "lucide-react"

/** A link leaving the workspace; the arrow and hidden text tell sighted and screen-reader users alike. */
export function ExternalLink({ children, ...props }: ComponentProps<"a">) {
  return <a {...props} target="_blank" rel="noreferrer">{children}<ArrowUpRight data-icon="inline-end" className="size-4 shrink-0" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
}

export function HelpLink(props: ComponentProps<"a">) {
  return <ExternalLink {...props} className="inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-4" />
}
