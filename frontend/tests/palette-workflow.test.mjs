import assert from 'node:assert/strict'
import test from 'node:test'
import { createPaletteWorkflow, reducePaletteWorkflow } from '../src/paletteWorkflow.ts'

test('palette preview, cancellation, method changes and application are explicit transitions', () => {
  const draft = { colors: ['#000000', '#ffffff'], brightness: 'custom', intensity: 100 }
  const initial = createPaletteWorkflow(draft)
  const preview = reducePaletteWorkflow(initial, { type: 'preview', draft, label: 'Example' })
  assert.equal(preview.audition, true)
  assert.equal(preview.method, 'palette')
  const canceled = reducePaletteWorkflow(preview, { type: 'cancel' })
  assert.equal(canceled.audition, false)
  assert.equal(canceled.method, 'palette')
  const gradient = reducePaletteWorkflow(canceled, { type: 'choose-method', method: 'gradient' })
  assert.equal(gradient.method, 'gradient')
  assert.equal(gradient.audition, false)
  const applied = reducePaletteWorkflow(reducePaletteWorkflow(gradient, { type: 'preview', draft, label: 'Custom gradient' }), { type: 'apply' })
  assert.equal(applied.audition, false)
  assert.equal(applied.label, 'Custom gradient')
  assert.deepEqual(reducePaletteWorkflow(initial, { type: 'apply' }), initial)
})
