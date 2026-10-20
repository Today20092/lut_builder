import { useContext, useState, type ReactNode } from "react"
import { ArrowLeft, ChevronRight, Settings2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { WorkspaceNavigation } from "./workspaceNavigation"

export function WorkspaceActionText({ desktop, mobile }: { desktop: string; mobile: string }) {
  return <>{useContext(WorkspaceNavigation).mobile ? mobile : desktop}</>
}

/** A task gets a dedicated phone screen, while retaining its desktop disclosure. */
export function WorkspaceTask({ id, title, children, lead, icon: Icon = Settings2, desktopInline = false, className = "rounded-lg border p-3" }: { id: string; title: string; children: ReactNode; lead?: ReactNode; icon?: LucideIcon; desktopInline?: boolean; className?: string }) {
  const { mobile, task, openTask } = useContext(WorkspaceNavigation)
  if (!mobile && !desktopInline) return <>{lead}<details className={cn("workspace-task", className)}><summary className="cursor-pointer text-sm font-medium">{title}</summary>{children}</details></>
  return <div className="workspace-task" data-inline={desktopInline} data-task-id={id} data-open={task === id}>
    {mobile && task !== id && <Button type="button" variant="ghost" className="workspace-task-link" onClick={() => openTask(id)}><Icon data-icon="inline-start" aria-hidden="true" /><span>{title}</span><ChevronRight data-icon="inline-end" aria-hidden="true" /></Button>}
    <section hidden={mobile && task !== id} aria-label={mobile ? title : undefined}>
      {mobile && <><Button type="button" variant="ghost" onClick={() => openTask("")}><ArrowLeft data-icon="inline-start" aria-hidden="true" />Back</Button>
      <h2 className="mb-5 mt-3 text-xl font-semibold">{title}</h2></>}
      {lead}
      {children}
    </section>
  </div>
}

/** Tab content is already a destination: do not require a second expand action. */
export function WorkspaceDisclosure({ title, className, children, summaryClassName = "cursor-pointer font-medium" }: { title: ReactNode; className?: string; children: ReactNode; summaryClassName?: string }) {
  const { mobile } = useContext(WorkspaceNavigation)
  const [expanded, setExpanded] = useState(false)
  // Keep the content mounted when viewport changes: media and open forms survive.
  return <details className={cn("workspace-disclosure", className)} open={mobile || expanded} onToggle={(event) => { if (!mobile) setExpanded(event.currentTarget.open) }}>
    <summary className={summaryClassName} hidden={mobile}>{title}</summary>
    <h3 hidden={!mobile} className="font-medium">{title}</h3>
    {children}
  </details>
}
