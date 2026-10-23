import { Children, isValidElement, useState, type ReactNode } from "react"
import { Tabs } from "@base-ui/react/tabs"
import { ArrowUpRight, BookOpen, Download, Image, Layers, MessageSquareWarning, Settings2, SlidersHorizontal, WandSparkles } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Setup } from "./editor"
import { useMobileWorkspace, useWorkspaceLocation, WorkspaceNavigation } from "./workspaceNavigation"
import { WorkspaceSheet } from "./WorkspaceSheet"

const destinations = [
  { value: "presets", label: "Presets", icon: WandSparkles, description: "Choose a starting exposure arrangement." },
  { value: "bands", label: "Edit", icon: SlidersHorizontal, description: "Shape your exposure bands and colors." },
  { value: "media", label: "Preview", icon: Image, description: "Preview a sample image or verify your own camera media." },
  { value: "configuration", label: "Settings", icon: Settings2, description: "Camera, output and saved work." },
] as const

export function WorkspacePanel({ value, children }: { value: string; children: ReactNode }) {
  return <section data-workspace-section={value} className="workspace-panel">{children}</section>
}

export function WorkspaceShell({ setup, stage, illustration, feedback, shortcuts, children, busy, onNew }: {
  setup: Setup; stage: (editBands: () => void) => ReactNode; illustration: (editBands: () => void) => ReactNode; feedback: ReactNode; shortcuts: ReactNode; children: ReactNode; busy: boolean; onNew: () => void
}) {
  const { section, open } = useWorkspaceLocation()
  const [exporting, setExporting] = useState(false)
  const mobile = useMobileWorkspace()
  const destination = section === "palette" ? "bands" : section
  const screen = destinations.find(item => item.value === destination)!
  const ScreenIcon = screen.icon
  const panels = Children.toArray(children)
  const content = (value: string) => panels.filter(child => isValidElement<{ value: string }>(child) && child.type === WorkspacePanel && child.props.value === value)
  const extras = panels.filter(child => !isValidElement(child) || child.type !== WorkspacePanel)
  const editBands = () => open("bands")

  return <WorkspaceNavigation.Provider value={{ mobile }}><main className="workspace" data-section={section} data-imported={Boolean(setup.imported_lut)} onClick={event => {
    if (event.target instanceof Element && event.target.closest('[data-workspace-action="review-palette"]')) {
      const state = { ...window.history.state }
      delete state.lutBuilderSheet
      window.history.replaceState(state, "")
      setExporting(false)
      open("palette")
    }
  }}>
    <a href="#workspace-adjustments" className="workspace-skip">Skip to adjustments</a>
    <header className="workspace-header">
      <div className="workspace-brand"><Layers aria-hidden="true" /><h1>LUT Builder</h1><span>Workbench</span></div>
      <div className="workspace-header-actions">{shortcuts}<Button className="workspace-new-desktop" variant="ghost" onClick={onNew} disabled={busy}>New LUT</Button><Button type="button" onClick={() => setExporting(true)}><Download data-icon="inline-start" aria-hidden="true" />Export LUT</Button></div>
    </header>
    <div className="workspace-interpretation" aria-label="Active interpretation"><span>{setup.profile}</span><span aria-hidden="true">→</span><span>{setup.target}{setup.imported_lut ? ` / ${setup.imported_lut.output_transfer}` : ""}</span><span>{setup.cube_size}³ · {setup.legal_range ? "Legal" : "Full"} range</span><button type="button" onClick={() => open("configuration")} disabled={busy}>Change<span className="sr-only"> configuration</span></button></div>
    <Tabs.Root value={destination} onValueChange={value => open(value as typeof destination)} className="workspace-body">
      <nav className="workspace-navigation" aria-label="Workbench sections"><Tabs.List className="workspace-tabs" activateOnFocus={false} aria-label="Editing sections">{destinations.map(({ value, label, icon: Icon }) => <Tabs.Tab key={value} value={value} disabled={busy} className="workspace-tab"><Icon aria-hidden="true" /><span>{label}</span></Tabs.Tab>)}</Tabs.List></nav>
      <div className="workspace-mobile-title">
        <div className="workspace-screen-heading"><ScreenIcon aria-hidden="true" /><h2 id="workspace-screen-title" tabIndex={-1}>{screen.label}</h2></div><p>{screen.description}</p>
        {destination === "bands" && <ToggleGroup className="workspace-edit-tools w-full" aria-label="Edit tools" value={[section]} onValueChange={values => { const next = values[0]; if (next === "bands" || next === "palette") open(next) }} disabled={busy}>{(["bands", "palette"] as const).map(value => <ToggleGroupItem key={value} value={value}>{value === "bands" ? "Bands" : "Palette"}</ToggleGroupItem>)}</ToggleGroup>}
      </div>
      <section className="workspace-stage" aria-label="Exposure workspace">{stage(editBands)}</section>
      <aside id="workspace-adjustments" className="workspace-adjustments" aria-label="Workspace adjustments"><div id="workspace-panel-content" className="workspace-panel-content">
        {!mobile && feedback}
        {destinations.map(({ value }) => <Tabs.Panel key={value} value={value} keepMounted tabIndex={0}>
          <fieldset disabled={busy} className="@container workspace-fields">
            {value === "media" && <div className="mx-5 mb-6">{illustration(editBands)}</div>}
            {value === "bands" ? <><div hidden={section !== "bands"}>{content("bands")}</div><div hidden={section !== "palette"}>{content("palette")}</div></> : content(value)}
            {value === "configuration" && <>
              <section className="workspace-saved-setups" aria-label="Saved setups"><h3 className="text-sm font-semibold">Saved setups</h3><p className="text-xs text-muted-foreground">Save, load and recover your work</p>{content("files")}</section>
              <section className="workspace-settings-actions" aria-label="Workspace actions"><Button type="button" variant="outline" onClick={onNew}><WandSparkles aria-hidden="true" />New LUT</Button>{[{ label: "Help / Manual", href: `${import.meta.env.BASE_URL}docs/`, icon: BookOpen }, { label: "Report an issue", href: "https://github.com/Today20092/lut_builder/issues/new/choose", icon: MessageSquareWarning }].map(({ label, href, icon: Icon }) => <a key={label} className={buttonVariants({ variant: "ghost" })} href={href} target="_blank" rel="noreferrer"><Icon data-icon="inline-start" aria-hidden="true" />{label}<ArrowUpRight data-icon="inline-end" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>)}</section>
            </>}
          </fieldset>
        </Tabs.Panel>)}
        {mobile && <div className="workspace-feedback-area">{feedback}</div>}
      </div></aside>
    </Tabs.Root>
    <nav className="workspace-mobile-navigation" aria-label="Mobile navigation">{destinations.map(({ value, label, icon: Icon }) => <button key={value} type="button" disabled={busy} aria-current={destination === value ? "page" : undefined} onClick={() => open(value)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>
    <WorkspaceSheet open={exporting} title="Export LUT" onClose={() => setExporting(false)}><fieldset disabled={busy} className="workspace-fields">{content("export")}</fieldset>{extras}</WorkspaceSheet>
  </main></WorkspaceNavigation.Provider>
}
