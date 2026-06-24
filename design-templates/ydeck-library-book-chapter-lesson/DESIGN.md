# YDeck Book / Chapter Lesson Deck DESIGN.md

This is the art-direction and layout-engine contract for `ydeck-library-book-chapter-lesson`.
`template.json` is the structured source of truth for metadata, layout ids, flows,
palette, and capabilities. This file controls the visual behavior of the template.

## 1. Art Direction

This template is an academic workbook deck, not a business deck with softer colors.
It should feel like a premium teacher's edition: book spreads, marginalia, lesson
plans, board diagrams, evidence chains, answer sheets, reading journals, and seminar
mats.

- **Scenario:** book-chapter-lesson.
- **Primary metaphor:** a designed classroom reading packet.
- **Density:** low-to-medium, readable from a classroom screen.
- **Composition variance:** very high. Adjacent slides must not share the same shell.
- **Preview promise:** generated output should resemble the authored preview, not a weaker generic deck.
- **Never:** KPI cards, decorative charts, random bars, dashboard grids, generic left-title/right-graphic pages.

## 2. Palette Roles

- **Canvas:** `#FBF7EF` for warm academic paper.
- **Ink:** `#1C1917` for primary type and dark boards.
- **Accent:** `#7C2D12` for active learning signal, selected answer, evidence path, or chapter spine.
- **Secondary:** `#2563EB` for contrast, comparison, secondary annotation, or alternate answer state.
- **Porcelain:** `#FFFFFF` for book pages, worksheet cells, and high-contrast writing zones.
- **Fog:** `#E8EDF2` for quiet maps, ruled fields, tables, and student work surfaces.

Use color as meaning. Do not recolor identical layouts to fake variety.

## 3. Typography

- **Display titles:** local editorial serif stack from `template.json.typography.fontStacks.editorial`.
- **Body and UI labels:** local sans stack from `template.json.typography.fontStacks.sans`.
- **Labels:** condensed local stack when available; uppercase labels are allowed only for worksheet metadata and board tags.
- **Quotes:** editorial serif, 42-64px, generous leading.
- **Minimum body size:** 28px in generated slides.
- **Maximum prose line length:** 58-66 characters.
- **Do not:** import remote fonts, use browser font URLs, or use tiny gray labels as decoration.

## 4. Grid And Spatial System

The layout engine must choose a teaching artifact for each slide. The artifact is
more important than the decorative style.

- Lesson plan slides behave like teacher planning sheets.
- Text analysis slides behave like book spreads with margin notes.
- Exercise slides behave like worksheets with answer states.
- Map and timeline slides behave like actual reading aids.
- Discussion slides behave like seminar mats, not response-card grids.
- Summary and homework slides behave like reading journals or assignment sheets.

## 5. Chart, Bar, And Diagram Grammar

This template generally does not use business charts. Use diagrams only when the
lesson content needs structure:

- Timeline: real sequence with labeled beats and a decision gate.
- Setting map: spatial model with anchors and fact ledger.
- Theme analysis: layered interpretation model, constellation, or claim ladder.
- Character analysis: before-pressure-after evidence path.
- Quiz/check: answer-state sheet, not a bar chart.

Every diagram must have labels and a visible reading purpose. No decorative bars.

## 6. Icon And Image Rules

- Icons are optional and must be thin inline SVG, semantic, and sparse.
- Image-ready layouts use one large image or illustration zone with annotation rails.
- Never use emoji, icon fonts, CDN icon scripts, or remote image URLs.

## 7. Global Anti-Patterns

- No repeated card grids.
- No nested cards.
- No decorative charts or unlabeled bars.
- No repeated `title + three cards + footer` layout.
- No raw layout ids as design chrome.
- No fake universal data.
- No scripts, iframes, external CSS, remote fonts, or remote URLs.

## 8. Layout Engine

Each layout below has its own artifact. The agent may adapt copy and data, but it
must preserve the artifact, coordinate zones, and visual grammar.

### 1. `yl_book_chapter_lesson_chapter_title` — Open-book chapter cover

- **Artifact:** open book spread with a strong chapter spine.
- **Zones:** left page x=126 y=134 w=805 h=800; right page x=989 y=134 w=805 h=800; footer x=112 y=990 w=1696 h=32.
- **Visual grammar:** title occupies the left page; right page shows a simple book/lesson mark, chapter metadata, or source note.
- **Do not:** place a chart or KPI panel on the cover.

### 2. `yl_book_chapter_lesson_reading_objectives` — Teacher lesson-plan sheet

- **Artifact:** lesson plan with outcome numbers, proof verbs, and teacher note.
- **Zones:** planning sheet x=142 y=122 w=1220 h=820; teacher rail x=1510 y=196 w=330 h=640.
- **Visual grammar:** objectives are rows with proof actions such as explain, prove, locate, write.
- **Do not:** use equal feature cards or generic objectives blocks.

### 3. `yl_book_chapter_lesson_chapter_context` — Board talk with pinned notes

- **Artifact:** teacher board plus pinned context notes.
- **Zones:** dark board x=112 y=124 w=760 h=760; note field x=942 y=152 w=820 h=704.
- **Visual grammar:** show before-reading frame, stakes, reader job, and threads between notes.
- **Do not:** turn context into a timeline unless sequence is the lesson point.

### 4. `yl_book_chapter_lesson_characters_overview` — Character corkboard

- **Artifact:** relationship board with central character and evidence notes.
- **Zones:** corkboard x=112 y=126 w=1696 h=760; central character near x=690 y=250 w=240 h=220.
- **Visual grammar:** use strings/connectors and motive notes; relationship labels must attach to characters.
- **Do not:** use a four-card persona grid.

### 5. `yl_book_chapter_lesson_setting_map` — Spatial reading map

- **Artifact:** map field with anchored callouts and fact ledger.
- **Zones:** map x=112 y=142 w=1060 h=710; ledger x=1218 y=142 w=590 h=710.
- **Visual grammar:** map paths, named anchors, and setting facts.
- **Do not:** draw abstract blobs without anchors.

### 6. `yl_book_chapter_lesson_plot_timeline` — Plot sequence board

- **Artifact:** timeline board with plot beats and a decision gate.
- **Zones:** title x=112 y=134 w=640 h=210; timeline x=112 y=390 w=1696 h=360; notes x=112 y=790 w=1696 h=120.
- **Visual grammar:** horizontal or lane-based sequence with cause, choice, and consequence.
- **Do not:** use unlabeled progress bars.

### 7. `yl_book_chapter_lesson_key_excerpt` — Annotated book spread

- **Artifact:** source text on a page with annotation rail.
- **Zones:** source page x=124 y=122 w=800 h=820; annotation page x=924 y=122 w=872 h=820.
- **Visual grammar:** quote, margin notes, connector lines, and interpretive labels.
- **Do not:** reduce the excerpt to a quote card.

### 8. `yl_book_chapter_lesson_vocabulary_from_text` — Vocabulary tray

- **Artifact:** word study tray with clues, inference, definition, and usage.
- **Zones:** word block x=112 y=148 w=610 h=620; tray x=878 y=132 w=930 h=770.
- **Visual grammar:** the word is the hero; surrounding cells show evidence from text.
- **Do not:** use a generic four-card vocabulary grid without a text clue.

### 9. `yl_book_chapter_lesson_main_idea` — Claim ladder

- **Artifact:** ladder or funnel from observation to claim.
- **Zones:** prompt x=112 y=148 w=720 h=330; synthesis diagram x=872 y=160 w=936 h=650; teacher check x=112 y=750 w=650 h=180.
- **Visual grammar:** show movement from notice to connect to claim.
- **Do not:** show three equal observations with no synthesis.

### 10. `yl_book_chapter_lesson_theme_analysis` — Layered interpretation model

- **Artifact:** stacked theme layers or constellation.
- **Zones:** title x=120 y=150 w=690 h=430; interpretation model x=914 y=150 w=880 h=710.
- **Visual grammar:** topic, pressure, and theme claim must have distinct visual levels.
- **Do not:** label a single word as a complete theme.

### 11. `yl_book_chapter_lesson_literary_devices` — Author toolkit

- **Artifact:** author tool bench with device, example, and reader effect.
- **Zones:** dark instruction panel x=112 y=130 w=600 h=770; tool bench x=790 y=150 w=1010 h=720.
- **Visual grammar:** devices should feel like tools laid out for analysis, not business cards.
- **Do not:** include devices without reader effect.

### 12. `yl_book_chapter_lesson_character_analysis` — Character dossier

- **Artifact:** dossier file with profile and change evidence.
- **Zones:** dossier sheet x=130 y=128 w=1660 h=770; profile x=188 y=186 w=430 h=654; evidence path x=690 y=204 w=980 h=560.
- **Visual grammar:** before, pressure, after; each step needs evidence.
- **Do not:** use a generic SWOT or persona chart.

### 13. `yl_book_chapter_lesson_quote_evidence` — Citation-to-meaning chain

- **Artifact:** proof chain from quote to inference to claim.
- **Zones:** thesis x=112 y=150 w=640 h=430; chain x=838 y=130 w=970 h=780.
- **Visual grammar:** every connector must carry the quote toward meaning.
- **Do not:** put a quote beside unrelated analysis.

### 14. `yl_book_chapter_lesson_comprehension_questions` — Answer-state worksheet

- **Artifact:** quiz sheet with selected answer state.
- **Zones:** question band x=112 y=130 w=1696 h=330; options x=190 y=540 w=1540 h=240.
- **Visual grammar:** answer choices are visibly different states; correct answer is explained, not merely colored.
- **Do not:** use meaningless bars to show scores.

### 15. `yl_book_chapter_lesson_discussion_prompt` — Seminar mat

- **Artifact:** discussion mat with claim, quote, listen, revise roles.
- **Zones:** prompt x=112 y=130 w=760 h=620; seminar mat x=988 y=122 w=820 h=820.
- **Visual grammar:** show conversation movement around a center idea.
- **Do not:** use a response-card grid.

### 16. `yl_book_chapter_lesson_close_reading_task` — Three-pass close reading worksheet

- **Artifact:** worksheet with Pass 1 notice, Pass 2 annotate, Pass 3 infer.
- **Zones:** source strip x=112 y=128 w=620 h=824; three-pass workspace x=796 y=128 w=1012 h=824.
- **Visual grammar:** show progressive passes and student marks.
- **Do not:** collapse all tasks into one generic prompt box.

### 17. `yl_book_chapter_lesson_compare_contrast` — Split reading table

- **Artifact:** comparison spread with two columns and a center bridge.
- **Zones:** left text x=112 y=150 w=610 h=720; bridge x=784 y=210 w=352 h=600; right text x=1198 y=150 w=610 h=720.
- **Visual grammar:** similarities live in the bridge; differences stay on their side.
- **Do not:** use a generic 2x2 matrix.

### 18. `yl_book_chapter_lesson_creative_response` — Studio prompt board

- **Artifact:** creative studio board with prompt, constraints, and example moves.
- **Zones:** prompt wall x=112 y=120 w=720 h=820; studio canvas x=900 y=120 w=908 h=820.
- **Visual grammar:** include output format, constraints, and reader purpose.
- **Do not:** make creativity a blank decorative canvas.

### 19. `yl_book_chapter_lesson_writing_prompt` — Essay planning page

- **Artifact:** claim/evidence/reasoning organizer.
- **Zones:** prompt header x=112 y=120 w=1696 h=210; organizer x=190 y=390 w=1540 h=500.
- **Visual grammar:** students can see where claim, evidence, reasoning, and final insight go.
- **Do not:** show only a large prompt and empty space.

### 20. `yl_book_chapter_lesson_grammar_from_text` — Sentence surgery bench

- **Artifact:** sentence dissection board with parts, transformation, and explanation.
- **Zones:** sentence strip x=112 y=128 w=1696 h=220; analysis bench x=180 y=410 w=1560 h=500.
- **Visual grammar:** underline or bracket grammar parts; include a revised sentence.
- **Do not:** use grammar terms without textual examples.

### 21. `yl_book_chapter_lesson_quiz_check` — Mini assessment sheet

- **Artifact:** compact quiz with progress and confidence check.
- **Zones:** quiz x=150 y=120 w=1040 h=840; confidence strip x=1240 y=170 w=520 h=720.
- **Visual grammar:** include answer states and teacher review cue.
- **Do not:** use decorative score donuts.

### 22. `yl_book_chapter_lesson_answer_key` — Teacher answer key

- **Artifact:** answer key with rationale and common misconception.
- **Zones:** answer table x=112 y=130 w=1040 h=800; misconception rail x=1210 y=130 w=598 h=800.
- **Visual grammar:** every answer has rationale, not just a letter.
- **Do not:** make the answer key look like a dashboard table.

### 23. `yl_book_chapter_lesson_chapter_summary` — Reading journal summary

- **Artifact:** journal page with what changed, evidence kept, and final thought.
- **Zones:** journal page x=112 y=126 w=1060 h=820; takeaway rail x=1230 y=126 w=578 h=820.
- **Visual grammar:** summarize through narrative movement, not metrics.
- **Do not:** use executive-summary KPI cards.

### 24. `yl_book_chapter_lesson_homework_reading` — Assignment bookmark

- **Artifact:** homework assignment sheet with bookmark-style reading range.
- **Zones:** assignment x=112 y=120 w=900 h=830; bookmark x=1080 y=120 w=360 h=830; prep notes x=1490 y=120 w=318 h=830.
- **Visual grammar:** reading pages, task, evidence to collect, and next-class use.
- **Do not:** show homework as a generic task card.

### 25. `yl_book_chapter_lesson_next_chapter_preview` — Next chapter teaser

- **Artifact:** teaser spread with question, clue, and preview image/shape zone.
- **Zones:** teaser title x=112 y=130 w=760 h=540; clue board x=956 y=130 w=852 h=540; bottom path x=112 y=770 w=1696 h=150.
- **Visual grammar:** create curiosity and a clear next reading question.
- **Do not:** summarize the next chapter as a conclusion slide.

## 9. QA Checklist

- Every generated slide uses one layout id from this template.
- Adjacent slides change artifact type, focal zone, and visual grammar.
- Every exercise slide includes a visible student action.
- Every analysis slide ties evidence to meaning.
- Diagrams have labels and a clear instructional purpose.
- Icons are sparse, modern inline SVG, and semantically useful.
- Images appear only in image-ready layouts and include annotation or framing.
- Repair passes must repair only the failed slide while preserving the layout id and artifact contract.
