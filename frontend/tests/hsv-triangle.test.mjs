import assert from "node:assert/strict"
import test from "node:test"
import { hsvTriangleContains, hsvTrianglePoint, hsvTriangleValue, hueWheelPoint, hueWheelValue, triangleWeights } from "../src/hsvTriangle.ts"

test("HSV triangle vertices encode the hue, white and black at every rotation", () => {
  for (const hue of [0, 37, 120, 240, 359]) {
    for (const [saturation, value] of [[1, 1], [0, 1], [0, 0]]) {
      const point = hsvTrianglePoint(saturation, value, hue)
      assert.equal(hsvTriangleContains(point, hue), true)
      const actual = hsvTriangleValue(point, hue)
      assert.ok(Math.abs(actual.saturation - saturation) < 1e-8)
      assert.ok(Math.abs(actual.value - value) < 1e-8)
    }
  }
  assert.deepEqual(triangleWeights(hsvTrianglePoint(1, 1, 0)), [1, 0, 0])
})

test("HSV triangle selection round trips saturation and brightness without changing hue", () => {
  for (const hue of [0, 45, 120, 240, 359]) {
    for (const saturation of [0, 0.1, 0.5, 1]) {
      for (const value of [0.1, 0.5, 1]) {
        const actual = hsvTriangleValue(hsvTrianglePoint(saturation, value, hue), hue)
        assert.ok(Math.abs(actual.saturation - saturation) < 1e-8)
        assert.ok(Math.abs(actual.value - value) < 1e-8)
      }
    }
    assert.ok(Math.abs(hueWheelValue(hueWheelPoint(hue)) - hue) < 1e-8)
  }
})

test("drags outside the HSV triangle remain bounded", () => {
  for (const hue of [0, 90, 225]) {
    for (const point of [{ x: -100, y: 0 }, { x: 400, y: 400 }, { x: 110, y: 0 }]) {
      assert.equal(hsvTriangleContains(point, hue), false)
      const actual = hsvTriangleValue(point, hue)
      assert.ok(actual.saturation >= 0 && actual.saturation <= 1)
      assert.ok(actual.value >= 0 && actual.value <= 1)
    }
  }
})
