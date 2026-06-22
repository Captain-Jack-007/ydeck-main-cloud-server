# YDeck Agent Skills Summary

This document summarizes what the YDeck cloud agent can do, how its specialist
skills work, and how the design skill turns a request into professional slide
previews.

YDeck is currently a cloud-first multi-agent presentation system. The frontend
does not run these skills directly. It sends user intent to the backend, listens
to realtime events, renders backend slide previews, and fetches the final deck
artifact.

## Core Idea

YDeck behaves like a presentation team:

```txt
Intent Classifier
  -> Planner
  -> Context Agent
  -> File / Research Agents when needed
  -> Outline Agent
  -> Content Agent
  -> Layout Agent
  -> Image Asset Agent
  -> HTML Designer Agent
  -> QA / Repair Agents
  -> Export / Delivery Agents
```

The agent has an advanced internal tool registry with 80 tools across planning,
files, research, writing, design, assets, QA, export, memory, and analytics.
Specialist agents receive only the tools they need. For example, the Research
Agent gets research tools, while the HTML Designer gets design and visual tools.

## Main Skills

| Skill | What it does | Key output |
| --- | --- | --- |
| Intent understanding | Detects chat vs deck creation vs deck editing, including multilingual prompts. | `intent`, language, slide count hints |
| Planning | Creates visible steps for the user. | `deck.plan` |
| Context loading | Reads project, workspace, brand, preferences, packs, and prior deck versions. | `deck.context` |
| File understanding | Reads uploaded files and summarizes useful facts or slide ideas. | `deck.file` |
| Web research | Uses Tavily/web search when the prompt needs current facts or sources. | `deck.research` |
| Outline writing | Creates slide story, order, type, title, and purpose. | `deck.outline` |
| Content writing | Writes slide titles, subtitles, bullets, notes, and visual intent. | `deck.content` |
| Layout selection | Chooses controlled YDeck layouts per slide. | layout decisions |
| Image selection | Searches Pexels, shows image candidates, stores selected assets. | `deck.asset` |
| HTML slide design | Designs one slide at a time as 1920x1080 HTML/CSS. | `slide.preview` |
| Design QA | Checks readability, density, HTML safety, layout issues, and repair needs. | `deck.qa` |
| Repair | Fixes weak slides and re-emits previews. | `deck.repair`, `slide.preview` |
| Export/delivery | Saves artifacts and prepares export metadata. | `deck.export`, `deck.done` |

## Design Skill

The design skill is the center of YDeck. It does not simply generate a PPT file
directly. It designs visual slides as HTML first, then streams previews to the
frontend.

Design flow:

```txt
Content slide
  -> approved layout
  -> brand/theme context
  -> image/chart/icon needs
  -> one-slide LLM HTML design
  -> deterministic normalization and QA
  -> slide.preview event
  -> final deck artifact
```

The HTML Designer Agent designs **one slide at a time**. Each slide receives:

- slide purpose
- selected layout ID
- title, subtitle, bullets, and speaker notes
- deck style and language
- neighboring slide context
- stored image asset, if selected
- strict HTML design rules

It must return one self-contained slide:

```html
<section class="ydeck-slide" style="width:1920px;height:1080px;...">
  ...
</section>
```

## Design Rules

The design skill must follow controlled rules:

- fixed `1920 x 1080` slide canvas
- self-contained HTML/CSS
- no external scripts
- no unsafe HTML
- no text overflow
- readable font sizes
- consistent visual hierarchy
- approved layout families only
- consistent brand/theme tokens
- use icons, charts, diagrams, timelines, and images only when they improve the slide

The LLM is not allowed to freely invent a random deck style for every slide.
Good output comes from controlled variation.

## Layouts

The design system uses approved layout families, including:

- `title_hero`
- `problem_cards`
- `solution_split`
- `comparison_split`
- `metric_focus`
- `timeline_process`
- `card_grid`
- `quote_statement`
- `closing_cta`

The Layout Agent chooses layouts before the HTML Designer runs. Design
refinement requests can intentionally choose alternate layouts while preserving
the same story.

## Visual Assets

The visual asset skill supports:

- Pexels image search
- image candidate preview events
- image selection and storage
- user-uploaded images/logos
- SVG/HTML charts
- table visuals
- diagrams
- icon visuals
- image credits

When image search runs, frontend can show `deck.asset` events as a candidate
grid or carousel while the agent is working. The final slide preview should use
only stored backend image assets, not arbitrary remote image URLs.

## Design Tools

The design-side tool surface includes:

| Tool | Purpose |
| --- | --- |
| `list_design_packs` | Reads available design/template packs. |
| `choose_design_pack` | Chooses a design direction from the brief and brand. |
| `choose_layouts` | Selects layout IDs for slides. |
| `design_slide_html` | Designs one slide as HTML/CSS. |
| `design_deck_html` | Designs/saves a full deck artifact. |
| `apply_brand_style` | Applies brand colors, fonts, logo rules. |
| `normalize_slide_html` | Removes unsafe HTML and ensures export-safe markup. |
| `layout_fallback` | Creates a safe fallback when design fails. |
| `detect_visual_needs` | Finds slides that need images, charts, icons, or diagrams. |
| `search_images` | Searches Pexels/image sources. |
| `select_image` | Stores selected image assets. |
| `create_chart` | Creates SVG chart markup. |
| `create_table_visual` | Creates clean table visuals. |
| `create_diagram` | Creates process/timeline/funnel/roadmap visuals. |
| `create_icon_visual` | Creates icon-based visual blocks. |
| `run_design_qa` | Runs deterministic design QA. |
| `repair_slide_design` | Repairs one weak slide. |
| `repair_deck_design` | Repairs deck-wide design issues. |
| `final_deck_review` | Runs final quality review. |

Heavy render/vision tools are registered but still need backing services:

- `render_slide_screenshot`
- `render_deck_screenshots`
- `vision_review_slide`
- `vision_review_deck`

## Frontend Contract

Frontend should show the agent skill progress through realtime events:

| Event | Frontend use |
| --- | --- |
| `deck:plan` | Show the agent plan. |
| `deck:context` | Show context/brand loading. |
| `deck:file` | Show file processing. |
| `deck:research` | Show research/source gathering. |
| `deck:outline` | Show slide outline. |
| `deck:content` | Show content/layout progress. |
| `deck:asset` | Show image candidates or selected assets. |
| `deck:event` with `type: "slide.preview"` | Render incremental slide HTML previews. |
| `deck:qa` | Show QA score/issues. |
| `deck:repair` | Show repair progress. |
| `deck:export` | Show export progress. |
| `deck:done` | Fetch final job/deck artifact. |

Events may include tool usage:

```json
{
  "toolUsage": {
    "stage": "designing",
    "toolsUsed": 2,
    "uniqueToolsUsed": 2,
    "toolNames": ["design_deck_html", "design_slide_html"]
  }
}
```

Use `toolsUsed` for the visible step count and `toolNames` for expandable debug
details.

## Final Artifact

The final deck lives in:

```txt
job.resultMeta.deckArtifact
```

Each slide can include:

- `slideNumber`
- `title`
- `subtitle`
- `bullets`
- `speakerNotes`
- `layoutId`
- `visual`
- `preview.html`
- `html`

The frontend should treat the final artifact as canonical. Tool calls and events
are progress/debug signals, not the source of truth.

## Current Limits

Implemented now:

- cloud multi-agent generation
- 80-tool registry
- role-limited tool selection
- one-by-one HTML slide design
- Pexels image candidate/search flow
- Google Vision OCR with Tencent OCR fallback through `ocr_image`
- Playwright Chromium screenshot rendering through `render_slide_screenshot`
  and `render_deck_screenshots`
- Vision QA through `vision_review_slide` and `vision_review_deck`
  with OpenAI primary and Tencent Hunyuan fallback
- deterministic QA/repair
- realtime slide previews
- tool usage counts by stage
- HTML and basic PPTX export paths

Still service-backed future work:

- queued/Docker render worker with object storage instead of in-process rendering
- activating/provisioning Tencent Hunyuan if Tencent fallback is required in production
- full binary PDF/DOCX/PPTX extraction
- rich screenshot-to-PPTX export

The product message is:

```txt
YDeck does not just generate slides. It plans, writes, designs, previews, checks,
repairs, and exports them through a cloud presentation agent.
```
