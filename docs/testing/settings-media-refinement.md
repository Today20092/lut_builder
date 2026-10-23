# Settings and Media refinement

The camera summary now remains visible across destinations. Bands and Palette
share their scroll position and use the installed shadcn ToggleGroup. Reserved
scrollbar space prevents horizontal movement between short and long screens.

Settings presents Camera and display, then LUT output with cube size and range
directly visible. Optional filename customization, imported looks, signal warnings
and saved setups remain disclosures. FieldGroup, Field, NativeSelect, Card and
Button reuse the existing shadcn components; Tailwind controls the new form groups.
Settings-specific spacing removes duplicate card padding and excess section gaps.

Media now owns Photo illustration and camera verification at every width. The
photo preview is directly visible, retains its own-photo controls, and the existing
View photo result links open Media. Its screen heading is Preview & media.

Verification: lint, application and UI TypeScript checks and production build pass;
all 113 unit tests pass. The focused sweep passed 18 cases with 2 expected desktop
skips; 4 mobile position assertions failed before removal of the legacy hiding
rule. The final navigation/sheet matrix passes all 12 cases across 320, 390 and
1280px, light and dark, including equal Bands/Palette switch position and combined
Media controls. Native Settings screenshots were reviewed. Canonical Linux baselines and
real-phone Safari remain pending; Docker's Linux engine was unavailable earlier.
The full workflow matrix must be run before release; this refinement uses focused
checks and does not claim full release acceptance.
