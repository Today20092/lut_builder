import test from 'node:test'
import assert from 'node:assert/strict'
import { sectionFromHistory } from '../src/workspaceNavigation.ts'

test('history accepts workspace destinations and ignores unrelated browser state', () => {
  for (const section of ['bands', 'palette', 'presets', 'media', 'configuration']) {
    assert.equal(sectionFromHistory({ lutBuilderSection: section, lutBuilderSheet: 'export' }), section)
  }
  for (const state of [null, undefined, 'bands', {}, { lutBuilderSection: 'export' }, { lutBuilderSection: 1 }]) {
    assert.equal(sectionFromHistory(state), null)
  }
})
