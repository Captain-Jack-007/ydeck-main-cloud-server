# YDeck Country Overview DESIGN.md

This file is the art-direction and layout-engine contract for `ydeck-library-country-overview`.
`template.json` remains the structured source of truth for metadata, layout ids,
flows, palette, and capabilities. This file controls how those layouts must look.

## 1. Art Direction

A country intelligence dossier: geographic, civic, macroeconomic, and cultural context with sober map-led hierarchy.

- **Scenario:** country-overview
- **Density:** balanced, presentation-readable
- **Variance:** high; every layout has a distinct spatial skeleton
- **Primary visual metaphor:** analyst country brief with atlas notes
- **Design must feel like:** Economist-style country briefing deck
- **Design must never feel like:** generic recolored YDeck chrome, decorative chart wallpaper, or one universal left-title/right-graphic template.

## 2. Palette Roles

- **Canvas:** #F3F7F8 — primary deck surface
- **Ink:** #102033 — primary type and dense information.
- **Accent:** #1D4ED8 — active state, selected path, primary evidence, or headline marker.
- **Secondary:** #0F766E — contrast signal, warning, comparison, or secondary data series.
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
- **Primary grid:** map field, fact ledger, macro chart, and source/evidence band.
- **Rhythm:** alternate sparse thesis slides with denser evidence slides.
- **Chrome:** header/footer may be subtle, but user-facing previews must not expose raw layout ids as design decoration.
- **Slide-to-slide variation:** adjacent layouts must change at least two of these: focal zone, column count, chart position, background field, or visual grammar.

## 5. Chart, Bar, And Diagram Grammar

Use labeled maps, population pyramids, GDP composition bars, trade flow ribbons, policy timelines, and comparison tables. Avoid generic abstract curves.

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

### 1. `yl_country_overview_country_title` — Country title

**Purpose:** Use this layout for country title content in a country overview deck.

**Composition archetype:** title / cover

**Coordinate zones:**
- Title block: x=112 y=180 w=980 h=420, or academic inset x=170 y=190 w=1040 h=420.
- Context/descriptor: x=112 y=620 w=780 h=160; use one focused paragraph.
- Optional proof/metadata rail: x=1180 y=180 w=520 h=620; never use a generic chart unless the template is analytical.
- Footer: x=112 y=990 w=1696 h=32.

**Required visual grammar:**
- Use a distinctive title composition for this template; no generic chart card on the cover.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 2. `yl_country_overview_executive_snapshot` — Executive snapshot

**Purpose:** Use this layout for executive snapshot content in a country overview deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 3. `yl_country_overview_map_location` — Map location

**Purpose:** Use this layout for map location content in a country overview deck.

**Composition archetype:** map / spatial model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Map/spatial field: x=112 y=150 w=1060 h=700.
- Fact ledger: x=1220 y=150 w=588 h=700.
- Callouts attach to geographic or spatial anchors, not random labels.

**Required visual grammar:**
- Use a spatial field, map, venue, region, or presence model with anchored callouts.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use a generic blob map for non-geographic content
- label callouts without anchors

### 4. `yl_country_overview_key_facts` — Key facts

**Purpose:** Use this layout for key facts content in a country overview deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 5. `yl_country_overview_population_profile` — Population profile

**Purpose:** Use this layout for population profile content in a country overview deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 6. `yl_country_overview_economy_overview` — Economy overview

**Purpose:** Use this layout for economy overview content in a country overview deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 7. `yl_country_overview_gdp_industry_statistics` — GDP industry statistics

**Purpose:** Use this layout for gdp industry statistics content in a country overview deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 8. `yl_country_overview_trade_overview` — Trade overview

**Purpose:** Use this layout for trade overview content in a country overview deck.

**Composition archetype:** chart / quantitative evidence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.
- Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.
- Source/assumption strip: x=112 y=770 w=1696 h=112.

**Required visual grammar:**
- Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 9. `yl_country_overview_political_system` — Political system

**Purpose:** Use this layout for political system content in a country overview deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 10. `yl_country_overview_education_system` — Education system

**Purpose:** Use this layout for education system content in a country overview deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 11. `yl_country_overview_culture_lifestyle` — Culture lifestyle

**Purpose:** Use this layout for culture lifestyle content in a country overview deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 12. `yl_country_overview_cities_overview` — Cities overview

**Purpose:** Use this layout for cities overview content in a country overview deck.

**Composition archetype:** map / spatial model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Map/spatial field: x=112 y=150 w=1060 h=700.
- Fact ledger: x=1220 y=150 w=588 h=700.
- Callouts attach to geographic or spatial anchors, not random labels.

**Required visual grammar:**
- Use a spatial field, map, venue, region, or presence model with anchored callouts.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use a generic blob map for non-geographic content
- label callouts without anchors

### 13. `yl_country_overview_tourism_highlights` — Tourism highlights

**Purpose:** Use this layout for tourism highlights content in a country overview deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 14. `yl_country_overview_infrastructure` — Infrastructure

**Purpose:** Use this layout for infrastructure content in a country overview deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 15. `yl_country_overview_investment_climate` — Investment climate

**Purpose:** Use this layout for investment climate content in a country overview deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 16. `yl_country_overview_opportunities` — Opportunities

**Purpose:** Use this layout for opportunities content in a country overview deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 17. `yl_country_overview_risks_challenges` — Risks challenges

**Purpose:** Use this layout for risks challenges content in a country overview deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 18. `yl_country_overview_market_entry_strategy` — Market entry strategy

**Purpose:** Use this layout for market entry strategy content in a country overview deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 19. `yl_country_overview_country_comparison` — Country comparison

**Purpose:** Use this layout for country comparison content in a country overview deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 20. `yl_country_overview_history_timeline` — History timeline

**Purpose:** Use this layout for history timeline content in a country overview deck.

**Composition archetype:** timeline / sequence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Title/intent: x=112 y=160 w=680 h=190.
- Timeline canvas: x=112 y=390 w=1696 h=360; use lanes, milestones, or stage blocks.
- Decision gate notes: x=112 y=790 w=1696 h=120.

**Required visual grammar:**
- Use a real timeline, Gantt lane, learning path, or roadmap with stage labels and sequencing direction.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 21. `yl_country_overview_case_study` — Case study

**Purpose:** Use this layout for case study content in a country overview deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 22. `yl_country_overview_swot_analysis` — SWOT analysis

**Purpose:** Use this layout for swot analysis content in a country overview deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 23. `yl_country_overview_recommendations` — Recommendations

**Purpose:** Use this layout for recommendations content in a country overview deck.

**Composition archetype:** closing / action

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 24. `yl_country_overview_sources_evidence` — Sources evidence

**Purpose:** Use this layout for sources evidence content in a country overview deck.

**Composition archetype:** evidence / citation

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 25. `yl_country_overview_closing_decision` — Closing decision

**Purpose:** Use this layout for closing decision content in a country overview deck.

**Composition archetype:** closing / action

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #1D4ED8 only for the main active signal.
- Use #0F766E only for contrast, risk, comparison, or secondary series.

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
