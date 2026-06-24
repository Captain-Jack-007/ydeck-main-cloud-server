#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const templateRoot = path.join(root, 'design-templates');

function main() {
  const dirs = fs
    .readdirSync(templateRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('ydeck-library-'))
    .map((entry) => entry.name)
    .sort();

  const written = [];
  for (const slug of dirs) {
    const dir = path.join(templateRoot, slug);
    const templatePath = path.join(dir, 'template.json');
    if (!fs.existsSync(templatePath)) continue;
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const design = renderDesignDoc(template);
    fs.writeFileSync(path.join(dir, 'DESIGN.md'), design);
    written.push(slug);
  }

  console.log(`Generated ${written.length} YDeck DESIGN.md files.`);
  for (const slug of written) console.log(`- ${slug}`);
}

function renderDesignDoc(template) {
  const profile = profileFor(template);
  const palette = normalizePalette(template.palette || {});
  const layouts = Array.isArray(template.layouts) ? template.layouts : [];

  return `# ${template.name} DESIGN.md

This file is the art-direction and layout-engine contract for \`${template.slug}\`.
\`template.json\` remains the structured source of truth for metadata, layout ids,
flows, palette, and capabilities. This file controls how those layouts must look.

## 1. Art Direction

${profile.atmosphere}

- **Scenario:** ${template.scenario}
- **Density:** ${profile.density}
- **Variance:** ${profile.variance}
- **Primary visual metaphor:** ${profile.metaphor}
- **Design must feel like:** ${profile.feelsLike}
- **Design must never feel like:** generic recolored YDeck chrome, decorative chart wallpaper, or one universal left-title/right-graphic template.

## 2. Palette Roles

- **Canvas:** ${palette.background} — ${profile.canvasRole}
- **Ink:** ${palette.text} — primary type and dense information.
- **Accent:** ${palette.accent} — active state, selected path, primary evidence, or headline marker.
- **Secondary:** ${palette.secondary} — contrast signal, warning, comparison, or secondary data series.
- **Porcelain:** ${palette.porcelain} — calm reading surfaces and high-contrast cards.
- **Fog:** ${palette.fog} — quiet grid, table, chart, and sidebar fills.

Use these colors functionally. Do not swap accents only to make repeated layouts look different.

## 3. Typography

- **Display:** ${profile.displayType}
- **Body:** ${profile.bodyType}
- **Labels:** Avenir Next Condensed or DIN Condensed, uppercase, 0.08em-0.12em letter spacing.
- **Numbers:** ${profile.numberType}
- **Minimum body size:** 28px on generated slides.
- **Maximum body line length:** 58-66 characters unless the layout is a table.
- **Do not:** use remote fonts, browser font imports, or unavailable webfont names.

## 4. Grid And Spatial System

- **Canvas:** 1920 x 1080 fixed.
- **Outer margins:** ${profile.margin}.
- **Primary grid:** ${profile.grid}
- **Rhythm:** ${profile.rhythm}
- **Chrome:** header/footer may be subtle, but user-facing previews must not expose raw layout ids as design decoration.
- **Slide-to-slide variation:** adjacent layouts must change at least two of these: focal zone, column count, chart position, background field, or visual grammar.

## 5. Chart, Bar, And Diagram Grammar

${profile.chartGrammar}

Do not place a chart on every slide. Charts are only allowed where they explain a numeric relationship.
When a chart appears, the chart must have a named purpose, axis/labels, and a clear takeaway zone.

## 6. Icon And Image Grammar

${profile.iconImageGrammar}

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

${layouts.map((layout, index) => renderLayoutContract(template, profile, palette, layout, index)).join('\n\n')}

## 9. QA Checklist

- Every generated slide uses one of the layout ids above.
- Every slide keeps the selected layout's coordinate zones.
- Adjacent slides do not share the same composition skeleton.
- Charts and bars are understandable without speaker narration.
- Tables have readable type and clear row/column hierarchy.
- Icons are modern inline SVG, semantically related, and not decorative filler.
- Images appear only in image-ready layouts and include annotation or framing rules.
- Repair passes must repair only the failed slide while preserving the layout id and design contract.
`;
}

function renderLayoutContract(template, profile, palette, layout, index) {
  const archetype = classifyLayout(template, layout, index);
  const zones = zonesFor(profile, archetype, index);
  const visual = visualFor(template, profile, archetype, layout, index);
  const banned = bannedFor(archetype);

  return `### ${index + 1}. \`${layout.id}\` — ${layout.name}

**Purpose:** ${layout.description || `Use for ${layout.role || layout.name}.`}

**Composition archetype:** ${archetype}

**Coordinate zones:**
${zones.map((zone) => `- ${zone}`).join('\n')}

**Required visual grammar:**
- ${visual}
- Use ${palette.accent} only for the main active signal.
- Use ${palette.secondary} only for contrast, risk, comparison, or secondary series.

**Do not:**
${banned.map((item) => `- ${item}`).join('\n')}`;
}

function profileFor(template) {
  const slug = template.slug || '';
  const scenario = template.scenario || '';
  const base = {
    atmosphere: 'A premium, scenario-specific presentation system with strict composition control and no generic generated-slide habits.',
    density: 'balanced, presentation-readable',
    variance: 'high; every layout has a distinct spatial skeleton',
    metaphor: 'structured editorial briefing',
    feelsLike: 'an authored deck from a specialist design team',
    canvasRole: 'primary deck surface',
    displayType: 'Avenir Next heavy for modern decks; editorial serif only for academic/book covers.',
    bodyType: 'Avenir Next, 28-32px, relaxed leading.',
    numberType: 'tabular-feeling display numerals, 44-104px depending on hierarchy.',
    margin: '112px left/right, 54px top/bottom for business decks; 170px title inset for academic covers.',
    grid: '12-column editorial grid with fixed zones, not free-floating cards.',
    rhythm: 'alternate sparse thesis slides with denser evidence slides.',
    chartGrammar: 'Charts use static inline SVG or server-rendered chart SVG. Prefer one strong chart with labels over several small decorative charts.',
    iconImageGrammar: 'Use thin, precise inline SVG icons only when they clarify a concept. Image layouts use one large image zone with annotation rails.',
  };

  const profiles = [
    {
      match: () => scenario === 'business-report',
      patch: {
        atmosphere: 'An editorial operating-report system: calm executive surface, dense but legible KPI evidence, and management-action clarity.',
        density: 'high but ordered, like a monthly board packet',
        metaphor: 'operating review table with annotated variance',
        feelsLike: 'McKinsey-style monthly business review with warmer editorial spacing',
        grid: 'KPI strip, main evidence pane, action/risk side rail, and compact management note zones.',
        chartGrammar: 'Use KPI strips, variance bridges, target-vs-actual grouped bars, waterfall bridges, issue ledgers, and initiative trackers. Avoid donuts except for allocation/control coverage.',
      },
    },
    {
      match: () => scenario === 'investment-analysis',
      patch: {
        atmosphere: 'An investment committee memo: sober, analytical, valuation-oriented, and evidence heavy.',
        density: 'dense, finance-readable',
        metaphor: 'IC memo with valuation ranges and scenario gates',
        feelsLike: 'investment banking appendix polish with startup diligence clarity',
        grid: 'left thesis column, central model/table zone, right decision/risk strip.',
        chartGrammar: 'Use valuation football fields, market waterfalls, scenario bands, unit economics stacks, sensitivity tables, risk-return matrices, and deal-structure waterfalls.',
      },
    },
    {
      match: () => scenario === 'country-overview',
      patch: {
        atmosphere: 'A country intelligence dossier: geographic, civic, macroeconomic, and cultural context with sober map-led hierarchy.',
        metaphor: 'analyst country brief with atlas notes',
        feelsLike: 'Economist-style country briefing deck',
        grid: 'map field, fact ledger, macro chart, and source/evidence band.',
        chartGrammar: 'Use labeled maps, population pyramids, GDP composition bars, trade flow ribbons, policy timelines, and comparison tables. Avoid generic abstract curves.',
      },
    },
    {
      match: () => scenario === 'project-overview',
      patch: {
        atmosphere: 'A delivery command deck: clear scope, workstreams, owners, risks, budget, and decision gates.',
        metaphor: 'PMO command center with milestone evidence',
        feelsLike: 'enterprise project steering committee material',
        grid: 'workstream lanes, milestone timeline, dependency map, budget stack, and decision panel.',
        chartGrammar: 'Use Gantt-style bars, milestone swimlanes, dependency networks, RACI boards, budget stacks, status heatmaps, and checklist ledgers.',
      },
    },
    {
      match: () => scenario === 'company-profile',
      patch: {
        atmosphere: 'A polished corporate profile: confident, restrained, proof-rich, and customer-facing.',
        metaphor: 'company showroom with operating proof',
        feelsLike: 'premium B2B corporate introduction deck',
        grid: 'service architecture, proof metrics, timeline, logo wall, team/story photo zones.',
        chartGrammar: 'Use service portfolio grids, client segment maps, results metric panels, process swimlanes, and geographic presence maps.',
      },
    },
    {
      match: () => scenario === 'policy-brief',
      patch: {
        atmosphere: 'A government policy dossier: civic, neutral, evidence-led, and implementation-focused.',
        metaphor: 'public-sector decision memo',
        feelsLike: 'World Bank / ministry policy briefing',
        grid: 'problem evidence, population impact, options table, implementation model, budget allocation, safeguards.',
        chartGrammar: 'Use policy gap ladders, beneficiary journeys, regional maps, budget allocation bars, monitoring dashboards, and option scorecards.',
      },
    },
    {
      match: () => scenario === 'event-expo',
      patch: {
        atmosphere: 'A cinematic event/expo deck: dark-stage energy, program clarity, and sponsor/demo wayfinding.',
        density: 'medium, event-readable from a distance',
        metaphor: 'venue wayfinding and product showcase',
        feelsLike: 'premium conference stage screen package',
        grid: 'stage title, agenda schedule, speaker card, venue map, product demo flow, sponsor wall.',
        chartGrammar: 'Use agenda timelines, countdown modules, venue maps, pavilion paths, impact counters, and poll/result panels. Charts are large and stage-readable.',
      },
    },
    {
      match: () => scenario.includes('teaching') || scenario.includes('training') || scenario.includes('book'),
      patch: {
        atmosphere: 'An academic workbook deck: generous whitespace, persistent learning path, serif-led titles, and clear student task structures.',
        density: 'low-to-medium, classroom readable',
        metaphor: 'course module workbook',
        feelsLike: 'html-ppt-course-module quality, adapted to YDeck layout vocabulary',
        displayType: 'Editorial serif for covers and lesson heads; Avenir Next heavy for task cards.',
        grid: 'persistent 320px learning sidebar, 1170px main lesson canvas, practice/result panels.',
        chartGrammar: 'Use progress bars, answer states, matching tables, word cards, reading evidence grids, and simple scoreboards. Do not use business charts unless teaching data.',
      },
    },
    {
      match: () => slug.includes('technical-architecture'),
      patch: {
        atmosphere: 'A technical architecture review: dark blueprint surface, layered topology, security/control planes, and precise service diagrams.',
        metaphor: 'systems blueprint',
        feelsLike: 'senior architecture review deck',
        grid: 'layered systems map, API/service nodes, data plane, security plane, risk register.',
        chartGrammar: 'Use topology diagrams, sequence flows, latency bars, capability matrices, risk heatmaps, and deployment timelines. Avoid business KPI decoration.',
      },
    },
    {
      match: () => slug.includes('creative-portfolio'),
      patch: {
        atmosphere: 'A portfolio editorial deck: image-led, asymmetric, expressive, with generous negative space and proof captions.',
        metaphor: 'studio wall and case-study spread',
        feelsLike: 'creative agency portfolio presentation',
        grid: 'full-bleed image fields, caption rails, process strips, case-study proof panels.',
        chartGrammar: 'Use minimal charts. Prefer image sequences, project timelines, before/after frames, and visual evidence boards.',
      },
    },
    {
      match: () => slug.includes('brand-story'),
      patch: {
        atmosphere: 'A brand narrative deck: editorial, emotional, audience-aware, and proof-backed without becoming a data report.',
        metaphor: 'brand manifesto with evidence pages',
        feelsLike: 'premium brand strategy presentation',
        grid: 'large thesis typography, audience insight panels, principles, narrative timeline, proof examples.',
        chartGrammar: 'Use audience maps, sentiment bars, evidence grids, brand architecture diagrams, and launch timelines. No generic metric dashboards.',
      },
    },
    {
      match: () => slug.includes('product-launch'),
      patch: {
        atmosphere: 'A product launch system: product-first, audience-first, and launch-sequence driven.',
        metaphor: 'launch room with product proof',
        feelsLike: 'premium SaaS/product GTM launch deck',
        grid: 'product hero, audience pain, feature proof, launch timeline, channel plan, adoption evidence.',
        chartGrammar: 'Use adoption funnels, launch calendars, feature comparison tables, audience segments, and channel mix bars.',
      },
    },
    {
      match: () => slug.includes('sales-proposal'),
      patch: {
        atmosphere: 'A consultative proposal deck: client problem, solution proof, commercial clarity, and decision next step.',
        metaphor: 'sales solution room',
        feelsLike: 'enterprise proposal deck, not a marketing brochure',
        grid: 'client context, solution architecture, proof points, investment logic, implementation plan.',
        chartGrammar: 'Use value waterfalls, ROI bridge, implementation roadmap, option table, and risk-control matrix.',
      },
    },
    {
      match: () => slug.includes('market-research'),
      patch: {
        atmosphere: 'A research intelligence deck: neutral, analytical, source-aware, and insight-led.',
        metaphor: 'research desk with evidence board',
        feelsLike: 'market research report with editorial restraint',
        grid: 'insight thesis, evidence cards, market sizing, segment map, trend timeline, recommendation page.',
        chartGrammar: 'Use market size waterfalls, segment matrices, trend bands, competitive maps, survey result bars, and insight evidence grids.',
      },
    },
    {
      match: () => slug.includes('financial-plan'),
      patch: {
        atmosphere: 'A financial planning deck: calm, numerate, scenario-based, and board-readable.',
        metaphor: 'finance model summary',
        feelsLike: 'CFO planning deck',
        grid: 'assumption panel, revenue/cost model, allocation stack, runway/scenario bands, decision request.',
        chartGrammar: 'Use revenue bridges, cost stacks, runway bands, budget allocations, scenario ranges, and break-even charts.',
      },
    },
    {
      match: () => slug.includes('investor-update'),
      patch: {
        atmosphere: 'An investor update deck: transparent, metric-led, narrative, and crisp about asks/blockers.',
        metaphor: 'founder update memo',
        feelsLike: 'Series A/B investor update, board-readable',
        grid: 'headline metric strip, traction evidence, product progress, financial snapshot, asks/blockers.',
        chartGrammar: 'Use growth curves, cohort bars, runway strips, product milestone timelines, pipeline stacks, and ask/blocker tables.',
      },
    },
    {
      match: () => slug.includes('executive-strategy'),
      patch: {
        atmosphere: 'An executive strategy deck: sparse thesis pages, decision logic, portfolio tradeoffs, and action sequencing.',
        metaphor: 'strategy room with decision boards',
        feelsLike: 'CEO strategy offsite presentation',
        grid: 'strategic thesis, market context, option comparison, operating model, roadmap, decision ask.',
        chartGrammar: 'Use strategic option scorecards, portfolio maps, decision trees, capability matrices, and phased roadmaps.',
      },
    },
  ];

  const found = profiles.find((item) => item.match());
  return found ? { ...base, ...found.patch } : base;
}

function classifyLayout(template, layout, index) {
  const text = `${layout.id} ${layout.name} ${layout.role || ''}`.toLowerCase();
  if (index === 0 || includesAny(text, ['title', 'opening thesis'])) return 'title / cover';
  if (includesAny(text, ['summary', 'brief', 'snapshot', 'who we are', 'key facts', 'one-page'])) return 'executive summary';
  if (includesAny(text, ['dashboard', 'kpi', 'metrics', 'monitoring', 'status', 'scoreboard', 'progress', 'impact'])) return 'metric dashboard';
  if (includesAny(text, ['trend', 'forecast', 'gdp', 'revenue', 'cost', 'financial', 'budget', 'valuation', 'roi', 'unit economics', 'market size', 'macro', 'traction', 'population', 'trade'])) return 'chart / quantitative evidence';
  if (includesAny(text, ['timeline', 'roadmap', 'history', 'agenda', 'schedule', 'countdown', 'milestone', 'journey', 'path'])) return 'timeline / sequence';
  if (includesAny(text, ['map', 'location', 'venue', 'regional', 'geographic', 'cities', 'setting', 'presence'])) return 'map / spatial model';
  if (includesAny(text, ['architecture', 'stakeholder', 'dependency', 'ecosystem', 'process', 'workstream', 'operating', 'governance', 'implementation model', 'technology stack', 'solution overview', 'methodology', 'demo flow'])) return 'system / network diagram';
  if (includesAny(text, ['risk', 'gap', 'swot', 'challenge', 'option', 'comparison', 'competitive', 'policy', 'decision request', 'scope', 'boundaries', 'issue log', 'regulation'])) return 'matrix / decision model';
  if (includesAny(text, ['exercise', 'question', 'quiz', 'matching', 'blank', 'answer', 'vocabulary', 'role play', 'reading', 'lesson', 'game', 'worksheet', 'homework', 'comprehension', 'warm-up', 'student'])) return 'learning interaction';
  if (includesAny(text, ['image', 'photo', 'showcase', 'team', 'founder', 'portfolio', 'case study', 'story', 'culture', 'tourism', 'product', 'speaker', 'logos', 'awards'])) return 'image / proof feature';
  if (includesAny(text, ['quote', 'excerpt', 'evidence', 'sources', 'research', 'notes'])) return 'evidence / citation';
  if (includesAny(text, ['closing', 'thank', 'contact', 'next steps', 'recommendation', 'commitment', 'cta', 'visit'])) return 'closing / action';
  return 'narrative content';
}

function zonesFor(profile, archetype, index) {
  const commonHeader = 'Header/meta: x=112 y=54 w=1696 h=32; keep subtle and never decorative.';
  if (archetype === 'title / cover') {
    return [
      'Title block: x=112 y=180 w=980 h=420, or academic inset x=170 y=190 w=1040 h=420.',
      'Context/descriptor: x=112 y=620 w=780 h=160; use one focused paragraph.',
      'Optional proof/metadata rail: x=1180 y=180 w=520 h=620; never use a generic chart unless the template is analytical.',
      'Footer: x=112 y=990 w=1696 h=32.',
    ];
  }
  if (archetype === 'metric dashboard') {
    return [
      commonHeader,
      'KPI strip: x=112 y=138 w=1696 h=154; 3-5 metrics maximum.',
      'Main evidence chart: x=112 y=340 w=1050 h=470.',
      'Interpretation/action rail: x=1200 y=340 w=608 h=470.',
    ];
  }
  if (archetype === 'chart / quantitative evidence') {
    return [
      commonHeader,
      'Takeaway block: x=112 y=170 w=650 h=220; one sentence plus one big number only if needed.',
      'Primary chart: x=800 y=170 w=1008 h=610; label axes/segments directly.',
      'Source/assumption strip: x=112 y=770 w=1696 h=112.',
    ];
  }
  if (archetype === 'timeline / sequence') {
    return [
      commonHeader,
      'Title/intent: x=112 y=160 w=680 h=190.',
      'Timeline canvas: x=112 y=390 w=1696 h=360; use lanes, milestones, or stage blocks.',
      'Decision gate notes: x=112 y=790 w=1696 h=120.',
    ];
  }
  if (archetype === 'map / spatial model') {
    return [
      commonHeader,
      'Map/spatial field: x=112 y=150 w=1060 h=700.',
      'Fact ledger: x=1220 y=150 w=588 h=700.',
      'Callouts attach to geographic or spatial anchors, not random labels.',
    ];
  }
  if (archetype === 'system / network diagram') {
    return [
      commonHeader,
      'System diagram: x=560 y=145 w=1248 h=700.',
      'Layer/legend rail: x=112 y=180 w=360 h=580.',
      'Controls/decision note: x=112 y=800 w=1696 h=100.',
    ];
  }
  if (archetype === 'learning interaction') {
    return [
      'Learning sidebar: x=112 y=96 w=320 h=888; path, progress, and teacher context.',
      'Main instruction title: x=536 y=144 w=1170 h=120.',
      'Practice/work area: x=536 y=320 w=1170 h=560.',
      'Answer/check state: inside work area; do not add business-style charts.',
    ];
  }
  if (archetype === 'image / proof feature') {
    return [
      commonHeader,
      'Primary image/proof field: x=112 y=140 w=1030 h=720.',
      'Annotation rail: x=1190 y=160 w=618 h=680.',
      'Caption/source: x=112 y=890 w=1696 h=58.',
    ];
  }
  if (archetype === 'matrix / decision model') {
    return [
      commonHeader,
      'Decision table/matrix: x=112 y=190 w=1100 h=590.',
      'Recommendation panel: x=1260 y=190 w=548 h=590.',
      'Criteria/source strip: x=112 y=820 w=1696 h=92.',
    ];
  }
  return [
    commonHeader,
    'Primary title/content block: x=112 y=170 w=760 h=610.',
    'Supporting visual/proof block: x=940 y=170 w=868 h=610.',
    'Footer/source/action strip: x=112 y=850 w=1696 h=96.',
  ];
}

function visualFor(template, profile, archetype, layout, index) {
  if (archetype === 'metric dashboard') return 'Use metric strip plus one named operating/dashboard visual; every metric needs a label and interpretation.';
  if (archetype === 'chart / quantitative evidence') return 'Use one primary chart type from this template grammar, with direct labels and a takeaway. Never add decorative mini charts.';
  if (archetype === 'timeline / sequence') return 'Use a real timeline, Gantt lane, learning path, or roadmap with stage labels and sequencing direction.';
  if (archetype === 'map / spatial model') return 'Use a spatial field, map, venue, region, or presence model with anchored callouts.';
  if (archetype === 'system / network diagram') return 'Use a system diagram with nodes, layers, arrows, and controls; labels must match the deck scenario.';
  if (archetype === 'matrix / decision model') return 'Use a table, scorecard, risk grid, SWOT board, option matrix, or decision request panel.';
  if (archetype === 'learning interaction') return 'Use a workbook/task structure: prompt, student work area, choices/check, answer reveal, or teacher note.';
  if (archetype === 'image / proof feature') return 'Use image-first proof or placeholder composition with annotation/caption rail.';
  if (archetype === 'title / cover') return 'Use a distinctive title composition for this template; no generic chart card on the cover.';
  return 'Use content hierarchy, proof cards, quote/evidence panels, or narrative blocks that match the scenario.';
}

function bannedFor(archetype) {
  const shared = ['repeat the exact previous slide skeleton'];
  if (archetype.includes('chart') || archetype.includes('metric')) {
    return [...shared, 'use unlabelled bars or decorative fake trend lines', 'show more than one primary chart unless the layout is explicitly a dashboard'];
  }
  if (archetype.includes('learning')) {
    return [...shared, 'use business KPI cards', 'use charts unless the exercise is about data', 'hide the learning path'];
  }
  if (archetype.includes('map')) {
    return [...shared, 'use a generic blob map for non-geographic content', 'label callouts without anchors'];
  }
  if (archetype.includes('system')) {
    return [...shared, 'use YDeck-internal labels like HTML to PPTX or deck artifact', 'use a quadrant chart instead of a topology'];
  }
  return [...shared, 'use generic cards as filler', 'add a chart only for decoration'];
}

function normalizePalette(p) {
  return {
    background: p.background || '#F8F5EF',
    text: p.text || '#111827',
    accent: p.accent || '#0F766E',
    secondary: p.secondary || '#B45309',
    porcelain: p.porcelain || p.background || '#FFFFFF',
    fog: p.fog || '#E8EDF2',
  };
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

main();
