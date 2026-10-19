---
title: Why purple and red appear
description: Recorded-signal warning thresholds, per-channel tests, cube tolerance, and their limits.
---

Purple normally marks the low recorded-signal warning; red normally marks the high warning. You can change these colors. A purple or red **exposure band** is separate from a warning and can have a different meaning.

A warning means at least one incoming red, green, or blue channel reaches the selected profile's encoded-signal boundary, including the LUT sampling tolerance described below. It does **not** prove that the sensor clipped or that shadow detail is unusable.

## How are these limits calculated?

The camera profile supplies two constants: a low threshold `F` and a high threshold `C`. They are normalized camera-encoded RGB values, not stops, display IRE, percentages of sensor capacity, or a measurement made from your uploaded image.

The nominal tests are:

```text
low  = minimum(R, G, B) <= F
high = maximum(R, G, B) >= C
```

One channel is enough. A saturated blue object can trigger the low warning because its red channel is low, even when the object looks bright. A colored highlight can trigger the high warning before all three channels are high.

The constants and their evidence differ by camera. See [Camera thresholds and sources](../profiles/); values with incomplete historical derivations are identified there.

## Cube size and tolerance

A cube samples a regular RGB grid rather than every possible input. The maintained exporter widens each warning test by half one grid interval:

```text
tolerance = 0.5 / (cube_size - 1)
low  = minimum(R, G, B) <= F + tolerance
high = maximum(R, G, B) >= C - tolerance
```

| Cube size | Tolerance in normalized input |
| ---: | ---: |
| 17 | 0.03125 |
| 33 | 0.015625 |
| 65 | 0.0078125 |

These are tests at **lattice nodes**. Between nodes, the camera, monitor, or editor interpolates the cube. That can blend warning colors and soften the apparent edge. A 65³ cube reduces the sampling interval; it does not establish a more accurate sensor limit. A zero-width band may miss the lattice altogether.

## Which color wins?

The exporter first creates the base image and exposure bands or Fill zones. It then applies the enabled low warning, followed by the enabled high warning. Therefore:

1. High warning wins when both warnings trigger.
2. Low warning wins over exposure bands when only low triggers.
3. Otherwise the exposure band, Fill zone, or base image remains.

For example, with a Sony profile and both warnings enabled, the grid input `(0, 0.5, 1)` triggers both tests. The exported node receives the high-warning color. It is not a neutral white highlight; the decision came from two different channels.

## Input range is not output range

The RGB values must already be in the domain expected by the log decoder. A 10-bit full-range code can be normalized as `code / 1023`. When a signal genuinely requires video-range expansion, the corresponding conversion is `(code - 64) / 876`. These are different inputs. Do not apply expansion simply because a file uses a video container.

The builder's **Video / Legal** output-range choice changes the final LUT **output** into the 64–940 interval. It does not reinterpret the input and does not fix a camera/profile mismatch. Blackmagic's profile has a specific expanded-input convention explained in its [profile reference](../profiles/#blackmagic-film-gen-5).

## What the warnings cannot establish

A LUT sees processed RGB values. Sensor saturation, usable noise floor, exposure index, white balance, camera mode, highlight recovery, and the preceding processing chain can all affect the relationship between those values and the captured scene. The app does not calibrate the limits to your camera body or ISO.

Use a controlled camera test and your monitoring system's scopes to decide what is usable for your work. Disabling a warning only hides its indicator; it does not recover detail. Changing its color changes the label, not the threshold.

For calculation and validation background, see the repository's [false-color correctness research](https://github.com/Today20092/lut_builder/blob/main/docs/research/false-color-lut-correctness.md) and [sensor-clipping research](https://github.com/Today20092/lut_builder/blob/main/docs/research/sensor-clipping-monitoring-lut.md).
