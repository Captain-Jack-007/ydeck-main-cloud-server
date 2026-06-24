# YDeck Business Report DESIGN.md

This file is the art-direction and layout-engine contract for `ydeck-library-business-report`.
`template.json` remains the structured source of truth for metadata, layout ids,
flows, palette, and capabilities. This file controls how those layouts must look.

## 1. Art Direction

An editorial operating-report system: calm executive surface, dense but legible KPI evidence, and management-action clarity.

- **Scenario:** business-report
- **Density:** high but ordered, like a monthly board packet
- **Variance:** high; every layout has a distinct spatial skeleton
- **Primary visual metaphor:** operating review table with annotated variance
- **Design must feel like:** McKinsey-style monthly business review with warmer editorial spacing
- **Design must never feel like:** generic recolored YDeck chrome, decorative chart wallpaper, or one universal left-title/right-graphic template.

## 2. Palette Roles

- **Canvas:** #F8F5EF — primary deck surface
- **Ink:** #111827 — primary type and dense information.
- **Accent:** #0F766E — active state, selected path, primary evidence, or headline marker.
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
- **Primary grid:** KPI strip, main evidence pane, action/risk side rail, and compact management note zones.
- **Rhythm:** alternate sparse thesis slides with denser evidence slides.
- **Chrome:** header/footer may be subtle, but user-facing previews must not expose raw layout ids as design decoration.
- **Slide-to-slide variation:** adjacent layouts must change at least two of these: focal zone, column count, chart position, background field, or visual grammar.

## 5. Chart, Bar, And Diagram Grammar

Use KPI strips, variance bridges, target-vs-actual grouped bars, waterfall bridges, issue ledgers, and initiative trackers. Avoid donuts except for allocation/control coverage.

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

### 1. `yl_business_report_report_title` — Report title

**Purpose:** Use this layout for report title content in a business report deck.

**Composition archetype:** title / cover

**Coordinate zones:**
- Title block: x=112 y=180 w=980 h=420, or academic inset x=170 y=190 w=1040 h=420.
- Context/descriptor: x=112 y=620 w=780 h=160; use one focused paragraph.
- Optional proof/metadata rail: x=1180 y=180 w=520 h=620; never use a generic chart unless the template is analytical.
- Footer: x=112 y=990 w=1696 h=32.

**Required visual grammar:**
- Use a distinctive title composition for this template; no generic chart card on the cover.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 2. `yl_business_report_executive_summary` — Executive summary

**Purpose:** Use this layout for executive summary content in a business report deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 3. `yl_business_report_period_snapshot` — Period snapshot

**Purpose:** Use this layout for period snapshot content in a business report deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 4. `yl_business_report_kpi_dashboard` — KPI dashboard

**Purpose:** Use this layout for kpi dashboard content in a business report deck.

**Composition archetype:** metric dashboard

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- KPI strip: x=112 y=138 w=1696 h=154; 3-5 metrics maximum.
- Main evidence chart: x=112 y=340 w=1050 h=470.
- Interpretation/action rail: x=1200 y=340 w=608 h=470.

**Required visual grammar:**
- Use metric strip plus one named operating/dashboard visual; every metric needs a label and interpretation.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 5. `yl_business_report_performance_trend` — Performance trend

**Purpose:** Use this layout for performance trend content in a business report deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 6. `yl_business_report_variance_analysis` — Variance analysis

**Purpose:** Use this layout for variance analysis content in a business report deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 7. `yl_business_report_department_update` — Department update

**Purpose:** Use this layout for department update content in a business report deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 8. `yl_business_report_customer_metrics` — Customer metrics

**Purpose:** Use this layout for customer metrics content in a business report deck.

**Composition archetype:** metric dashboard

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- KPI strip: x=112 y=138 w=1696 h=154; 3-5 metrics maximum.
- Main evidence chart: x=112 y=340 w=1050 h=470.
- Interpretation/action rail: x=1200 y=340 w=608 h=470.

**Required visual grammar:**
- Use metric strip plus one named operating/dashboard visual; every metric needs a label and interpretation.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 9. `yl_business_report_revenue_breakdown` — Revenue breakdown

**Purpose:** Use this layout for revenue breakdown content in a business report deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 10. `yl_business_report_cost_breakdown` — Cost breakdown

**Purpose:** Use this layout for cost breakdown content in a business report deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 11. `yl_business_report_operations_map` — Operations map

**Purpose:** Use this layout for operations map content in a business report deck.

**Composition archetype:** map / spatial model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Map/spatial field: x=112 y=150 w=1060 h=700.
- Fact ledger: x=1220 y=150 w=588 h=700.
- Callouts attach to geographic or spatial anchors, not random labels.

**Required visual grammar:**
- Use a spatial field, map, venue, region, or presence model with anchored callouts.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use a generic blob map for non-geographic content
- label callouts without anchors

### 12. `yl_business_report_issue_log` — Issue log

**Purpose:** Use this layout for issue log content in a business report deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 13. `yl_business_report_risk_controls` — Risk controls

**Purpose:** Use this layout for risk controls content in a business report deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 14. `yl_business_report_initiative_tracker` — Initiative tracker

**Purpose:** Use this layout for initiative tracker content in a business report deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 15. `yl_business_report_timeline_roadmap` — Timeline roadmap

**Purpose:** Use this layout for timeline roadmap content in a business report deck.

**Composition archetype:** timeline / sequence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Title/intent: x=112 y=160 w=680 h=190.
- Timeline canvas: x=112 y=390 w=1696 h=360; use lanes, milestones, or stage blocks.
- Decision gate notes: x=112 y=790 w=1696 h=120.

**Required visual grammar:**
- Use a real timeline, Gantt lane, learning path, or roadmap with stage labels and sequencing direction.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 16. `yl_business_report_comparison_table` — Comparison table

**Purpose:** Use this layout for comparison table content in a business report deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 17. `yl_business_report_research_evidence` — Research evidence

**Purpose:** Use this layout for research evidence content in a business report deck.

**Composition archetype:** evidence / citation

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 18. `yl_business_report_case_study` — Case study

**Purpose:** Use this layout for case study content in a business report deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 19. `yl_business_report_insight_cards` — Insight cards

**Purpose:** Use this layout for insight cards content in a business report deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 20. `yl_business_report_forecast_outlook` — Forecast outlook

**Purpose:** Use this layout for forecast outlook content in a business report deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 21. `yl_business_report_recommendations` — Recommendations

**Purpose:** Use this layout for recommendations content in a business report deck.

**Composition archetype:** closing / action

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 22. `yl_business_report_decision_request` — Decision request

**Purpose:** Use this layout for decision request content in a business report deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 23. `yl_business_report_appendix_table` — Appendix table

**Purpose:** Use this layout for appendix table content in a business report deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 24. `yl_business_report_sources_and_notes` — Sources and notes

**Purpose:** Use this layout for sources and notes content in a business report deck.

**Composition archetype:** evidence / citation

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
- Use #B45309 only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 25. `yl_business_report_closing_actions` — Closing actions

**Purpose:** Use this layout for closing actions content in a business report deck.

**Composition archetype:** closing / action

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0F766E only for the main active signal.
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
