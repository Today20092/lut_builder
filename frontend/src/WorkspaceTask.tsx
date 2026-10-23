import { useContext, type ReactNode } from "react"
import { Settings2, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { WorkspaceNavigation } from "./workspaceNavigation"

export function WorkspaceActionText({ desktop, mobile }: { desktop: string; mobile: string }) {
  return <>{useContext(WorkspaceNavigation).mobile ? mobile : desktop}</>
}

/** Routine options expand in place on every screen size. */
export function WorkspaceTask({ id, title, children, lead, icon: Icon = Settings2, className = "" }: { id: string; title: string; children: ReactNode; lead?: ReactNode; icon?: LucideIcon; className?: string }) {
  return <>{lead}<details className={cn("workspace-task workspace-settings-group", className)} data-task-id={id}><summary><Icon aria-hidden="true" /><span>{title}</span></summary><div className="workspace-disclosure-content">{children}</div></details></>
}

export function WorkspaceDisclosure({ title, className, children, summaryClassName = "" }: { title: ReactNode; className?: string; children: ReactNode; summaryClassName?: string }) {
  return <details className={cn("workspace-disclosure workspace-settings-group", className)}><summary className={summaryClassName}>{title}</summary><div className="workspace-disclosure-content">{children}</div></details>
}
