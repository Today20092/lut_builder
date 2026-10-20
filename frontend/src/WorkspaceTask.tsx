import { useContext, useState, type ReactNode } from "react"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

import { WorkspaceNavigation } from "./workspaceNavigation"

export function WorkspaceActionText({ desktop, mobile }: { desktop: string; mobile: string }) {
  return <>{useContext(WorkspaceNavigation).mobile ? mobile : desktop}</>
}

/** A task gets a dedicated phone screen, while retaining its desktop disclosure. */
export function WorkspaceTask({ id, title, children, lead, desktopInline = false, className = "rounded-lg border p-3" }: { id: string; title: string; children: ReactNode; lead?: ReactNode; desktopInline?: boolean; className?: string }) {
  const { mobile, task, openTask } = useContext(WorkspaceNavigation)
  if (!mobile && !desktopInline) return <>{lead}<details className={`workspace-task ${className}`}><summary className="cursor-pointer text-sm font-medium">{title}</summary>{children}</details></>
  return <div className="workspace-task" data-inline={desktopInline} data-task-id={id} data-open={task === id}>
    {mobile && task !== id && <Button type="button" variant="ghost" className="workspace-task-link" onClick={() => openTask(id)}>{title}<ChevronRight aria-hidden="true" /></Button>}
    <section hidden={mobile && task !== id} aria-label={mobile ? title : undefined}>
      {mobile && <><Button type="button" variant="ghost" onClick={() => openTask("")}><ArrowLeft aria-hidden="true" />Back</Button>
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
  return <details className={`workspace-disclosure ${className ?? ""}`} open={mobile || expanded} onToggle={(event) => { if (!mobile) setExpanded(event.currentTarget.open) }}>
    <summary className={summaryClassName} hidden={mobile}>{title}</summary>
    <h3 hidden={!mobile} className="font-medium">{title}</h3>
    {children}
  </details>
}
