# YDeck Investment Analysis DESIGN.md

This file is the art-direction and layout-engine contract for `ydeck-library-investment-analysis`.
`template.json` remains the structured source of truth for metadata, layout ids,
flows, palette, and capabilities. This file controls how those layouts must look.

## 1. Art Direction

An investment committee memo: sober, analytical, valuation-oriented, and evidence heavy.

- **Scenario:** investment-analysis
- **Density:** dense, finance-readable
- **Variance:** high; every layout has a distinct spatial skeleton
- **Primary visual metaphor:** IC memo with valuation ranges and scenario gates
- **Design must feel like:** investment banking appendix polish with startup diligence clarity
- **Design must never feel like:** generic recolored YDeck chrome, decorative chart wallpaper, or one universal left-title/right-graphic template.

## 2. Palette Roles

- **Canvas:** #F5F2EA — primary deck surface
- **Ink:** #111814 — primary type and dense information.
- **Accent:** #065F46 — active state, selected path, primary evidence, or headline marker.
- **Secondary:** #B7791F — contrast signal, warning, comparison, or secondary data series.
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
- **Primary grid:** left thesis column, central model/table zone, right decision/risk strip.
- **Rhythm:** alternate sparse thesis slides with denser evidence slides.
- **Chrome:** header/footer may be subtle, but user-facing previews must not expose raw layout ids as design decoration.
- **Slide-to-slide variation:** adjacent layouts must change at least two of these: focal zone, column count, chart position, background field, or visual grammar.

## 5. Chart, Bar, And Diagram Grammar

Use valuation football fields, market waterfalls, scenario bands, unit economics stacks, sensitivity tables, risk-return matrices, and deal-structure waterfalls.

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

### 1. `yl_investment_analysis_investment_thesis` — Investment thesis

**Purpose:** Use this layout for investment thesis content in a investment analysis deck.

**Composition archetype:** title / cover

**Coordinate zones:**
- Title block: x=112 y=180 w=980 h=420, or academic inset x=170 y=190 w=1040 h=420.
- Context/descriptor: x=112 y=620 w=780 h=160; use one focused paragraph.
- Optional proof/metadata rail: x=1180 y=180 w=520 h=620; never use a generic chart unless the template is analytical.
- Footer: x=112 y=990 w=1696 h=32.

**Required visual grammar:**
- Use a distinctive title composition for this template; no generic chart card on the cover.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 2. `yl_investment_analysis_asset_snapshot` — Asset snapshot

**Purpose:** Use this layout for asset snapshot content in a investment analysis deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 3. `yl_investment_analysis_opportunity_context` — Opportunity context

**Purpose:** Use this layout for opportunity context content in a investment analysis deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 4. `yl_investment_analysis_market_size` — Market size

**Purpose:** Use this layout for market size content in a investment analysis deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 5. `yl_investment_analysis_macro_indicators` — Macro indicators

**Purpose:** Use this layout for macro indicators content in a investment analysis deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 6. `yl_investment_analysis_industry_structure` — Industry structure

**Purpose:** Use this layout for industry structure content in a investment analysis deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 7. `yl_investment_analysis_business_model` — Business model

**Purpose:** Use this layout for business model content in a investment analysis deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 8. `yl_investment_analysis_product_asset_quality` — Product asset quality

**Purpose:** Use this layout for product asset quality content in a investment analysis deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 9. `yl_investment_analysis_traction_performance` — Traction performance

**Purpose:** Use this layout for traction performance content in a investment analysis deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 10. `yl_investment_analysis_unit_economics` — Unit economics

**Purpose:** Use this layout for unit economics content in a investment analysis deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 11. `yl_investment_analysis_financial_forecast` — Financial forecast

**Purpose:** Use this layout for financial forecast content in a investment analysis deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 12. `yl_investment_analysis_valuation_logic` — Valuation logic

**Purpose:** Use this layout for valuation logic content in a investment analysis deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 13. `yl_investment_analysis_competitive_landscape` — Competitive landscape

**Purpose:** Use this layout for competitive landscape content in a investment analysis deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 14. `yl_investment_analysis_management_team` — Management team

**Purpose:** Use this layout for management team content in a investment analysis deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 15. `yl_investment_analysis_regulation_policy` — Regulation policy

**Purpose:** Use this layout for regulation policy content in a investment analysis deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 16. `yl_investment_analysis_risk_matrix` — Risk matrix

**Purpose:** Use this layout for risk matrix content in a investment analysis deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 17. `yl_investment_analysis_mitigation_plan` — Mitigation plan

**Purpose:** Use this layout for mitigation plan content in a investment analysis deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 18. `yl_investment_analysis_scenario_analysis` — Scenario analysis

**Purpose:** Use this layout for scenario analysis content in a investment analysis deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 19. `yl_investment_analysis_roi_logic` — ROI logic

**Purpose:** Use this layout for roi logic content in a investment analysis deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 20. `yl_investment_analysis_deal_structure` — Deal structure

**Purpose:** Use this layout for deal structure content in a investment analysis deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 21. `yl_investment_analysis_entry_strategy` — Entry strategy

**Purpose:** Use this layout for entry strategy content in a investment analysis deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 22. `yl_investment_analysis_exit_options` — Exit options

**Purpose:** Use this layout for exit options content in a investment analysis deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 23. `yl_investment_analysis_recommendation` — Recommendation

**Purpose:** Use this layout for recommendation content in a investment analysis deck.

**Composition archetype:** closing / action

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 24. `yl_investment_analysis_investment_committee` — Investment committee

**Purpose:** Use this layout for investment committee content in a investment analysis deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 25. `yl_investment_analysis_next_steps` — Next steps

**Purpose:** Use this layout for next steps content in a investment analysis deck.

**Composition archetype:** closing / action

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #065F46 only for the main active signal.
- Use #B7791F only for contrast, risk, comparison, or secondary series.

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
