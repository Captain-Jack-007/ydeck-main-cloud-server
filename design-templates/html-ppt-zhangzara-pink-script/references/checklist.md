# Pink Script — After Hours Checklist

## Required

- `template.json` is the source of truth for structured metadata.
- Canvas is fixed at 1920x1080.
- Generated slides use layout ids from `references/layouts.md`.
- Preview HTML exists and opens through `/v1/design-templates/:id/preview`.
- Keep generated slide HTML static and export-safe.
- Preserve the template palette, typography rhythm, spacing, and composition density.
- Repair only the failed slide during QA.

## Conformance QA

- Allowed layouts: check every `layoutId` against `references/layouts.md`.
- Palette: compare generated colors against `template.json.palette`.
- Typography: preserve the preview's title/body scale relationship.
- Spacing: avoid crowding and avoid unexplained layout shifts.
- Composition variety: adjacent slides should not repeat the same structure unless the template intentionally does so.
- Charts/icons: follow `template.json.capabilities`, `charting`, and `icons` when present.
- Density: keep content readable at presentation distance.
## Template Conformance QA

Generated decks must be checked against the selected template, not only against generic HTML validity. Compare the generated deck against:

- allowed layout ids from `references/layouts.md`
- palette and contrast from `template.json.palette`
- typography scale and hierarchy from the preview
- spacing rhythm and density limits
- composition variety across adjacent slides
- chart and icon capability flags from `template.json.capabilities`
- preview/generation reliability notes from `template.json.quality`

If a slide fails, repair that slide only and preserve its layout role.

