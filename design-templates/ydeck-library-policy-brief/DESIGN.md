# YDeck Government / Policy Brief DESIGN.md

This file is the art-direction and layout-engine contract for `ydeck-library-policy-brief`.
`template.json` remains the structured source of truth for metadata, layout ids,
flows, palette, and capabilities. This file controls how those layouts must look.

## 1. Art Direction

A government policy dossier: civic, neutral, evidence-led, and implementation-focused.

- **Scenario:** policy-brief
- **Density:** balanced, presentation-readable
- **Variance:** high; every layout has a distinct spatial skeleton
- **Primary visual metaphor:** public-sector decision memo
- **Design must feel like:** World Bank / ministry policy briefing
- **Design must never feel like:** generic recolored YDeck chrome, decorative chart wallpaper, or one universal left-title/right-graphic template.

## 2. Palette Roles

- **Canvas:** #F5F6F8 — primary deck surface
- **Ink:** #111827 — primary type and dense information.
- **Accent:** #1E3A8A — active state, selected path, primary evidence, or headline marker.
- **Secondary:** #B45309 — contrast signal, warning, comparison, or secondary data series.
- **Porcelain:** #FFFFFF — calm reading surfaces and high-contrast cards.
- **Fog:** #E8EDF2 — quiet grid, table, chart, and sidebar fills.

Use these colors functionally. Do not swap accents only to make repeated layouts look different.

## 3. Typography

- **Display:** Avenir Next heavy for modern decks; editorial serif only for academic/book covers.
- **Body:** Avenir Next, 28-32px, relaxed leading.
- **Labels:** Avenir Next Condensed or DIN Condensed, uppercase, 0.08em-0.12em letter spacing.
- **Numbers:** tabular-feeling display numerals, 44-104px depending on hierarchy.
- **Minimum body size:** 28px on generated slides.
- **Maximum body line length:** 58-66 characters unless the layout is a table.
- **Do not:** use remote fonts, browser font imports, or unavailable webfont names.

## 4. Grid And Spatial System

- **Canvas:** 1920 x 1080 fixed.
- **Outer margins:** 112px left/right, 54px top/bottom for business decks; 170px title inset for academic covers..
- **Primary grid:** problem evidence, population impact, options table, implementation model, budget allocation, safeguards.
- **Rhythm:** alternate sparse thesis slides with denser evidence slides.
- **Chrome:** header/footer may be subtle, but user-facing previews must not expose raw layout ids as design decoration.
- **Slide-to-slide variation:** adjacent layouts must change at least two of these: focal zone, column count, chart position, background field, or visual grammar.

## 5. Chart, Bar, And Diagram Grammar

Use policy gap ladders, beneficiary journeys, regional maps, budget allocation bars, monitoring dashboards, and option scorecards.

Do not place a chart on every slide. Charts are only allowed where they explain a numeric relationship.
When a chart appears, the chart must have a named purpose, axis/labels, and a clear takeaway zone.

## 6. Icon And Image Grammar

Use thin, precise inline SVG icons only when they clarify a concept. Image layouts use one large image zone with annotation rails.

## 7. Global Anti-Patterns

- No repeated left title + right generic SVG across adjacent slides.
- No meaningless bars, fake trend lines, or unlabelled decorative charts.
- No quadrant maps unless the layout explicitly asks for a 2x2 decision matrix.
- No generic labels like "Signal", "Fit", "Priority zone", "High urgency", or "Clear wedge".
- No cards-inside-cards.
- No remote URLs, scripts, iframes, external CSS, or remote fonts.
- No emoji icons or crude custom symbols.
- No fake universal data. Use template-specific example data only in previews, and generated data only when supported by user/source content.

## 8. Layout Engine

Each layout below defines the allowed composition contract. The agent may adapt copy and data, but it must preserve the composition role, coordinate zones, visual grammar, and banned pattern notes.

### 1. `yl_policy_brief_brief_title` — Brief title

**Purpose:** Use this layout for brief title content in a policy brief deck.

**Composition archetype:** title / cover

**Coordinate zones:**
- Title block: x=112 y=180 w=980 h=420, or academic inset x=170 y=190 w=1040 h=420.
- Context/descriptor: x=112 y=620 w=780 h=160; use one focused paragraph.
- Optional proof/metadata rail: x=1180 y=180 w=520 h=620; never use a generic chart unless the template is analytical.
- Footer: x=112 y=990 w=1696 h=32.

**Required visual grammar:**
- Use a distinctive title composition for this template; no generic chart card on the cover.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 2. `yl_policy_brief_executive_brief` — Executive brief

**Purpose:** Use this layout for executive brief content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 3. `yl_policy_brief_problem_statement` — Problem statement

**Purpose:** Use this layout for problem statement content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 4. `yl_policy_brief_population_impact` — Population impact

**Purpose:** Use this layout for population impact content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 5. `yl_policy_brief_evidence_snapshot` — Evidence snapshot

**Purpose:** Use this layout for evidence snapshot content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 6. `yl_policy_brief_current_policy` — Current policy

**Purpose:** Use this layout for current policy content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 7. `yl_policy_brief_gap_analysis` — Gap analysis

**Purpose:** Use this layout for gap analysis content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 8. `yl_policy_brief_stakeholder_map` — Stakeholder map

**Purpose:** Use this layout for stakeholder map content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 9. `yl_policy_brief_policy_options` — Policy options

**Purpose:** Use this layout for policy options content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 10. `yl_policy_brief_recommended_option` — Recommended option

**Purpose:** Use this layout for recommended option content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 11. `yl_policy_brief_implementation_model` — Implementation model

**Purpose:** Use this layout for implementation model content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 12. `yl_policy_brief_program_timeline` — Program timeline

**Purpose:** Use this layout for program timeline content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 13. `yl_policy_brief_budget_allocation` — Budget allocation

**Purpose:** Use this layout for budget allocation content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 14. `yl_policy_brief_beneficiary_journey` — Beneficiary journey

**Purpose:** Use this layout for beneficiary journey content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 15. `yl_policy_brief_regional_map` — Regional map

**Purpose:** Use this layout for regional map content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 16. `yl_policy_brief_risk_safeguards` — Risk safeguards

**Purpose:** Use this layout for risk safeguards content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 17. `yl_policy_brief_monitoring_metrics` — Monitoring metrics

**Purpose:** Use this layout for monitoring metrics content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 18. `yl_policy_brief_legal_regulatory` — Legal regulatory

**Purpose:** Use this layout for legal regulatory content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 19. `yl_policy_brief_partnership_model` — Partnership model

**Purpose:** Use this layout for partnership model content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 20. `yl_policy_brief_case_example` — Case example

**Purpose:** Use this layout for case example content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 21. `yl_policy_brief_equity_inclusion` — Equity inclusion

**Purpose:** Use this layout for equity inclusion content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 22. `yl_policy_brief_communications_plan` — Communications plan

**Purpose:** Use this layout for communications plan content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 23. `yl_policy_brief_decision_request` — Decision request

**Purpose:** Use this layout for decision request content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 24. `yl_policy_brief_next_steps` — Next steps

**Purpose:** Use this layout for next steps content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 25. `yl_policy_brief_appendix_sources` — Appendix sources

**Purpose:** Use this layout for appendix sources content in a policy brief deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1E3A8A only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

## 9. QA Checklist

- Every generated slide uses one of the layout ids above.
- Every slide keeps the selected layout's coordinate zones.
- Adjacent slides do not share the same composition skeleton.
- Charts and bars are understandable without speaker narration.
- Tables have readable type and clear row/column hierarchy.
- Icons are modern inline SVG, semantically related, and not decorative filler.
- Images appear only in image-ready layouts and include annotation or framing rules.
- Repair passes must repair only the failed slide while preserving the layout id and design contract.
