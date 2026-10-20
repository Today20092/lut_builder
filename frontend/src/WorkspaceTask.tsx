import { useContext, type ReactNode } from "react"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

import { WorkspaceNavigation } from "./workspaceNavigation"

/** A task gets a dedicated phone screen, while retaining its desktop disclosure. */
export function WorkspaceTask({ id, title, children, lead, desktopInline = false, className = "rounded-lg border p-3" }: { id: string; title: string; children: ReactNode; lead?: ReactNode; desktopInline?: boolean; className?: string }) {
  const { mobile, task, openTask } = useContext(WorkspaceNavigation)
  if (!mobile) return desktopInline ? <>{children}</> : <>{lead}<details className={`workspace-task ${className}`}><summary className="cursor-pointer text-sm font-medium">{title}</summary>{children}</details></>
  return <div className="workspace-task" data-task-id={id} data-open={task === id}>
    {task !== id && <Button type="button" variant="ghost" className="workspace-task-link" onClick={() => openTask(id)}>{title}<ChevronRight aria-hidden="true" /></Button>}
    <section hidden={task !== id} aria-label={title}>
      <Button type="button" variant="ghost" onClick={() => openTask("")}><ArrowLeft aria-hidden="true" />Back</Button>
      <h2 className="mb-5 mt-3 text-xl font-semibold">{title}</h2>
      {lead}
      {children}
    </section>
  </div>
}

/** Tab content is already a destination: do not require a second expand action. */
export function WorkspaceDisclosure({ title, className, children, summaryClassName = "cursor-pointer font-medium" }: { title: ReactNode; className?: string; children: ReactNode; summaryClassName?: string }) {
  const { mobile } = useContext(WorkspaceNavigation)
  if (mobile) return <section className={className}><h3 className="font-medium">{title}</h3>{children}</section>
  return <details className={className}><summary className={summaryClassName}>{title}</summary>{children}</details>
}
