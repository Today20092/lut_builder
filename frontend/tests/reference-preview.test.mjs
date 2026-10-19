import assert from 'node:assert/strict'
import test from 'node:test'
import { cameraInputFromSrgb } from '../src/sampleMath.ts'
import { logDecodeAtGrid, sourceToTargetMatrices } from '../src/lutColorData.ts'

test('display samples are linearized and converted to each camera gamut before LUT input', () => {
  for (const profile of Object.keys(logDecodeAtGrid)) {
    const input = cameraInputFromSrgb([0.5, 0.5, 0.5], profile)
    assert.ok(input.every(value => value >= 0 && value <= 1))
    const grid = logDecodeAtGrid[profile]
    const linear = input.map(value => {
      const x = value * 64, low = Math.min(63, Math.floor(x))
      return grid[low] + (grid[low + 1] - grid[low]) * (x - low)
    })
    const matrix = sourceToTargetMatrices[profile]['Rec.709']
    const rgb = [0, 1, 2].map(row => [0, 1, 2].reduce((sum, i) => sum + matrix[row * 3 + i] * linear[i], 0))
    for (const channel of rgb) assert.ok(Math.abs(channel - 0.21404114) < 1e-6, `${profile}: ${channel}`)
    assert.notDeepEqual(input, [0.5, 0.5, 0.5])
  }
})
