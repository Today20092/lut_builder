import type { GradientBlend, HuePath, LightnessProfile, PaletteMapping } from './editor'

export type PaletteDraft = { colors: string[]; positions?: number[]; brightness: LightnessProfile; intensity: number; blend?: GradientBlend; huePath?: HuePath; mapping?: PaletteMapping }
type Method = 'palette' | 'gradient'
type PaletteWorkflow = { draft: PaletteDraft; label: string; method: Method; audition: boolean }
type PaletteEvent =
  | { type: 'choose-method'; method: Method }
  | { type: 'preview'; draft: PaletteDraft; label: string }
  | { type: 'apply' | 'cancel' }

export function createPaletteWorkflow(draft: PaletteDraft): PaletteWorkflow {
  return { draft, label: 'Custom gradient', method: 'palette', audition: false }
}

export function reducePaletteWorkflow(state: PaletteWorkflow, event: PaletteEvent): PaletteWorkflow {
  switch (event.type) {
    case 'choose-method': return { ...state, method: event.method, audition: false }
    case 'preview': return { ...state, draft: event.draft, label: event.label, audition: true }
    case 'apply':
    case 'cancel': return state.audition ? { ...state, audition: false } : state
  }
}
