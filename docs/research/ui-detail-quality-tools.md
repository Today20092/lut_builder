# Catching small UI defects in LUT Builder

Date: 2026-10-19  
Status: primary-source research; no tools installed or new tests executed.

## Recommendation

Keep the current shadcn/Base UI interface. Add a small Playwright visual and
geometry test suite, run axe accessibility checks in those browser states, and
require a screenshot-based Impeccable polish review before accepting the first
baselines. This is the smallest useful combination for the spacing, alignment,
wrapping, and mobile defects reported here. This recommendation is an engineering
judgment based on the capabilities and limitations below.

The repository currently runs Node tests with jsdom, and documents an optional
standalone Playwright browser workflow. Playwright Test, Storybook, and Chromatic
are not dependencies in the inspected frontend manifest.
[Package manifest](../../frontend/package.json),
[browser verification guidance](../testing/integration.md).

## What each option actually catches

| Option | Useful capability | Limit and fit for this project |
| --- | --- | --- |
| Playwright screenshot assertions | Compares screenshots against reference images; supports page and element screenshots. [Official guide](https://playwright.dev/docs/test-snapshots) | Best first addition. A bad initial baseline stays bad until reviewed; comparison detects change, not whether the design is good. That is an inference from the documented baseline mechanism. |
| Storybook + Chromatic | Stories describe rendered component states; Chromatic captures cloud snapshots and compares them with baselines. [Storybook](https://storybook.js.org/docs/writing-stories), [Chromatic](https://www.chromatic.com/docs/visual/) | Useful when maintaining many reusable component states. My recommendation is to defer the extra story setup for this focused app. Chromatic also integrates directly with Playwright; Storybook is not required for that route. [Integration](https://www.chromatic.com/docs/playwright/) |
| Percy | Screenshots across responsive widths and browsers, baseline differences, hosted review and CI integration. [Official overview](https://www.browserstack.com/docs/percy/overview/visual-testing-basics) | Alternative hosted review workflow, not a replacement for deciding whether the initial design is acceptable. Choose it or Chromatic if hosted review becomes valuable; do not add both. |
| axe through Playwright | Finds automated accessibility violations such as missing labels and poor contrast. Official guidance explicitly requires manual checks too. [Accessibility guide](https://playwright.dev/docs/accessibility-testing) | Add alongside visual tests. A visually excessive but valid padding combination is not, by itself, an accessibility violation; do not expect axe to flag it. |
| CSS/design lint | Stylelint can enforce allowed property/value conventions and reject invalid CSS. [Rules](https://stylelint.io/user-guide/rules/) | Useful for explicitly encoded conventions. Inference: individually valid height and padding declarations can still combine into a visually awkward box, so lint alone cannot judge the rendered result. |
| Impeccable polish | Explicitly addresses spacing, typography, alignment, responsive layout, focus, and touch behavior; its guide also calls for narrow-screen and state review. [Official polish guide](https://impeccable.style/docs/polish/) | Keep using it on actual rendered screenshots. Treat its review as fallible design feedback, then encode important accepted decisions as checks. |

## A small initial coverage set

Proposed project policy, not a vendor guarantee:

1. Capture the main workspace and the open gradient editor at 320px, 390px, and
   1280px, in both supported color schemes. Include collapsed and expanded
   disclosures, a long label, and a validation error. Playwright can configure
   viewport, touch/mobile emulation, and color scheme. Emulation is not a
   physical-phone test. [Emulation](https://playwright.dev/docs/emulation).
2. Review the images before committing baselines. Inspect vertical balance,
   label/control alignment, clipping, unwanted wrapping, and touch interaction.
   Use Impeccable for this focused rendered review rather than treating a clean
   source scan as proof of visual quality.
3. Add only a few explicit geometry rules for recurring product expectations:
   no document-level horizontal overflow; aligned Blend/Hue controls; one legend
   column on phones and one row on desktop; compact collapsed disclosures with
   adequate clickable summaries. These rules can catch violations even when an
   initial screenshot has not yet been judged.
4. Run screenshot comparisons in one pinned browser/OS environment. Playwright
   warns that rendering differs across platforms and settings. Keep comparison
   tolerances small and review baseline updates rather than blindly refreshing
   them after a failure. [Visual comparisons](https://playwright.dev/docs/test-snapshots).
5. Run axe in the relevant expanded states, then keyboard and occasional real
   phone checks. Keep the existing functional tests: visual snapshots supplement
   behavior coverage.

## How the disclosure gap should be protected

For the specific corrected boxes, proposed assertions are:

- At phone width, the clickable summary remains at least 44 CSS pixels high
  (our chosen touch target, not a claim about a universal WCAG requirement).
- With the disclosure closed, its outer height equals the summary height plus
  borders, within a small rounding tolerance. This rejects extra wrapper padding
  beneath the summary without imposing a fixed height on wrapped labels.
- The title is vertically balanced inside the clickable summary; compare its
  text line box with the summary's content rectangle, allowing rounding.
- Opening and closing still works by keyboard, and expanded content is not
  clipped. Capture both states as small component screenshots.

The geometry checks detect the known height-plus-padding failure. The reviewed
screenshots make unrelated appearance changes visible. Neither mechanism can
promise detection of every possible minor UI defect.

## Decision

Start with Playwright Test plus axe and the existing Impeccable workflow. Avoid a
UI-library migration or a new hosted service solely to fix this class of issue.
Revisit Chromatic or Percy when reviewing many screenshot changes in pull
requests becomes cumbersome; revisit Storybook when isolated component state
coverage is itself useful.

Pricing, paid plan limits, hosted-service integration, and physical-device
behavior were not evaluated. No application changes were made by this research.
