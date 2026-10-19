---
target: GitHub Pages LUT Builder frontend
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\User\\Documents\\lut_builder\\frontend\\src\\App.tsx"
target_fingerprint: "sha256:3415f50a2e314ebfef9f9d42832abe0f3d0bad4a9eb5d668d4488f9c9b1c2315"
target_path: "C:\\Users\\User\\Documents\\lut_builder\\frontend\\src\\App.tsx"
timestamp: 2026-10-19T16-30-19Z
slug: frontend-src-app-tsx
closed: true
---
Method: dual-agent (A: /root/design_review · B: /root/technical_review)

# LUT Builder frontend critique

Target: `frontend/src/App.tsx`, browser-only GitHub Pages workbench. Reviewed 2026-10-19 against local source and desktop 1280×900 / mobile 390×844 screenshots. Parent supplied browser evidence because child browser runtimes had no browsers. Assessments remained independent until A completed.

## Design specificity and overall impression

The neutral chrome, exposure rulers, units, diagnostic colors, reference marking and output summary make this a product-specific tool. Preserve its identity. The main opportunity is reducing friction between editing, seeing the result and safely keeping work.

The deterministic scan of `frontend/src` returned exit 0 and `[]`: zero findings, rule names or locations. There were no false positives. This does not establish accessibility compliance; both reviewers independently identified mobile table friction.

## Design health

| Heuristic | Score /4 | Key finding |
| --- | ---: | --- |
| Visibility of system status | 2 | Band feedback appears in distant, unrelated sections. |
| Match with the real world | 4 | Appropriate camera, exposure, range and display language. |
| User control and freedom | 2 | Band undo works; setup replacement/deletion lacks recovery. |
| Consistency and standards | 3 | Saved setups lack the deletion protection given to bands. |
| Error prevention | 2 | Imports are validated, but destructive setup operations are easy. |
| Recognition rather than recall | 3 | Good labels; long edit/result distance adds memory work. |
| Flexibility and efficiency | 3 | Keyboard and numeric controls help; mobile precision editing is awkward. |
| Aesthetic and minimalist design | 3 | Restrained visual system, with excessive vertical separation. |
| Error recovery | 3 | Useful errors and retry paths, incomplete setup recovery. |
| Help and documentation | 3 | Contextual help; shortcut help hidden in narrow layouts. |
| **Total** | **28/40** | **Good** |

## What works

- Diagnostic color owns the emphasis; neutral chrome avoids distracting from the LUT.
- Stops, IRE and Fill explain their purpose with words and visual examples. Advanced controls are disclosed progressively.
- Output summaries and signal-limit caveats make the exported artifact and its limitations explicit.

## Priority issues

1. **P1 — Setup replacement and deletion can lose work.** `App.tsx:1142,1185,1196,1230`; `editor.ts:44`; `setupPresets.ts:47`. Loading/importing clears band undo; deleting a saved setup persists immediately. Provide a separate previous-setup recovery action and explicit saved-setup deletion confirmation. Keep the one-step band-edit undo contract intact. Also expose when saving a duplicate name will replace an existing setup. Suggested command: `harden`.
2. **P1 — Mobile precision controls are offscreen.** `App.tsx:1401–1413`. The 42rem table clips position, width and removal on a 390px display. Keep desktop comparison rows, but stack the same controls with visible labels on phones. Tiny graph handles make the numeric alternative particularly important; mobile CSS already increases control heights, so do not infer complete target dimensions from source width alone. Suggested command: `adapt`.
3. **P2 — The photo result is far from the edit.** `App.tsx:1287,1435,1439,1470`. Configuration, graph, table, palette and warnings precede the image. Add direct navigation between bands and the result; a larger persistent-preview layout can remain a separate design decision. Suggested command: `layout`.
4. **P2 — Feedback is repeated in unrelated sections.** `App.tsx:1068,1234,1483,1506`. Band errors flow to Load setup, Save setup and Generate LUT, leaving no nearby visible explanation and duplicating live announcements. Give each action area its own status outlet. Suggested command: `clarify`.

## Cognitive load and emotional journey

Modes and starting palettes are appropriately constrained. A seven-band setup repeats more than four band choices across graph and table, but selection highlighting helps. The main avoidable load is remembering the image result while navigating back to controls. Configuration is reassuring, editing is engaging, and generation is concrete; scrolling and unexpected setup loss are the weak points.

## Persona red flags

- **Alex, power user:** Repeated edit/result scrolling interrupts iteration. Preserve shortcuts and reversible band edits without extra prompts.
- **Sam, accessibility-dependent user:** Numeric alternatives and focus styling are strengths. Duplicate live regions and hidden narrow-screen shortcut help merit attention.
- **Casey, mobile user:** Horizontal table movement separates identity from width/removal. The stacked photo pair adds return-trip distance.

## Minor observations

Some section titles use visual CardTitles without semantic headings. Graph labels are dense on phones. Neither is evidence of a measured contrast failure. Configuration, palettes and preview layouts otherwise stack coherently; no whole-page overflow is evident in the screenshots.

## Questions and selected direction

The user authorized critique → targeted improvements → audit, preserving the existing frontend. An optional scope question offers all four focused fixes, mobile/navigation first, or recovery/feedback first. The default is all four focused fixes without a redesign. Full sticky-preview restructuring, graph gesture redesign, and new product features are outside this pass.

## Evidence limitations

Screenshots support layout findings; source supports recovery and feedback findings. Initial assessments did not execute keyboard workflows, real screen readers, touch gestures or contrast measurements. The final audit will distinguish tested behavior from these limits.
