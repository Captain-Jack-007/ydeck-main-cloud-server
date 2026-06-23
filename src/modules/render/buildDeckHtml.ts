/**
 * Render a cloud deck artifact to a self-contained HTML document — one fixed
 * 1920x1080 `.ydeck-slide` section per slide. This HTML is the single layout
 * authority: the PPTX exporter measures it in a headless browser and emits
 * native PowerPoint objects from the measured geometry, so the download matches
 * what a browser would show (see htmlPptx.ts).
 *
 * The cloud slide model is intentionally small — title / subtitle / bullets /
 * body / layoutId — so there are just two layouts: a centered hero (title-ish
 * slides) and a standard content slide. Classes mirror what the extractor keys
 * off; keep them stable when adding layouts.
 */
import type { CloudDeckArtifact } from "../agents/tools/cloudDeck.tools";
import type { DeckTheme } from "./theme";

type Slide = CloudDeckArtifact["slides"][number];

function escapeHtml(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHeroSlide(slide: Slide, index: number): boolean {
  const hint = `${slide.layoutId ?? ""} ${slide.slideType ?? ""}`.toLowerCase();
  if (/title|cover|hero|closing|section|thanks|thank/.test(hint)) return true;
  // First slide with no real body content reads as a cover.
  const hasBody = (slide.bullets?.length ?? 0) > 0 || Boolean(slide.body?.trim());
  return index === 0 && !hasBody;
}

function bulletList(items: string[] | undefined): string {
  const list = (items ?? []).filter((b) => b.trim());
  if (!list.length) return "";
  return `<ul class="ydeck-bullets">${list
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join("")}</ul>`;
}

function paragraphs(body: string | undefined): string {
  const text = body?.trim();
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((p) => `<p class="ydeck-paragraph">${escapeHtml(p.trim())}</p>`)
    .join("");
}

function renderHero(slide: Slide): string {
  return `<div class="ydeck-accent-bar"></div>
<div class="ydeck-hero">
  <h1 class="ydeck-hero__title">${escapeHtml(slide.title)}</h1>
  ${slide.subtitle ? `<p class="ydeck-hero__subtitle">${escapeHtml(slide.subtitle)}</p>` : ""}
</div>`;
}

function renderContent(slide: Slide): string {
  const eyebrow = slide.slideType?.trim()
    ? `<div class="ydeck-eyebrow">${escapeHtml(slide.slideType.replace(/[_-]+/g, " "))}</div>`
    : "";
  const subtitle = slide.subtitle
    ? `<p class="ydeck-slide__subtitle">${escapeHtml(slide.subtitle)}</p>`
    : "";
  const body = `${subtitle}${paragraphs(slide.body)}${bulletList(slide.bullets)}`;
  return `<div class="ydeck-accent-bar"></div>
<div class="ydeck-slide__pad">
  ${eyebrow}<h2 class="ydeck-slide__title">${escapeHtml(slide.title)}</h2>
  <div class="ydeck-body">${body}</div>
</div>
<div class="ydeck-footer"><span>${escapeHtml(slide.title)}</span><span>${slide.slideNumber ?? ""}</span></div>`;
}

function baseStyles(): string {
  return `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #1a1a1a; }
.ydeck-viewer {
  display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 32px 0;
  font-family: var(--ydeck-font-body);
  color: var(--ydeck-text);
  -webkit-font-smoothing: antialiased;
}
.ydeck-slide {
  width: 1920px; height: 1080px; position: relative; overflow: hidden;
  background: var(--ydeck-bg); color: var(--ydeck-text);
  border-radius: 4px; font-size: 28px; line-height: 1.45;
}
.ydeck-slide__pad { position: absolute; inset: 120px 120px 128px; display: flex; flex-direction: column; }
.ydeck-body { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
.ydeck-slide__title {
  font-family: var(--ydeck-font-heading); font-weight: 700; font-size: 68px; line-height: 1.08;
  letter-spacing: -0.5px; color: var(--ydeck-text); margin: 0 0 36px 0; flex: 0 0 auto;
}
.ydeck-eyebrow {
  font-family: var(--ydeck-font-body); font-weight: 700; font-size: 22px; letter-spacing: 3px;
  text-transform: uppercase; color: var(--ydeck-accent); margin: 0 0 14px 0; flex: 0 0 auto;
}
.ydeck-slide__subtitle { font-size: 36px; color: var(--ydeck-text-muted); margin: 0 0 36px 0; }
.ydeck-paragraph { font-size: 30px; line-height: 1.5; margin: 0 0 24px 0; color: var(--ydeck-text); }
.ydeck-accent-bar { position: absolute; left: 120px; top: 72px; width: 72px; height: 8px; background: var(--ydeck-accent); border-radius: 4px; }
.ydeck-footer { position: absolute; left: 120px; right: 120px; bottom: 48px; display: flex; justify-content: space-between; align-items: center; color: var(--ydeck-text-muted); font-size: 22px; }
.ydeck-bullets { list-style: none; padding: 0; margin: 0; }
.ydeck-bullets li { position: relative; padding: 14px 0 14px 48px; font-size: 32px; line-height: 1.4; }
.ydeck-bullets li::before { content: ''; position: absolute; left: 0; top: 24px; width: 14px; height: 14px; border-radius: 4px; background: var(--ydeck-accent); }
.ydeck-hero { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 0 120px; }
.ydeck-hero__title { font-family: var(--ydeck-font-heading); font-size: 120px; font-weight: 800; margin: 0 0 24px; color: var(--ydeck-text); }
.ydeck-hero__subtitle { font-size: 44px; color: var(--ydeck-text-muted); margin: 0; }
`;
}

function cssVars(theme: DeckTheme): string {
  const c = theme.colors;
  return [
    `--ydeck-bg:${c.background}`,
    `--ydeck-surface:${c.surface}`,
    `--ydeck-primary:${c.primary}`,
    `--ydeck-accent:${c.accent}`,
    `--ydeck-text:${c.text}`,
    `--ydeck-text-muted:${c.textMuted}`,
    `--ydeck-divider:${c.divider}`,
    `--ydeck-font-heading:${theme.fonts.heading}, Arial, sans-serif`,
    `--ydeck-font-body:${theme.fonts.body}, Arial, sans-serif`,
  ].join(";");
}

export function buildDeckHtml(deck: CloudDeckArtifact, theme: DeckTheme): string {
  const sections = deck.slides
    .map((slide, i) => {
      // The cloud production agent designs each slide as a self-contained
      // <section class="ydeck-slide"> at 1920x1080. Measure that exact markup so
      // the export matches the on-screen preview; only fall back to the
      // structured template when no designed HTML is present.
      const s = slide as unknown as {
        html?: string;
        previewHtml?: string;
        preview?: { html?: string };
      };
      const designed = s.preview?.html ?? s.previewHtml ?? s.html;
      if (typeof designed === "string" && designed.includes("ydeck-slide")) {
        return designed;
      }
      const inner = isHeroSlide(slide, i) ? renderHero(slide) : renderContent(slide);
      return `<section class="ydeck-slide" data-slide-number="${slide.slideNumber ?? i + 1}">${inner}</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="${escapeHtml(deck.language || "en")}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(deck.deckTitle)}</title>
<style>${baseStyles()}</style>
</head>
<body>
<main class="ydeck-viewer" style="${cssVars(theme)}">
${sections}
</main>
</body>
</html>`;
}
