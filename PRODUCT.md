# LUT Builder

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Videographers creating diagnostic LUTs on their phones while on the go. Advanced
users also work on desktop with more room for controls and media verification.

## Product Purpose

Create, edit, preview and export false-color scene-exposure LUTs. A complete phone
workflow is the primary success criterion; desktop supports the same work.

## Positioning

Camera-specific log exposure classification and an editable labeled exposure scale
connect band colors to source exposure. Preview illustrations are distinguished
from verification of an actual serialized LUT on declared camera media.

## Operating Context

Users choose a camera and display interpretation, edit band colors and ranges,
optionally inspect their own still/video, and export a cube for their camera or
monitor. Setup files move work between devices. Browser storage stays device-local.

## Capabilities and Constraints

Retain stops, IRE and fill modes, manual colors, palette drafts and persistence,
undo, setup import/export and still/video verification. Infrequent configuration,
presets, file management, cube size and filenames belong outside frequent edits.
Restore supported setup state without claiming to retain camera media access.
No accounts, cloud synchronization or physical sensor clipping claims.
Imported-LUT composition is defined separately in issue #56.

## Brand Commitments

The user chose Lightroom as the interface direction: neutral surfaces, a prominent
preview and restrained controls. The existing labeled exposure scale remains;
neither a new grayscale ramp nor a mandatory sample image is wanted.

## Evidence on Hand

Existing camera data and numerical tests, exposure-scale and band editor modules,
verified-media workflows, bundled illustrative photos, and UI screenshot fixtures.
Illustrations do not establish exposure provenance or display calibration.

## Product Principles

- Keep the preview and frequent editing together on a phone.
- Separate one-time interpretation from repeated adjustments.
- Preserve valid work and explain recovery before replacing it.
- Distinguish illustrative previews from numerically verified artifacts.
- Keep the implementation organized for future editing workflows.

## Accessibility & Inclusion

Support keyboard operation, numeric precision, touch targets, light/dark themes,
reduced motion, narrow screens, on-screen keyboards and safe-area insets.
