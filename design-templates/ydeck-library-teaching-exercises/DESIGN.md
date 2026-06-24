# YDeck Teaching + Exercises DESIGN.md

This file is the art-direction and layout-engine contract for `ydeck-library-teaching-exercises`.
`template.json` remains the structured source of truth for metadata, layout ids,
flows, palette, and capabilities. This file controls how those layouts must look.

## 1. Art Direction

An academic workbook deck: generous whitespace, persistent learning path, serif-led titles, and clear student task structures.

- **Scenario:** teaching-exercises
- **Density:** low-to-medium, classroom readable
- **Variance:** high; every layout has a distinct spatial skeleton
- **Primary visual metaphor:** course module workbook
- **Design must feel like:** html-ppt-course-module quality, adapted to YDeck layout vocabulary
- **Design must never feel like:** generic recolored YDeck chrome, decorative chart wallpaper, or one universal left-title/right-graphic template.

## 2. Palette Roles

- **Canvas:** #F7FAFC — primary deck surface
- **Ink:** #102033 — primary type and dense information.
- **Accent:** #2563EB — active state, selected path, primary evidence, or headline marker.
- **Secondary:** #16A34A — contrast signal, warning, comparison, or secondary data series.
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

### 1. `yl_teaching_exercises_lesson_title` — Lesson title

**Purpose:** Use this layout for lesson title content in a teaching exercises deck.

**Composition archetype:** title / cover

**Coordinate zones:**
- Title block: x=112 y=180 w=980 h=420, or academic inset x=170 y=190 w=1040 h=420.
- Context/descriptor: x=112 y=620 w=780 h=160; use one focused paragraph.
- Optional proof/metadata rail: x=1180 y=180 w=520 h=620; never use a generic chart unless the template is analytical.
- Footer: x=112 y=990 w=1696 h=32.

**Required visual grammar:**
- Use a distinctive title composition for this template; no generic chart card on the cover.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 2. `yl_teaching_exercises_learning_objectives` — Learning objectives

**Purpose:** Use this layout for learning objectives content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 3. `yl_teaching_exercises_agenda_path` — Agenda path

**Purpose:** Use this layout for agenda path content in a teaching exercises deck.

**Composition archetype:** timeline / sequence

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Title/intent: x=112 y=160 w=680 h=190.
- Timeline canvas: x=112 y=390 w=1696 h=360; use lanes, milestones, or stage blocks.
- Decision gate notes: x=112 y=790 w=1696 h=120.

**Required visual grammar:**
- Use a real timeline, Gantt lane, learning path, or roadmap with stage labels and sequencing direction.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 4. `yl_teaching_exercises_warm_up_question` — Warm-up question

**Purpose:** Use this layout for warm-up question content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 5. `yl_teaching_exercises_vocabulary_cards` — Vocabulary cards

**Purpose:** Use this layout for vocabulary cards content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 6. `yl_teaching_exercises_concept_explanation` — Concept explanation

**Purpose:** Use this layout for concept explanation content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 7. `yl_teaching_exercises_guided_example` — Guided example

**Purpose:** Use this layout for guided example content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 8. `yl_teaching_exercises_worked_steps` — Worked steps

**Purpose:** Use this layout for worked steps content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 9. `yl_teaching_exercises_practice_prompt` — Practice prompt

**Purpose:** Use this layout for practice prompt content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 10. `yl_teaching_exercises_fill_in_the_blank` — Fill in the blank

**Purpose:** Use this layout for fill in the blank content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 11. `yl_teaching_exercises_matching_exercise` — Matching exercise

**Purpose:** Use this layout for matching exercise content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 12. `yl_teaching_exercises_multiple_choice` — Multiple choice

**Purpose:** Use this layout for multiple choice content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 13. `yl_teaching_exercises_sentence_builder` — Sentence builder

**Purpose:** Use this layout for sentence builder content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 14. `yl_teaching_exercises_reading_passage` — Reading passage

**Purpose:** Use this layout for reading passage content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 15. `yl_teaching_exercises_comprehension_check` — Comprehension check

**Purpose:** Use this layout for comprehension check content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 16. `yl_teaching_exercises_pair_work` — Pair work

**Purpose:** Use this layout for pair work content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 17. `yl_teaching_exercises_role_play` — Role play

**Purpose:** Use this layout for role play content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 18. `yl_teaching_exercises_teacher_instruction` — Teacher instruction

**Purpose:** Use this layout for teacher instruction content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 19. `yl_teaching_exercises_student_worksheet` — Student worksheet

**Purpose:** Use this layout for student worksheet content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 20. `yl_teaching_exercises_answer_reveal` — Answer reveal

**Purpose:** Use this layout for answer reveal content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 21. `yl_teaching_exercises_common_mistakes` — Common mistakes

**Purpose:** Use this layout for common mistakes content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 22. `yl_teaching_exercises_progress_check` — Progress check

**Purpose:** Use this layout for progress check content in a teaching exercises deck.

**Composition archetype:** metric dashboard

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- KPI strip: x=112 y=138 w=1696 h=154; 3-5 metrics maximum.
- Main evidence chart: x=112 y=340 w=1050 h=470.
- Interpretation/action rail: x=1200 y=340 w=608 h=470.

**Required visual grammar:**
- Use metric strip plus one named operating/dashboard visual; every metric needs a label and interpretation.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use unlabelled bars or decorative fake trend lines
- show more than one primary chart unless the layout is explicitly a dashboard

### 23. `yl_teaching_exercises_summary_takeaways` — Summary takeaways

**Purpose:** Use this layout for summary takeaways content in a teaching exercises deck.

**Composition archetype:** executive summary

**Coordinate zones:**
- Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.
- Primary title/content block: x=112 y=170 w=760 h=610.
- Supporting visual/proof block: x=940 y=170 w=868 h=610.
- Footer/source/action strip: x=112 y=850 w=1696 h=96.

**Required visual grammar:**
- Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use generic cards as filler
- add a chart only for decoration

### 24. `yl_teaching_exercises_homework_task` — Homework task

**Purpose:** Use this layout for homework task content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

**Do not:**
- repeat the exact previous slide skeleton
- use business KPI cards
- use charts unless the exercise is about data
- hide the learning path

### 25. `yl_teaching_exercises_next_lesson_preview` — Next lesson preview

**Purpose:** Use this layout for next lesson preview content in a teaching exercises deck.

**Composition archetype:** learning interaction

**Coordinate zones:**
- Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.
- Main instruction title: x=536 y=144 w=1170 h=120.
- Practice/work area: x=536 y=320 w=1170 h=560.
- Answer/check state: inside work area; do not add business-style charts.

**Required visual grammar:**
- Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.
- Use #2563EB only for the main active signal.
- Use #16A34A only for contrast, risk, comparison, or secondary series.

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
