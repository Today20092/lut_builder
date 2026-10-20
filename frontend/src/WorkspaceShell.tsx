import { Children, isValidElement, useRef, useState, type ReactNode } from "react"
import { Tabs } from "@base-ui/react/tabs"
import { ArrowLeft, ChevronRight, Download, Ellipsis, FileJson, Image, Layers, Palette, SlidersHorizontal, WandSparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Setup } from "./editor"
import { useMobileWorkspace, WorkspaceNavigation } from "./workspaceNavigation"

const sections = [
  { value: "bands", label: "Bands", icon: SlidersHorizontal },
  { value: "palette", label: "Palette", icon: Palette },
  { value: "presets", label: "Presets", icon: WandSparkles },
  { value: "media", label: "Media", icon: Image },
  { value: "configuration", label: "Configure", icon: Layers },
  { value: "files", label: "Setups", icon: FileJson },
  { value: "export", label: "Export", icon: Download },
] as const

export function WorkspacePanel({ value, children }: { value: string; children: ReactNode }) {
  return <section data-workspace-section={value} className="workspace-panel">{children}</section>
}

export function WorkspaceShell({ setup, stage, illustration, feedback, shortcuts, children, busy }: {
  setup: Setup; stage: (editBands: () => void) => ReactNode; illustration: ReactNode; feedback: ReactNode; shortcuts: ReactNode; children: ReactNode; busy: boolean
}) {
  const [requestedSection, setSection] = useState("bands")
  const [task, setTask] = useState("")
  const mobile = useMobileWorkspace()
  const section = !mobile && requestedSection === "more" ? "bands" : requestedSection
  const returnFocus = useRef<HTMLElement | null>(null)
  const bandsTab = useRef<HTMLButtonElement>(null)
  function open(value: string) {
    if (section === "bands" && value !== "bands") returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSection(value)
    setTask("")
    if (mobile) requestAnimationFrame(() => {
      window.scrollTo(0, 0)
      document.getElementById("workspace-screen-title")?.focus({ preventScroll: true })
    })
  }
  function back() {
    setSection("bands")
    requestAnimationFrame(() => {
      if (mobile) { document.querySelector<HTMLElement>('.workspace-mobile-navigation > button')?.focus(); return }
      const previous = returnFocus.current
      if (previous?.isConnected && !previous.closest('[hidden]')) previous.focus()
      else bandsTab.current?.focus()
    })
  }
  const secondary = ["configuration", "files", "export"].includes(section)
  function openTask(value: string) {
    setTask(value)
    requestAnimationFrame(() => { window.scrollTo(0, 0); document.querySelector<HTMLElement>(value ? '.workspace-task[data-open="true"] button' : '.workspace-task-link')?.focus({ preventScroll: true }) })
  }
  return <WorkspaceNavigation.Provider value={{ mobile, task, openTask }}><main className="workspace" data-section={section} data-task={mobile ? task : ""} data-imported={Boolean(setup.imported_lut)} onKeyDown={(event) => {
    if (event.key === "Escape" && mobile && task && !event.defaultPrevented && !(event.target instanceof Element && event.target.closest('dialog, [role="dialog"], [data-slot="popover-content"]'))) { event.preventDefault(); openTask(""); return }
    if (event.key !== "Escape" || event.defaultPrevented || section === "bands") return
    if (event.target instanceof Element && event.target.closest('dialog, [role="dialog"], [data-slot="popover-content"]')) return
    event.preventDefault()
    back()
  }}>
    <a href="#workspace-adjustments" className="workspace-skip">Skip to adjustments</a>
    <header className="workspace-header">
      <div className="workspace-brand"><Layers aria-hidden="true" /><h1>LUT Builder</h1><span>Workbench</span></div>
      <div className="workspace-header-actions">
        {shortcuts}
        <a href={`${import.meta.env.BASE_URL}docs/`} target="_blank" rel="noreferrer">Help<span className="sr-only"> / Manual (opens in a new tab)</span></a>
        <Button type="button" onClick={() => open("export")} disabled={busy}><Download data-icon="inline-start" />Export LUT</Button>
      </div>
    </header>
    <div className="workspace-interpretation" aria-label="Active interpretation">
      <span>{setup.profile}</span><span aria-hidden="true">→</span><span>{setup.target}{setup.imported_lut ? ` / ${setup.imported_lut.output_transfer}` : ""}</span>
      <span>{setup.cube_size}³ · {setup.legal_range ? "Legal" : "Full"} range</span>
      <button type="button" onClick={() => open("configuration")} disabled={busy}>Change<span className="sr-only"> configuration</span></button>
    </div>
    <Tabs.Root value={section === "more" ? "bands" : section} onValueChange={(value) => open(String(value))} className="workspace-body">
      <nav className="workspace-navigation" aria-label="Workbench sections">
        <Tabs.List className="workspace-tabs" activateOnFocus={false} aria-label="Editing sections">
          {sections.map(({ value, label, icon: Icon }) => <Tabs.Tab key={value} value={value} ref={value === "bands" ? bandsTab : undefined} disabled={busy} className="workspace-tab"><Icon aria-hidden="true" /><span>{label}</span></Tabs.Tab>)}
        </Tabs.List>
        <a className="workspace-report" href="https://github.com/Today20092/lut_builder/issues/new/choose" target="_blank" rel="noreferrer">Report an issue<span className="sr-only"> (GitHub, opens in a new tab)</span></a>
      </nav>
      <div className="workspace-mobile-title">
        {secondary && <Button type="button" variant="ghost" onClick={() => open(section === "export" ? "bands" : "more")}><ArrowLeft aria-hidden="true" />{section === "export" ? "Back to editing" : "More"}</Button>}
        <h2 id="workspace-screen-title" tabIndex={-1}>{section === "more" ? "More" : sections.find(item => item.value === section)?.label}</h2>
      </div>
      <section className="workspace-stage" aria-label="Exposure workspace">{stage(() => { setSection("bands"); setTask("") })}{!mobile && illustration}</section>
      <aside id="workspace-adjustments" className="workspace-adjustments" aria-label="Workspace adjustments">
        <div className="workspace-panel-heading">
          <span>{sections.find((item) => item.value === section)?.label}</span>
          {section !== "bands" && <Button type="button" variant="ghost" onClick={back}>Back to bands</Button>}
        </div>
        <div id="workspace-panel-content" className="workspace-panel-content">
          {!mobile && feedback}
          {section === "more" && <section className="workspace-more" aria-label="More options">
            {sections.filter(item => ["configuration", "files"].includes(item.value)).map(({ value, label, icon: Icon }) => <Button key={value} type="button" variant="ghost" disabled={busy} onClick={() => open(value)}><Icon aria-hidden="true" />{label}<ChevronRight aria-hidden="true" /></Button>)}
            <a href={`${import.meta.env.BASE_URL}docs/`} target="_blank" rel="noreferrer">Help / Manual (opens in a new tab)</a>
            <a href="https://github.com/Today20092/lut_builder/issues/new/choose" target="_blank" rel="noreferrer">Report an issue (GitHub, opens in a new tab)</a>
          </section>}
          {sections.map(({ value }) => <Tabs.Panel key={value} value={value} keepMounted tabIndex={0}>
            <fieldset disabled={busy} className="@container workspace-fields" hidden={section === "more"}>
              {Children.toArray(children).filter((child) => isValidElement<{ value: string }>(child) && child.type === WorkspacePanel && child.props.value === value)}
            </fieldset>
          </Tabs.Panel>)}
          {Children.toArray(children).filter((child) => !isValidElement(child) || child.type !== WorkspacePanel)}
          {mobile && <div hidden={!["bands", "palette"].includes(section) || Boolean(task)} className="workspace-mobile-photo">{illustration}</div>}
          {mobile && <div className="workspace-feedback-area">{feedback}</div>}
        </div>
      </aside>
    </Tabs.Root>
    <nav className="workspace-mobile-navigation" aria-label="Mobile navigation">
      {[...sections.slice(0, 4), { value: "more", label: "More", icon: Ellipsis }].map(({ value, label, icon: Icon }) => <button key={value} type="button" disabled={busy} aria-current={(section === value || value === "more" && secondary) ? "page" : undefined} onClick={() => open(value)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    </nav>
  </main></WorkspaceNavigation.Provider>
}
