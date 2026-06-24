# YDeck Teaching + Games DESIGN.md

This file is the art-direction and layout-engine contract for `ydeck-library-teaching-games`.
`template.json` remains the structured source of truth for metadata, layout ids,
flows, palette, and capabilities. This file controls how those layouts must look.

## 1. Art Direction

An academic workbook deck: generous whitespace, persistent learning path, serif-led titles, and clear student task structures.

- **Scenario:** teaching-games
- **Density:** low-to-medium, classroom readable
- **Variance:** high; every layout has a distinct spatial skeleton
- **Primary visual metaphor:** course module workbook
- **Design must feel like:** html-ppt-course-module quality, adapted to YDeck layout vocabulary
- **Design must never feel like:** generic recolored YDeck chrome, decorative chart wallpaper, or one universal left-title/right-graphic template.

## 2. Palette Roles

- **Canvas:** #FFF7ED — primary deck surface
- **Ink:** #1F2937 — primary type and dense information.
- **Accent:** #E11D48 — active state, selected path, primary evidence, or headline marker.
- **Secondary:** #7C3AED — contrast signal, warning, comparison, or secondary data series.
- **Porcelain:** #FFFFFF — calm reading surfaces and high-contrast cards.
- **Fog:** #E8EDF2 — quiet grid, table, chart, and sidebar fills.

Use these colors functionally. Do not swap accents only to make repeated layouts look different.

## 3. Typography

- **Display:** Editorial serif for covers and lesson heads; Avenir Next heavy for task cards.
- **Body:** Avenir Next, 28-32px, relaxed leading.
- **Labels:** Avenir Next Condensed or DIN Condensed, uppercase, 0.08em-0.12em letter spacing.
- **Numbers:** tabular-feeling display numerals, 44-104px depending on hierarchy.
- **Minimum body size:** 28px on generated slides.
- **Maximum body line length:** 58-66 characters unless the layout is a table.
- **Do not:** use remote fonts, browser font imports, or unavailable webfont names.

## 4. Grid And Spatial System

- **Canvas:** 1920 x 1080 fixed.
- **Outer margins:** 112px left/right, 54px top/bottom for business decks; 170px title inset for academic covers..
- **Primary grid:** persistent 320px learning sidebar, 1170px main lesson canvas, practice/result panels.
- **Rhythm:** alternate sparse thesis slides with denser evidence slides.
- **Chrome:** header/footer may be subtle, but user-facing previews must not expose raw layout ids as design decoration.
- **Slide-to-slide variation:** adjacent layouts must change at least two of these: focal zone, column count, chart position, background field, or visual grammar.

## 5. Chart, Bar, And Diagram Grammar

Use progress bars, answer states, matching tables, word cards, reading evidence grids, and simple scoreboards. Do not use business charts unless teaching data.

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

### 1. `yl_teaching_games_game_title` — Game title

**Purpose:** Use this layout for game title content in a teaching games deck.

**Composition archetype:** title / cover

**Coordinate zones:**
- Title block: x=112 y=180 w=980 h=420, or academic inset x=170 y=190 w=1040 h=420.
- Context/descriptor: x=112 y=620 w=780 h=160; use one focused paragraph.
- Optional proof/metadata rail: x=1180 y=180 w=520 h=620; never use a generic chart unless the template is analytical.
- Footer: x=112 y=990 w=1696 h=32.

**Required visual grammar:**
- Use a distinctive title composition for this template; no generic chart card on the cover.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 2. `yl_teaching_games_lesson_objectives` — Lesson objectives

**Purpose:** Use this layout for lesson objectives content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 3. `yl_teaching_games_team_setup` — Team setup

**Purpose:** Use this layout for team setup content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 4. `yl_teaching_games_rules_slide` — Rules slide

**Purpose:** Use this layout for rules slide content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 5. `yl_teaching_games_warm_up_round` — Warm-up round

**Purpose:** Use this layout for warm-up round content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 6. `yl_teaching_games_vocabulary_cards` — Vocabulary cards

**Purpose:** Use this layout for vocabulary cards content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 7. `yl_teaching_games_picture_guessing_game` — Picture guessing game

**Purpose:** Use this layout for picture guessing game content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 8. `yl_teaching_games_matching_game` — Matching game

**Purpose:** Use this layout for matching game content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 9. `yl_teaching_games_fill_in_the_blank_game` — Fill-in-the-blank game

**Purpose:** Use this layout for fill-in-the-blank game content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 10. `yl_teaching_games_speed_round` — Speed round

**Purpose:** Use this layout for speed round content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 11. `yl_teaching_games_team_challenge` — Team challenge

**Purpose:** Use this layout for team challenge content in a teaching games deck.

**Composition archetype:** matrix / decision model

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Decision table/matrix: x=112 y=190 w=1100 h=590.
- Recommendation panel: x=1260 y=190 w=548 h=590.
- Criteria/source strip: x=112 y=820 w=1696 h=92.

**Required visual grammar:**
- Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 12. `yl_teaching_games_mini_quiz` — Mini quiz

**Purpose:** Use this layout for mini quiz content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 13. `yl_teaching_games_choice_wheel` — Choice wheel

**Purpose:** Use this layout for choice wheel content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 14. `yl_teaching_games_role_play_task` — Role-play task

**Purpose:** Use this layout for role-play task content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 15. `yl_teaching_games_find_the_error` — Find the error

**Purpose:** Use this layout for find the error content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 16. `yl_teaching_games_word_race` — Word race

**Purpose:** Use this layout for word race content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 17. `yl_teaching_games_memory_check` — Memory check

**Purpose:** Use this layout for memory check content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 18. `yl_teaching_games_bonus_round` — Bonus round

**Purpose:** Use this layout for bonus round content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 19. `yl_teaching_games_scoreboard` — Scoreboard

**Purpose:** Use this layout for scoreboard content in a teaching games deck.

**Composition archetype:** metric dashboard

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- KPI strip: x=112 y=138 w=1696 h=154; 3-5 metrics maximum.
- Main evidence chart: x=112 y=340 w=1050 h=470.
- Interpretation/action rail: x=1200 y=340 w=608 h=470.

**Required visual grammar:**
- Use metric strip plus one named operating/dashboard visual; every metric needs a label and interpretation.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 20. `yl_teaching_games_answer_reveal` — Answer reveal

**Purpose:** Use this layout for answer reveal content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 21. `yl_teaching_games_teacher_instruction` — Teacher instruction

**Purpose:** Use this layout for teacher instruction content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 22. `yl_teaching_games_reflection_prompt` — Reflection prompt

**Purpose:** Use this layout for reflection prompt content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 23. `yl_teaching_games_rewards_slide` — Rewards slide

**Purpose:** Use this layout for rewards slide content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 24. `yl_teaching_games_homework_mission` — Homework mission

**Purpose:** Use this layout for homework mission content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 25. `yl_teaching_games_closing_slide` — Closing slide

**Purpose:** Use this layout for closing slide content in a teaching games deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #E11D48 only for the main active signal.
- Use #7C3AED only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

## 9. QA Checklist

- Every generated slide uses one of the layout ids above.
- Every slide keeps the selected layout's coordinate zones.
- Adjacent slides do not share the same composition skeleton.
- Charts and bars are understandable without speaker narration.
- Tables have readable type and clear row/column hierarchy.
- Icons are modern inline SVG, semantically related, and not decorative filler.
- Images appear only in image-ready layouts and include annotation or framing rules.
- Repair passes must repair only the failed slide while preserving the layout id and design contract.
