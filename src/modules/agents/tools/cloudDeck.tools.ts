import { z } from 'zod';
import {
  DeckJobModel,
  DeckProjectModel,
  InstalledPackModel,
  PluginPackModel,
  TemplatePackModel,
  WorkspaceBrandingModel,
  WorkspacePreferenceModel,
} from '../../../models';
import { registerTool } from './registry';

const slideSchema = z.object({
  slideNumber: z.number().int().positive().optional(),
  slideType: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(240),
  subtitle: z.string().max(500).optional(),
  bullets: z.array(z.string().max(500)).max(8).optional(),
  body: z.string().max(2000).optional(),
  speakerNotes: z.string().max(2000).optional(),
  layoutId: z.string().max(120).optional(),
  visual: z.record(z.string(), z.unknown()).optional(),
  html: z.string().max(30_000).optional(),
  previewHtml: z.string().max(40_000).optional(),
  preview: z
    .object({
      type: z.literal('html').default('html'),
      slideNumber: z.number().int().positive().optional(),
      layoutId: z.string().max(120).optional(),
      designId: z.string().max(160).optional(),
      html: z.string().max(40_000),
    })
    .optional(),
});

const deckArtifactSchema = z.object({
  deckTitle: z.string().min(1).max(255),
  deckType: z.string().min(1).max(80).default('general'),
  designStyle: z.string().min(1).max(120).default('modern'),
  language: z.string().min(1).max(20).default('en'),
  summary: z.string().max(2000).optional(),
  slides: z.array(slideSchema).min(1).max(100),
});

const createDeckSchema = z.object({
  deck: deckArtifactSchema,
});

const updateDeckSchema = z.object({
  deck: deckArtifactSchema,
  changeSummary: z.string().max(2000).optional(),
});

const designDeckSchema = z.object({
  deck: deckArtifactSchema,
  targetScore: z.number().min(0).max(100).default(85),
  maxAttempts: z.number().int().min(1).max(4).default(3),
});

const designSlideSchema = z.object({
  deckTitle: z.string().min(1).max(255),
  deckType: z.string().min(1).max(80).default('general'),
  designStyle: z.string().min(1).max(120).default('modern'),
  language: z.string().min(1).max(20).default('en'),
  slideCount: z.number().int().min(1).max(100).default(1),
  slide: slideSchema,
  targetScore: z.number().min(0).max(100).default(85),
  maxAttempts: z.number().int().min(1).max(4).default(3),
});

export type CloudDeckArtifact = z.infer<typeof deckArtifactSchema>;
export type CloudDeckSlide = CloudDeckArtifact['slides'][number];

export interface SlideDesignReport {
  slideNumber: number;
  title: string;
  layoutId: string;
  attempts: number;
  score: number;
  accepted: boolean;
  problems: string[];
  fixes: string[];
}

export function ensureCloudDeckHtml(
  deck: CloudDeckArtifact
): CloudDeckArtifact {
  return normalizeDeck(deck);
}

export function registerCloudDeckTools(): void {
  registerTool({
    name: 'inspect_project',
    description:
      'Read the current DeckProject title, description, template, and existing generated deck artifact for this job.',
    risk: 'read',
    execute: async (_args, ctx) => {
      if (!ctx.projectId)
        return {
          ok: false,
          error: 'NO_PROJECT',
          content: 'No projectId in tool context.',
        };
      const project = await DeckProjectModel.findById(ctx.projectId).lean();
      if (!project)
        return {
          ok: false,
          error: 'PROJECT_NOT_FOUND',
          content: 'Project not found.',
        };
      return {
        ok: true,
        content: JSON.stringify(
          {
            id: String(project._id),
            title: project.title,
            description: project.description,
            templateId: project.templateId,
            meta: project.meta ?? null,
          },
          null,
          2
        ),
      };
    },
  });

  registerTool({
    name: 'read_workspace_context',
    description:
      'Read workspace branding and preferences, including default language, deck type, style, slide count, colors, and product/company names.',
    risk: 'read',
    execute: async (_args, ctx) => {
      if (!ctx.workspaceId)
        return {
          ok: false,
          error: 'NO_WORKSPACE',
          content: 'No workspaceId in tool context.',
        };
      const [preferences, branding] = await Promise.all([
        WorkspacePreferenceModel.findOne({
          workspaceId: ctx.workspaceId,
        }).lean(),
        WorkspaceBrandingModel.findOne({ workspaceId: ctx.workspaceId }).lean(),
      ]);
      return {
        ok: true,
        content: JSON.stringify(
          { preferences: preferences ?? null, branding: branding ?? null },
          null,
          2
        ),
      };
    },
  });

  registerTool({
    name: 'list_packs',
    description:
      'List installed template/plugin packs for the workspace and the project-selected template. Use this before choosing style hints.',
    risk: 'read',
    execute: async (_args, ctx) => {
      if (!ctx.workspaceId)
        return {
          ok: false,
          error: 'NO_WORKSPACE',
          content: 'No workspaceId in tool context.',
        };
      const [installed, templates, plugins] = await Promise.all([
        InstalledPackModel.find({
          workspaceId: ctx.workspaceId,
          enabled: true,
        }).lean(),
        TemplatePackModel.find()
          .select('slug name description version manifest')
          .limit(50)
          .lean(),
        PluginPackModel.find()
          .select('slug name description version manifest')
          .limit(50)
          .lean(),
      ]);
      return {
        ok: true,
        content: JSON.stringify({ installed, templates, plugins }, null, 2),
      };
    },
  });

  registerTool({
    name: 'design_deck',
    description:
      'Design the final deck visually. Takes structured slide content, selects controlled YDeck layouts/theme, generates HTML/CSS, runs deterministic design QA/repair loops, persists the deck artifact, and streams slide.preview events. Prefer this over raw create_deck when visual quality matters.',
    risk: 'write',
    schema: designDeckSchema,
    execute: async (args, ctx) => {
      const designed = designCloudDeckArtifact(args.deck, {
        targetScore: args.targetScore,
        maxAttempts: args.maxAttempts,
        forceDesign: true,
      });
      const saved = await saveCloudDeckArtifact(
        ctx,
        designed.deck,
        'design_deck',
        cloudDesignSummary(designed.report)
      );
      return {
        ...saved,
        content: `${saved.content}\nDesign QA: ${cloudDesignSummary(
          designed.report
        )}`,
        data: {
          ...(isRecord(saved.data) ? saved.data : {}),
          designReport: designed.report,
        },
      };
    },
  });

  registerTool({
    name: 'design_slide',
    description:
      'Design one slide as HTML/CSS using the YDeck controlled layout/theme system and deterministic QA loop. Use for targeted repairs or previews; use design_deck to persist a full deck.',
    risk: 'read',
    schema: designSlideSchema,
    execute: async (args) => {
      const deck: CloudDeckArtifact = {
        deckTitle: args.deckTitle,
        deckType: args.deckType,
        designStyle: args.designStyle,
        language: args.language,
        slides: [args.slide],
      };
      const designed = designCloudDeckArtifact(deck, {
        targetScore: args.targetScore,
        maxAttempts: args.maxAttempts,
        forceDesign: true,
        slideCount: args.slideCount,
      });
      return {
        ok: true,
        content: `Designed slide ${
          designed.deck.slides[0]?.slideNumber ?? 1
        }. ${cloudDesignSummary(designed.report)}`,
        data: {
          slide: designed.deck.slides[0],
          designReport: designed.report[0],
        },
      };
    },
  });

  registerTool({
    name: 'create_deck',
    description:
      'Persist a newly generated YDeck JSON artifact for the current job. Arguments: { deck: { deckTitle, deckType, designStyle, language, summary, slides[] } }.',
    risk: 'write',
    schema: createDeckSchema,
    execute: async (args, ctx) => {
      const deck = normalizeDeck(args.deck);
      const saved = await saveCloudDeckArtifact(ctx, deck, 'create_deck');
      return saved;
    },
  });

  registerTool({
    name: 'update_deck',
    description:
      'Persist a refined YDeck JSON artifact for the current job. Arguments: { deck: {...}, changeSummary?: string }.',
    risk: 'write',
    schema: updateDeckSchema,
    execute: async (args, ctx) => {
      const deck = normalizeDeck(args.deck);
      const saved = await saveCloudDeckArtifact(
        ctx,
        deck,
        'update_deck',
        args.changeSummary
      );
      return saved;
    },
  });
}

export async function saveCloudDeckArtifact(
  ctx: {
    projectId?: string;
    jobId?: string;
    publish?: (event: { channel: string; payload: unknown }) => void;
  },
  deck: CloudDeckArtifact,
  source: string,
  changeSummary?: string
) {
  if (!ctx.projectId || !ctx.jobId) {
    return {
      ok: false,
      error: 'MISSING_CONTEXT',
      content: 'projectId and jobId are required.',
    };
  }
  const existingProject = await DeckProjectModel.findById(ctx.projectId)
    .select('meta')
    .lean();
  const existingMeta = isRecord(existingProject?.meta)
    ? existingProject.meta
    : {};
  const previousArtifact = isRecord(existingMeta.deckArtifact)
    ? existingMeta.deckArtifact
    : null;
  const previousVersion = isRecord(previousArtifact?.version)
    ? previousArtifact.version
    : null;
  const versionNumber = Number(previousVersion?.versionNumber ?? 0) + 1;
  const version = {
    versionId: `v${versionNumber}`,
    versionNumber,
    parentVersionId:
      typeof previousVersion?.versionId === 'string'
        ? previousVersion.versionId
        : null,
    reason: changeSummary || source,
    createdAt: new Date().toISOString(),
    jobId: ctx.jobId,
  };
  const artifact = {
    ...deck,
    generatedAt: new Date().toISOString(),
    source,
    changeSummary,
    version,
  };
  await DeckProjectModel.findByIdAndUpdate(ctx.projectId, {
    $set: {
      title: deck.deckTitle,
      meta: {
        ...existingMeta,
        deckArtifact: artifact,
        lastJobId: ctx.jobId,
        updatedBy: source,
      },
    },
  });
  await DeckJobModel.findByIdAndUpdate(ctx.jobId, {
    $set: {
      resultMeta: {
        deckArtifact: artifact,
        slideCount: deck.slides.length,
        source,
        changeSummary,
      },
    },
  });
  ctx.publish?.({
    channel: 'deck.version',
    payload: version,
  });
  for (const slide of artifact.slides) {
    ctx.publish?.({
      channel: 'slide.preview',
      payload: slidePreviewPayload(deck, slide),
    });
  }
  const qa = designQaPayload(deck, source);
  if (qa) {
    ctx.publish?.({
      channel: 'deck.qa',
      payload: qa,
    });
  }
  ctx.publish?.({
    channel: 'deck.artifact',
    payload: {
      slideCount: deck.slides.length,
      deckTitle: deck.deckTitle,
      deckArtifact: artifact,
    },
  });
  return {
    ok: true,
    content: `Saved deck artifact with ${deck.slides.length} slides.`,
    data: { slideCount: deck.slides.length, deckTitle: deck.deckTitle },
  };
}

function normalizeDeck(
  deck: CloudDeckArtifact,
  opts: { forceDesign?: boolean } = {}
): CloudDeckArtifact {
  return {
    ...deck,
    slides: deck.slides.map((slide, index) => {
      const slideNumber = slide.slideNumber ?? index + 1;
      const html = normalizeSlideHtml(deck, slide, index, opts);
      const previewHtml = normalizeSlidePreviewHtml(deck, slide, index, html);
      return {
        ...slide,
        slideNumber,
        layoutId: slide.layoutId ?? 'html_designed',
        html,
        previewHtml,
        preview: {
          type: 'html',
          slideNumber,
          layoutId: slide.layoutId ?? 'html_designed',
          designId:
            slide.preview?.designId ??
            `ydeck.cloud:${escapeAttr(deck.designStyle || 'modern')}`,
          html: previewHtml,
        },
      };
    }),
  };
}

function normalizeSlideHtml(
  deck: CloudDeckArtifact,
  slide: CloudDeckSlide,
  index: number,
  opts: { forceDesign?: boolean } = {}
): string {
  const existing =
    slideSectionFromHtml(slide.html) ??
    slideSectionFromHtml(slide.previewHtml) ??
    slideSectionFromHtml(slide.preview?.html);
  if (existing && !opts.forceDesign) return sanitizeSlideHtml(existing);

  const slideNumber = slide.slideNumber ?? index + 1;
  const accent = pickAccent(deck.designStyle, slideNumber);
  const bullets = (slide.bullets ?? []).slice(0, 5);
  const kicker = escapeHtml(labelize(deck.deckType));
  const layoutId = slide.layoutId ?? selectSlideLayout(slide, index);
  const image = imageAssetFromSlide(slide);
  const content =
    image && ['title_hero', 'card_grid', 'solution_split'].includes(layoutId)
      ? renderImageSplit(deck, slide, bullets, image, accent)
      : layoutId === 'metric_focus'
      ? renderMetricFocus(slide, bullets, accent)
      : layoutId === 'timeline_process'
      ? renderTimeline(slide, bullets, accent)
      : layoutId === 'comparison_split'
      ? renderComparison(slide, bullets, accent)
      : layoutId === 'problem_cards'
      ? renderProblemCards(slide, bullets, accent)
      : layoutId === 'closing_cta'
      ? renderClosing(slide, bullets, accent)
      : index === 0 || layoutId === 'title_hero'
      ? renderTitleHero(slide, bullets, accent)
      : renderCardGrid(slide, bullets, accent);

  return `<section class="ydeck-slide ydeck-${escapeAttr(
    deck.designStyle
  )}" style="position:relative;width:1920px;height:1080px;box-sizing:border-box;overflow:hidden;background:#f8fafc;color:#111827;font-family:Inter,Arial,sans-serif;">
  <div class="topbar"><div class="kicker">${kicker}</div><div class="pill">${escapeHtml(
    labelize(layoutId)
  )}</div></div>
  ${content}
  <footer class="footer"><span>${escapeHtml(
    deck.deckTitle
  )}</span><span>${slideNumber} / ${deck.slides.length}</span></footer>
  <style>
    .ydeck-slide *{box-sizing:border-box}
    .topbar{position:absolute;left:84px;right:84px;top:58px;z-index:5;display:flex;align-items:center;justify-content:space-between}
    .kicker{font-size:24px;line-height:1;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:0}
    .pill{font-size:22px;line-height:1;color:#334155;border:1px solid rgba(15,23,42,.16);border-radius:999px;padding:12px 22px;background:rgba(255,255,255,.72)}
    .footer{position:absolute;left:84px;right:84px;bottom:52px;z-index:5;display:flex;align-items:center;justify-content:space-between;color:#64748b;font-size:20px}
    .title{font-size:72px;line-height:1.02;margin:0;font-weight:850;letter-spacing:0;color:#0f172a}
    .subtitle{font-size:34px;line-height:1.28;margin:28px 0 0;color:#475569;max-width:980px}
    .small{font-size:24px;line-height:1.32;color:#475569}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 24px 70px rgba(15,23,42,.10)}
    .icon{width:42px;height:42px;color:${accent};stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
  </style>
</section>`;
}

function renderTitleHero(
  slide: CloudDeckSlide,
  bullets: string[],
  accent: string
): string {
  return `<div style="position:absolute;inset:0;background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 58%,#e0f2fe 100%)"></div>
  <div style="position:absolute;right:-120px;top:120px;width:680px;height:680px;border-radius:50%;background:${accent}18"></div>
  <main style="position:relative;z-index:2;padding:190px 110px 120px;max-width:1320px">
    ${iconSvg('spark', accent)}
    <h1 class="title" style="font-size:86px;margin-top:36px">${escapeHtml(
      slide.title
    )}</h1>
    ${
      slide.subtitle
        ? `<p class="subtitle">${escapeHtml(slide.subtitle)}</p>`
        : ''
    }
    ${
      bullets.length
        ? `<div style="display:flex;gap:18px;margin-top:46px;flex-wrap:wrap">${bullets
            .slice(0, 3)
            .map(
              (b) =>
                `<div class="card small" style="padding:20px 24px;max-width:390px">${escapeHtml(
                  b
                )}</div>`
            )
            .join('')}</div>`
        : ''
    }
  </main>`;
}

function renderImageSplit(
  deck: CloudDeckArtifact,
  slide: CloudDeckSlide,
  bullets: string[],
  image: Record<string, unknown>,
  accent: string
): string {
  const src = escapeAttrValue(String(image.storedUrl ?? ''));
  const attribution =
    typeof image.attributionText === 'string' ? image.attributionText : '';
  return `<main style="position:absolute;inset:132px 84px 110px;display:grid;grid-template-columns:0.95fr 1.05fr;gap:54px;align-items:stretch">
    <section style="padding:54px 0 40px">
      ${iconSvg('image', accent)}
      <h1 class="title" style="margin-top:34px">${escapeHtml(slide.title)}</h1>
      ${
        slide.subtitle
          ? `<p class="subtitle">${escapeHtml(slide.subtitle)}</p>`
          : ''
      }
      ${
        bullets.length
          ? `<div style="display:grid;gap:16px;margin-top:38px">${bullets
              .slice(0, 3)
              .map(
                (b) =>
                  `<div class="small" style="display:flex;gap:14px;align-items:flex-start"><span style="width:12px;height:12px;border-radius:50%;background:${accent};margin-top:9px;flex:0 0 auto"></span><span>${escapeHtml(
                    b
                  )}</span></div>`
              )
              .join('')}</div>`
          : ''
      }
    </section>
    <figure class="card" style="position:relative;margin:0;overflow:hidden;border:0">
      <img src="${src}" alt="${escapeAttrValue(
    slide.title
  )}" style="width:100%;height:100%;object-fit:cover;display:block">
      <figcaption style="position:absolute;left:18px;bottom:16px;right:18px;font-size:14px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.65)">${escapeHtml(
        attribution
      )}</figcaption>
    </figure>
  </main>`;
}

function renderMetricFocus(
  slide: CloudDeckSlide,
  bullets: string[],
  accent: string
): string {
  const metrics = metricItems(slide, bullets);
  const bars = metrics
    .map(
      (m, i) =>
        `<div style="display:flex;align-items:center;gap:18px"><div class="small" style="width:210px;font-weight:750;color:#0f172a">${escapeHtml(
          m.label
        )}</div><div style="height:30px;flex:1;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:${
          m.value
        }%;background:${
          i % 2 ? '#06b6d4' : accent
        };border-radius:999px"></div></div><div class="small" style="width:70px;text-align:right;font-weight:800">${
          m.value
        }%</div></div>`
    )
    .join('');
  return `<main style="position:absolute;inset:140px 94px 110px;display:grid;grid-template-columns:.82fr 1.18fr;gap:58px;align-items:center">
    <section>
      ${iconSvg('chart', accent)}
      <h1 class="title" style="margin-top:34px">${escapeHtml(slide.title)}</h1>
      ${
        slide.subtitle
          ? `<p class="subtitle">${escapeHtml(slide.subtitle)}</p>`
          : ''
      }
    </section>
    <section class="card" style="padding:46px 50px">
      <div style="font-size:28px;font-weight:850;margin-bottom:34px;color:#0f172a">Key Signals</div>
      <div style="display:grid;gap:28px">${bars}</div>
    </section>
  </main>`;
}

function renderTimeline(
  slide: CloudDeckSlide,
  bullets: string[],
  accent: string
): string {
  const items = (
    bullets.length ? bullets : ['Discover', 'Design', 'Review', 'Launch']
  ).slice(0, 5);
  return `<main style="position:absolute;inset:145px 92px 112px">
    <h1 class="title" style="max-width:1180px">${escapeHtml(slide.title)}</h1>
    ${
      slide.subtitle
        ? `<p class="subtitle">${escapeHtml(slide.subtitle)}</p>`
        : ''
    }
    <div style="position:absolute;left:40px;right:40px;bottom:160px;height:6px;background:#dbeafe;border-radius:999px"></div>
    <div style="display:grid;grid-template-columns:repeat(${
      items.length
    },1fr);gap:24px;margin-top:132px">
      ${items
        .map(
          (item, i) =>
            `<div class="card" style="padding:34px 28px;min-height:220px;position:relative"><div style="position:absolute;top:-68px;left:28px;width:58px;height:58px;border-radius:50%;background:${accent};color:#fff;display:grid;place-items:center;font-size:24px;font-weight:850">${
              i + 1
            }</div><div style="font-size:28px;font-weight:850;color:#0f172a;margin-bottom:18px">${escapeHtml(
              stepLabel(i)
            )}</div><div class="small">${escapeHtml(item)}</div></div>`
        )
        .join('')}
    </div>
  </main>`;
}

function renderComparison(
  slide: CloudDeckSlide,
  bullets: string[],
  accent: string
): string {
  const left = bullets.slice(0, Math.ceil(bullets.length / 2) || 2);
  const right = bullets.slice(left.length);
  return `<main style="position:absolute;inset:145px 100px 112px">
    <h1 class="title" style="max-width:1180px">${escapeHtml(slide.title)}</h1>
    ${
      slide.subtitle
        ? `<p class="subtitle">${escapeHtml(slide.subtitle)}</p>`
        : ''
    }
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:58px">
      ${comparisonColumn('Before', left, '#64748b')}
      ${comparisonColumn('After', right.length ? right : left, accent)}
    </div>
  </main>`;
}

function renderProblemCards(
  slide: CloudDeckSlide,
  bullets: string[],
  accent: string
): string {
  const items = (
    bullets.length ? bullets : [slide.subtitle ?? slide.title]
  ).slice(0, 4);
  return `<main style="position:absolute;inset:145px 96px 112px">
    <h1 class="title" style="max-width:1140px">${escapeHtml(slide.title)}</h1>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:62px">
      ${items
        .map(
          (item, i) =>
            `<article class="card" style="padding:34px 28px;min-height:330px;border-top:8px solid ${
              i % 2 ? '#06b6d4' : accent
            }">${iconSvg(
              i % 2 ? 'bolt' : 'target',
              i % 2 ? '#06b6d4' : accent
            )}<div class="small" style="font-size:28px;font-weight:750;color:#0f172a;margin-top:34px">${escapeHtml(
              item
            )}</div></article>`
        )
        .join('')}
    </div>
  </main>`;
}

function renderClosing(
  slide: CloudDeckSlide,
  bullets: string[],
  accent: string
): string {
  return `<div style="position:absolute;inset:0;background:#0f172a"></div>
  <main style="position:absolute;inset:150px 120px 120px;color:#fff;display:grid;place-items:center;text-align:center">
    <section>${iconSvg(
      'spark',
      accent
    )}<h1 style="font-size:92px;line-height:1.02;margin:38px auto 30px;font-weight:850;max-width:1240px">${escapeHtml(
    slide.title
  )}</h1>
    ${
      slide.subtitle
        ? `<p style="font-size:38px;line-height:1.25;color:#cbd5e1;max-width:980px;margin:0 auto">${escapeHtml(
            slide.subtitle
          )}</p>`
        : ''
    }
    ${
      bullets[0]
        ? `<div style="display:inline-block;margin-top:48px;background:${accent};color:#fff;font-size:30px;font-weight:800;padding:22px 34px;border-radius:8px">${escapeHtml(
            bullets[0]
          )}</div>`
        : ''
    }</section>
  </main>`;
}

function renderCardGrid(
  slide: CloudDeckSlide,
  bullets: string[],
  accent: string
): string {
  const items = (
    bullets.length ? bullets : [slide.subtitle ?? slide.title]
  ).slice(0, 6);
  return `<main style="position:absolute;inset:145px 94px 112px;display:grid;grid-template-columns:.9fr 1.1fr;gap:58px;align-items:center">
    <section>${iconSvg(
      'target',
      accent
    )}<h1 class="title" style="margin-top:34px">${escapeHtml(
    slide.title
  )}</h1>${
    slide.subtitle
      ? `<p class="subtitle">${escapeHtml(slide.subtitle)}</p>`
      : ''
  }</section>
    <section style="display:grid;grid-template-columns:1fr 1fr;gap:22px">
      ${items
        .map(
          (item, i) =>
            `<div class="card small" style="padding:28px 26px;min-height:132px;border-left:7px solid ${
              i % 2 ? '#06b6d4' : accent
            };font-weight:700;color:#0f172a">${escapeHtml(item)}</div>`
        )
        .join('')}
    </section>
  </main>`;
}

function normalizeSlidePreviewHtml(
  deck: CloudDeckArtifact,
  slide: CloudDeckArtifact['slides'][number],
  index: number,
  sectionHtml: string
): string {
  const existing = slide.preview?.html ?? slide.previewHtml;
  if (existing?.trim()) {
    const clean = sanitizeSlideHtml(existing);
    if (/<!doctype html|<html[\s>]/i.test(clean)) return clean;
    return slidePreviewDocument(deck, slide, index, clean);
  }
  return slidePreviewDocument(deck, slide, index, sectionHtml);
}

function slidePreviewPayload(
  deck: CloudDeckArtifact,
  slide: CloudDeckArtifact['slides'][number]
) {
  return {
    slideNumber: slide.slideNumber,
    slideTitle: slide.title,
    layoutId: slide.layoutId ?? 'html_designed',
    designId:
      slide.preview?.designId ??
      `ydeck.cloud:${escapeAttr(deck.designStyle || 'modern')}`,
    source: 'llm_html',
    status: 'rendered',
    html: slide.preview?.html ?? slide.previewHtml ?? slide.html,
  };
}

function designQaPayload(deck: CloudDeckArtifact, source: string) {
  const reports = deck.slides
    .map((slide) => {
      const qa =
        isRecord(slide.visual) && isRecord(slide.visual.designQa)
          ? slide.visual.designQa
          : null;
      if (!qa) return null;
      const problems = Array.isArray(qa.problems)
        ? qa.problems.map((p) => String(p))
        : [];
      const fixes = Array.isArray(qa.fixes)
        ? qa.fixes.map((f) => String(f))
        : [];
      const score =
        typeof qa.previousScore === 'number' && qa.previousScore > 0
          ? qa.previousScore
          : undefined;
      return {
        slideNumber: slide.slideNumber,
        slideTitle: slide.title,
        score,
        repaired: Number(qa.repairedAtAttempt ?? 0) > 0 || fixes.length > 0,
        problems,
        fixes,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!reports.length && source !== 'design_deck') return null;
  const scored = reports.filter((item) => typeof item.score === 'number');
  const averageScore = scored.length
    ? Math.round(
        scored.reduce((sum, item) => sum + (item.score ?? 0), 0) / scored.length
      )
    : null;
  return {
    averageScore,
    acceptedSlides:
      reports.filter((item) => !item.problems.length).length ||
      deck.slides.length,
    repairedSlides: reports.filter((item) => item.repaired).length,
    slideCount: deck.slides.length,
    issues: reports.flatMap((item) =>
      item.problems.map((problem, index) => ({
        slideNumber: item.slideNumber,
        slideTitle: item.slideTitle,
        problem,
        fix: item.fixes[index] ?? item.fixes[0] ?? null,
      }))
    ),
    slides: reports,
  };
}

function slidePreviewDocument(
  deck: CloudDeckArtifact,
  slide: CloudDeckArtifact['slides'][number],
  index: number,
  sectionHtml: string
): string {
  const slideNumber = slide.slideNumber ?? index + 1;
  return `<!doctype html>
<html lang="${escapeAttr(deck.language || 'en')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1920,height=1080,initial-scale=1">
  <title>${escapeHtml(slide.title)}</title>
  <style>
    html,body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;background:#111827}
    body{font-family:Inter,Arial,sans-serif}
    .ydeck-slide{display:block}
  </style>
</head>
<body>${sectionHtml}</body>
</html>`;
}

export function wrapLlmDesignedSlide(
  deck: CloudDeckArtifact,
  slide: CloudDeckSlide,
  index: number
): CloudDeckSlide {
  const slideNumber = slide.slideNumber ?? index + 1;
  const section =
    slideSectionFromHtml(slide.html) ??
    slideSectionFromHtml(slide.previewHtml) ??
    slideSectionFromHtml(slide.preview?.html);
  if (!section) {
    throw new Error(`html_designer returned no html for slide ${slideNumber}`);
  }
  const html = sanitizeSlideHtml(section);
  const previewHtml = /<!doctype html|<html[\s>]/i.test(html)
    ? html
    : slidePreviewDocument(deck, slide, index, html);
  const layoutId = slide.layoutId ?? 'html_designed';
  return {
    ...slide,
    slideNumber,
    layoutId,
    html,
    previewHtml,
    preview: {
      type: 'html',
      slideNumber,
      layoutId,
      designId:
        slide.preview?.designId ??
        `ydeck.cloud:${escapeAttr(deck.designStyle || 'modern')}:llm`,
      html: previewHtml,
    },
  };
}

export function finalizeLlmDeck(deck: CloudDeckArtifact): CloudDeckArtifact {
  return {
    ...deck,
    slides: deck.slides.map((slide, index) =>
      wrapLlmDesignedSlide(deck, slide, index)
    ),
  };
}

export function designCloudDeckArtifact(
  deck: CloudDeckArtifact,
  opts: {
    targetScore: number;
    maxAttempts: number;
    forceDesign?: boolean;
    slideCount?: number;
  }
): { deck: CloudDeckArtifact; report: SlideDesignReport[] } {
  const report: SlideDesignReport[] = [];
  let working: CloudDeckArtifact = {
    ...deck,
    slides: deck.slides.map((slide, index) => ({
      ...slide,
      slideNumber: slide.slideNumber ?? index + 1,
      layoutId: slide.layoutId ?? selectSlideLayout(slide, index),
    })),
  };

  working = {
    ...working,
    slides: working.slides.map((slide, index) => {
      let current: CloudDeckSlide = repairSlideContent(
        slide,
        { problems: [], fixes: [], score: 0 },
        0
      );
      let best: CloudDeckSlide = current;
      let bestQa = scoreSlideDesign(
        working,
        best,
        index,
        opts.slideCount ?? working.slides.length
      );
      let attempts = 0;
      const maxAttempts = Math.max(1, Math.min(opts.maxAttempts, 4));

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        attempts = attempt;
        const html = normalizeSlideHtml(working, current, index, {
          forceDesign: true,
        });
        const previewHtml = normalizeSlidePreviewHtml(
          working,
          current,
          index,
          html
        );
        current = {
          ...current,
          html,
          previewHtml,
          preview: {
            type: 'html',
            slideNumber: current.slideNumber ?? index + 1,
            layoutId: current.layoutId ?? 'html_designed',
            designId: `ydeck.cloud:${escapeAttr(
              working.designStyle || 'modern'
            )}:${escapeAttr(current.layoutId ?? 'html_designed')}`,
            html: previewHtml,
          },
        };
        const qa = scoreSlideDesign(
          working,
          current,
          index,
          opts.slideCount ?? working.slides.length
        );
        if (qa.score >= bestQa.score) {
          best = current;
          bestQa = qa;
        }
        if (qa.score >= opts.targetScore && qa.problems.length === 0) break;
        current = repairSlideContent(current, qa, attempt);
      }

      report.push({
        slideNumber: best.slideNumber ?? index + 1,
        title: best.title,
        layoutId: best.layoutId ?? 'html_designed',
        attempts,
        score: bestQa.score,
        accepted:
          bestQa.score >= opts.targetScore && bestQa.problems.length === 0,
        problems: bestQa.problems,
        fixes: bestQa.fixes,
      });
      return best;
    }),
  };

  return {
    deck: normalizeDeck(working, { forceDesign: opts.forceDesign }),
    report,
  };
}

function selectSlideLayout(slide: CloudDeckSlide, index: number): string {
  const type = `${slide.slideType ?? ''} ${slide.title} ${(
    slide.bullets ?? []
  ).join(' ')}`.toLowerCase();
  if (index === 0 || /\b(title|cover|intro)\b/.test(type)) return 'title_hero';
  if (/\b(metric|traction|revenue|growth|kpi|number|stat)\b/.test(type))
    return 'metric_focus';
  if (/\b(compare|versus|before|after|problem|solution)\b/.test(type))
    return 'comparison_split';
  if (/\b(timeline|roadmap|process|steps|workflow|journey)\b/.test(type))
    return 'timeline_process';
  if (/\b(quote|vision|mission|statement)\b/.test(type))
    return 'quote_statement';
  return 'card_grid';
}

function iconSvg(
  name: 'spark' | 'chart' | 'image' | 'bolt' | 'target',
  color: string
): string {
  const paths: Record<typeof name, string> = {
    spark:
      '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"/><path d="M19 15l.8 2.7L22 18.5l-2.2.8L19 22l-.8-2.7-2.2-.8 2.2-.8L19 15z"/>',
    chart:
      '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16V9"/><path d="M12 16V6"/><path d="M16 16v-4"/>',
    image:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="1.5"/><path d="M21 16l-5-5-5 5-2-2-4 4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
    target:
      '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M22 12h-3"/><path d="M12 22v-3"/><path d="M2 12h3"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" style="color:${color}" aria-hidden="true">${paths[name]}</svg>`;
}

function imageAssetFromSlide(
  slide: CloudDeckSlide
): Record<string, unknown> | null {
  if (!isRecord(slide.visual)) return null;
  const asset = slide.visual.imageAsset;
  return isRecord(asset) &&
    typeof asset.storedUrl === 'string' &&
    asset.storedUrl.startsWith('data:image/')
    ? asset
    : null;
}

function metricItems(
  slide: CloudDeckSlide,
  bullets: string[]
): Array<{ label: string; value: number }> {
  const source = (
    bullets.length ? bullets : [slide.subtitle, slide.body, slide.title]
  )
    .filter(Boolean)
    .map(String);
  const values = source.slice(0, 4).map((item, index) => {
    const explicit = Number(item.match(/\b(\d{1,3})\s*%/)?.[1]);
    return {
      label: compactText(
        item.replace(/\b\d{1,3}\s*%/g, '').trim() || `Signal ${index + 1}`,
        42
      ),
      value: Number.isFinite(explicit)
        ? Math.max(12, Math.min(96, explicit))
        : [86, 72, 64, 52][index] ?? 48,
    };
  });
  return values.length
    ? values
    : [
        { label: 'Momentum', value: 82 },
        { label: 'Adoption', value: 68 },
        { label: 'Readiness', value: 58 },
      ];
}

function comparisonColumn(
  title: string,
  items: string[],
  color: string
): string {
  return `<section class="card" style="padding:38px 38px;min-height:390px;border-top:8px solid ${color}">
    <div style="font-size:34px;font-weight:850;color:#0f172a;margin-bottom:28px">${escapeHtml(
      title
    )}</div>
    <div style="display:grid;gap:18px">${items
      .slice(0, 4)
      .map(
        (item) =>
          `<div class="small" style="display:flex;gap:14px"><span style="width:10px;height:10px;border-radius:50%;background:${color};margin-top:9px;flex:0 0 auto"></span><span>${escapeHtml(
            item
          )}</span></div>`
      )
      .join('')}</div>
  </section>`;
}

function stepLabel(index: number): string {
  return (
    ['Start', 'Shift', 'Scale', 'Proof', 'Next'][index] ?? `Step ${index + 1}`
  );
}

function scoreSlideDesign(
  deck: CloudDeckArtifact,
  slide: CloudDeckSlide,
  index: number,
  slideCount: number
): { score: number; problems: string[]; fixes: string[] } {
  const problems: string[] = [];
  const fixes: string[] = [];
  const html = `${slide.html ?? ''} ${slide.previewHtml ?? ''}`;
  const bullets = slide.bullets ?? [];
  const chars = [slide.title, slide.subtitle, slide.body, ...bullets]
    .filter(Boolean)
    .join(' ').length;
  const titleLength = slide.title.length;
  const maxBullet = Math.max(0, ...bullets.map((b) => b.length));
  let score = 100;

  if (!/<section\b/i.test(slide.html ?? '')) {
    score -= 30;
    problems.push('Missing slide <section> HTML.');
    fixes.push('Regenerate a self-contained 1920x1080 slide section.');
  }
  if (!/width:\s*1920px/i.test(html) || !/height:\s*1080px/i.test(html)) {
    score -= 18;
    problems.push('Slide does not declare the required 1920x1080 canvas.');
    fixes.push('Use a fixed 1920px by 1080px slide canvas.');
  }
  const htmlWithoutStoredImages = html.replace(
    /data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/gi,
    ''
  );
  if (
    /<script|<iframe|javascript:|https?:\/\//i.test(htmlWithoutStoredImages)
  ) {
    score -= 25;
    problems.push('Unsafe or remote HTML was detected.');
    fixes.push(
      'Remove scripts, iframes, JavaScript URLs, and remote resources.'
    );
  }
  if (titleLength > 96) {
    score -= 10;
    problems.push('Title is too long for a presentation slide.');
    fixes.push('Shorten title to under 96 characters.');
  }
  if (bullets.length > 6) {
    score -= 10;
    problems.push('Too many bullet/card text blocks.');
    fixes.push('Limit to six text blocks or fewer.');
  }
  if (maxBullet > 170) {
    score -= 10;
    problems.push('One or more cards contain too much text.');
    fixes.push('Reduce card text length.');
  }
  if (chars > 980) {
    score -= 14;
    problems.push('Slide is text-heavy and likely crowded.');
    fixes.push('Compress body and bullet copy.');
  }
  if (!/font-size:\s*(?:[3-9]\d|[1-9]\d{2,})px/i.test(html)) {
    score -= 8;
    problems.push('Large readable type was not detected.');
    fixes.push('Use title and body font sizes above 28px.');
  }
  if (!/border-radius|box-shadow|grid|flex/i.test(html)) {
    score -= 8;
    problems.push('Slide lacks structured visual layout primitives.');
    fixes.push('Use grid/flex, cards, spacing, and visual hierarchy.');
  }
  if (!slide.layoutId || slide.layoutId === 'html_designed') {
    score -= 4;
    problems.push('Layout selection is too generic.');
    fixes.push('Select a named YDeck layout.');
  }
  if (index === 0 && slide.layoutId !== 'title_hero') {
    score -= 3;
    fixes.push('Use title_hero for the opening slide.');
  }
  if (
    slideCount > 1 &&
    !html.includes(`${slide.slideNumber ?? index + 1} / ${slideCount}`)
  ) {
    score -= 3;
    fixes.push('Add slide number footer for deck context.');
  }
  if (!deck.designStyle) {
    score -= 2;
    fixes.push('Apply a deck design style.');
  }

  return { score: Math.max(0, Math.min(100, score)), problems, fixes };
}

function repairSlideContent(
  slide: CloudDeckSlide,
  qa: { problems: string[]; fixes: string[]; score: number },
  attempt: number
): CloudDeckSlide {
  const severe = qa.score < 75 || attempt >= 2;
  return {
    ...slide,
    title: compactText(slide.title, severe ? 76 : 96),
    subtitle: slide.subtitle
      ? compactText(slide.subtitle, severe ? 130 : 180)
      : slide.subtitle,
    body: slide.body ? compactText(slide.body, severe ? 220 : 320) : slide.body,
    bullets: compactBullets(slide.bullets ?? [], severe ? 2 : 1),
    layoutId:
      slide.layoutId && slide.layoutId !== 'html_designed'
        ? slide.layoutId
        : selectSlideLayout(slide, (slide.slideNumber ?? 1) - 1),
    html: undefined,
    previewHtml: undefined,
    preview: undefined,
    visual: {
      ...(isRecord(slide.visual) ? slide.visual : {}),
      designQa: {
        previousScore: qa.score,
        problems: qa.problems,
        fixes: qa.fixes,
        repairedAtAttempt: attempt,
      },
    },
  };
}

export function cloudDesignSummary(report: SlideDesignReport[]): string {
  if (!report.length) return 'no slides designed';
  const avg = Math.round(
    report.reduce((sum, item) => sum + item.score, 0) / report.length
  );
  const accepted = report.filter((item) => item.accepted).length;
  return `${accepted}/${report.length} slides accepted, average score ${avg}`;
}

function slideSectionFromHtml(value?: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const section = raw.match(/<section\b[\s\S]*<\/section>/i)?.[0];
  return section?.trim() || raw;
}

function sanitizeSlideHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[\s\S]*?>/gi, '')
    .replace(/<link\b[\s\S]*?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/https?:\/\/[^"')\s]+/gi, '');
}

function pickAccent(style: string, slideNumber: number): string {
  const palettes: Record<string, string[]> = {
    modern: ['#7c3aed', '#06b6d4', '#22c55e'],
    minimal_clean: ['#2563eb', '#14b8a6', '#111827'],
    corporate_blue: ['#1d4ed8', '#0f766e', '#f59e0b'],
    education_friendly: ['#f59e0b', '#10b981', '#6366f1'],
    government_formal: ['#1e3a8a', '#b45309', '#475569'],
  };
  const options = palettes[style] ?? palettes.modern;
  return options[(slideNumber - 1) % options.length];
}

function compactBullets(bullets: string[], attempt: number): string[] {
  const maxItems = attempt >= 2 ? 4 : 6;
  const maxChars = attempt >= 2 ? 118 : 165;
  return bullets
    .slice(0, maxItems)
    .map((bullet) => compactText(bullet, maxChars))
    .filter(Boolean);
}

function compactText(value: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const clipped = clean.slice(0, maxChars - 1);
  const boundary = Math.max(
    clipped.lastIndexOf('.'),
    clipped.lastIndexOf(';'),
    clipped.lastIndexOf(','),
    clipped.lastIndexOf(' ')
  );
  return `${clipped
    .slice(0, boundary > maxChars * 0.55 ? boundary : maxChars - 1)
    .trim()}...`;
}

function labelize(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, '_');
}

function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
