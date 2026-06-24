# YDeck Company Profile DESIGN.md

This file is the art-direction and layout-engine contract for `ydeck-library-company-profile`.
`template.json` remains the structured source of truth for metadata, layout ids,
flows, palette, and capabilities. This file controls how those layouts must look.

## 1. Art Direction

A polished corporate profile: confident, restrained, proof-rich, and customer-facing.

- **Scenario:** company-profile
- **Density:** balanced, presentation-readable
- **Variance:** high; every layout has a distinct spatial skeleton
- **Primary visual metaphor:** company showroom with operating proof
- **Design must feel like:** premium B2B corporate introduction deck
- **Design must never feel like:** generic recolored YDeck chrome, decorative chart wallpaper, or one universal left-title/right-graphic template.

## 2. Palette Roles

- **Canvas:** #F4F7F8 — primary deck surface
- **Ink:** #111827 — primary type and dense information.
- **Accent:** #0E7490 — active state, selected path, primary evidence, or headline marker.
- **Secondary:** #7C3AED — contrast signal, warning, comparison, or secondary data series.
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
- **Primary grid:** service architecture, proof metrics, timeline, logo wall, team/story photo zones.
- **Rhythm:** alternate sparse thesis slides with denser evidence slides.
- **Chrome:** header/footer may be subtle, but user-facing previews must not expose raw layout ids as design decoration.
- **Slide-to-slide variation:** adjacent layouts must change at least two of these: focal zone, column count, chart position, background field, or visual grammar.

## 5. Chart, Bar, And Diagram Grammar

Use service portfolio grids, client segment maps, results metric panels, process swimlanes, and geographic presence maps.

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

### 1. `yl_company_profile_company_title` — Company title

**Purpose:** Use this layout for company title content in a company profile deck.

**Composition archetype:** title / cover

**Coordinate zones:**
- Title block: x=112 y=180 w=980 h=420, or academic inset x=170 y=190 w=1040 h=420.
- Context/descriptor: x=112 y=620 w=780 h=160; use one focused paragraph.
- Optional proof/metadata rail: x=1180 y=180 w=520 h=620; never use a generic chart unless the template is analytical.
- Footer: x=112 y=990 w=1696 h=32.

**Required visual grammar:**
- Use a distinctive title composition for this template; no generic chart card on the cover.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 2. `yl_company_profile_who_we_are` — Who we are

**Purpose:** Use this layout for who we are content in a company profile deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 3. `yl_company_profile_mission_and_vision` — Mission and vision

**Purpose:** Use this layout for mission and vision content in a company profile deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 4. `yl_company_profile_company_snapshot` — Company snapshot

**Purpose:** Use this layout for company snapshot content in a company profile deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 5. `yl_company_profile_history_timeline` — History timeline

**Purpose:** Use this layout for history timeline content in a company profile deck.

**Composition archetype:** timeline / sequence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Title/intent: x=112 y=160 w=680 h=190.
- Timeline canvas: x=112 y=390 w=1696 h=360; use lanes, milestones, or stage blocks.
- Decision gate notes: x=112 y=790 w=1696 h=120.

**Required visual grammar:**
- Use a real timeline, Gantt lane, learning path, or roadmap with stage labels and sequencing direction.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 6. `yl_company_profile_services_overview` — Services overview

**Purpose:** Use this layout for services overview content in a company profile deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 7. `yl_company_profile_solution_portfolio` — Solution portfolio

**Purpose:** Use this layout for solution portfolio content in a company profile deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 8. `yl_company_profile_industry_focus` — Industry focus

**Purpose:** Use this layout for industry focus content in a company profile deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 9. `yl_company_profile_customer_segments` — Customer segments

**Purpose:** Use this layout for customer segments content in a company profile deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 10. `yl_company_profile_value_proposition` — Value proposition

**Purpose:** Use this layout for value proposition content in a company profile deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 11. `yl_company_profile_differentiators` — Differentiators

**Purpose:** Use this layout for differentiators content in a company profile deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 12. `yl_company_profile_process_methodology` — Process methodology

**Purpose:** Use this layout for process methodology content in a company profile deck.

**Composition archetype:** system / network diagram

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- System diagram: x=560 y=145 w=1248 h=700.
- Layer/legend rail: x=112 y=180 w=360 h=580.
- Controls/decision note: x=112 y=800 w=1696 h=100.

**Required visual grammar:**
- Use a system diagram with nodes, layers, arrows, and controls; labels must match the deck scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use YDeck-internal labels like HTML to PPTX or deck artifact
- use a quadrant chart instead of a topology

### 13. `yl_company_profile_case_study` — Case study

**Purpose:** Use this layout for case study content in a company profile deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 14. `yl_company_profile_results_metrics` — Results metrics

**Purpose:** Use this layout for results metrics content in a company profile deck.

**Composition archetype:** metric dashboard

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- KPI strip: x=112 y=138 w=1696 h=154; 3-5 metrics maximum.
- Main evidence chart: x=112 y=340 w=1050 h=470.
- Interpretation/action rail: x=1200 y=340 w=608 h=470.

**Required visual grammar:**
- Use metric strip plus one named operating/dashboard visual; every metric needs a label and interpretation.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 15. `yl_company_profile_client_logos` — Client logos

**Purpose:** Use this layout for client logos content in a company profile deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 16. `yl_company_profile_team_overview` — Team overview

**Purpose:** Use this layout for team overview content in a company profile deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 17. `yl_company_profile_founder_profiles` — Founder profiles

**Purpose:** Use this layout for founder profiles content in a company profile deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 18. `yl_company_profile_technology_stack` — Technology stack

**Purpose:** Use this layout for technology stack content in a company profile deck.

**Composition archetype:** system / network diagram

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- System diagram: x=560 y=145 w=1248 h=700.
- Layer/legend rail: x=112 y=180 w=360 h=580.
- Controls/decision note: x=112 y=800 w=1696 h=100.

**Required visual grammar:**
- Use a system diagram with nodes, layers, arrows, and controls; labels must match the deck scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use YDeck-internal labels like HTML to PPTX or deck artifact
- use a quadrant chart instead of a topology

### 19. `yl_company_profile_geographic_presence` — Geographic presence

**Purpose:** Use this layout for geographic presence content in a company profile deck.

**Composition archetype:** map / spatial model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Map/spatial field: x=112 y=150 w=1060 h=700.
- Fact ledger: x=1220 y=150 w=588 h=700.
- Callouts attach to geographic or spatial anchors, not random labels.

**Required visual grammar:**
- Use a spatial field, map, venue, region, or presence model with anchored callouts.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use a generic blob map for non-geographic content
- label callouts without anchors

### 20. `yl_company_profile_partners_ecosystem` — Partners ecosystem

**Purpose:** Use this layout for partners ecosystem content in a company profile deck.

**Composition archetype:** system / network diagram

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- System diagram: x=560 y=145 w=1248 h=700.
- Layer/legend rail: x=112 y=180 w=360 h=580.
- Controls/decision note: x=112 y=800 w=1696 h=100.

**Required visual grammar:**
- Use a system diagram with nodes, layers, arrows, and controls; labels must match the deck scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use YDeck-internal labels like HTML to PPTX or deck artifact
- use a quadrant chart instead of a topology

### 21. `yl_company_profile_awards_certifications` — Awards certifications

**Purpose:** Use this layout for awards certifications content in a company profile deck.

**Composition archetype:** image / proof feature

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary image/proof field: x=112 y=140 w=1030 h=720.
- Annotation rail: x=1190 y=160 w=618 h=680.
- Caption/source: x=112 y=890 w=1696 h=58.

**Required visual grammar:**
- Use image-first proof or placeholder composition with annotation/caption rail.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 22. `yl_company_profile_financial_snapshot` — Financial snapshot

**Purpose:** Use this layout for financial snapshot content in a company profile deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 23. `yl_company_profile_future_roadmap` — Future roadmap

**Purpose:** Use this layout for future roadmap content in a company profile deck.

**Composition archetype:** timeline / sequence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Title/intent: x=112 y=160 w=680 h=190.
- Timeline canvas: x=112 y=390 w=1696 h=360; use lanes, milestones, or stage blocks.
- Decision gate notes: x=112 y=790 w=1696 h=120.

**Required visual grammar:**
- Use a real timeline, Gantt lane, learning path, or roadmap with stage labels and sequencing direction.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 24. `yl_company_profile_engagement_model` — Engagement model

**Purpose:** Use this layout for engagement model content in a company profile deck.

**Composition archetype:** narrative content

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 25. `yl_company_profile_closing_contact` — Closing contact

**Purpose:** Use this layout for closing contact content in a company profile deck.

**Composition archetype:** closing / action

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #0E7490 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

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
