import { promises as fs } from 'node:fs';
import path from 'node:path';

import { logger } from '../../lib/logger';

export interface DesignTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  scenario?: string | null;
  exposure?: string | null;
  version?: string | null;
  compatibility?: unknown;
  capabilities?: unknown;
  quality?: unknown;
  typography?: unknown;
  layoutCount?: number | null;
  recommendedFlows?: unknown;
  bestFitDeckTypes?: string[] | null;
  preview?: unknown;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  previewPages?: DesignTemplatePreviewPage[];
}

export interface DesignTemplateContext extends DesignTemplateSummary {
  skillExcerpt: string;
  designExcerpt: string;
  checklistExcerpt: string;
  layoutsExcerpt: string;
  templateJson?: unknown;
}

export interface DesignTemplatePreviewPage {
  role?: string | null;
  title?: string | null;
  url: string;
}

export interface DesignTemplateVisibilityDiagnostic {
  template: DesignTemplateSummary;
  visible: boolean;
  reasons: string[];
}

export interface DesignTemplateDiagnostics {
  total: number;
  visibleCount: number;
  hiddenCount: number;
  visible: DesignTemplateSummary[];
  hidden: DesignTemplateVisibilityDiagnostic[];
}

const TEMPLATE_ROOT = path.resolve(process.cwd(), 'design-templates');
const MAX_SKILL_CHARS = 5200;
const MAX_DESIGN_CHARS = 6200;
const MAX_CHECKLIST_CHARS = 2600;
const MAX_LAYOUTS_CHARS = 3600;
const MAX_SELECTED = 2;
const CACHE_MS = 30_000;
const FRONTEND_EXCLUDED_TEMPLATE_IDS = new Set([
  // Magazine web-deck runtime with WebGL/scripts, not an export-safe PPT design.
  'guizang-ppt',
  // Authoring studio / engine bundle, not a single selectable PPT design.
  'html-ppt',
  // Landing-page sibling fixture; keep it on disk, but out of the PPT picker.
  'open-design-landing-deck',
]);

let cache: { at: number; items: DesignTemplateContext[] } | null = null;

export async function listDesignTemplates(): Promise<DesignTemplateSummary[]> {
  const items = await loadDesignTemplates();
  return items
    .filter(isFrontendDeckTemplate)
    .map(toDesignTemplateSummary);
}

export async function listDesignTemplateDiagnostics(): Promise<DesignTemplateDiagnostics> {
  const items = await loadDesignTemplates();
  const diagnostics = items.map((template) => ({
    template: toDesignTemplateSummary(template),
    ...frontendDeckTemplateVisibility(template),
  }));
  const visible = diagnostics
    .filter((item) => item.visible)
    .map((item) => item.template);
  const hidden = diagnostics.filter((item) => !item.visible);
  return {
    total: diagnostics.length,
    visibleCount: visible.length,
    hiddenCount: hidden.length,
    visible,
    hidden,
  };
}

export async function selectDesignTemplates(input: {
  templateId?: unknown;
  deckType?: unknown;
  designStyle?: unknown;
  prompt?: unknown;
}): Promise<DesignTemplateContext[]> {
  const templates = (await loadDesignTemplates()).filter(isFrontendDeckTemplate);
  if (!templates.length) return [];

  const requested = stringValue(input.templateId);
  if (requested) {
    const direct = templates.find(
      (template) =>
        template.id === requested ||
        template.name.toLowerCase() === requested.toLowerCase()
    );
    if (direct) return [direct];
  }

  const terms = new Set(
    [input.deckType, input.designStyle, input.prompt]
      .flatMap((value) => tokenize(value))
      .filter(Boolean)
  );
  const rawQuery = [input.deckType, input.designStyle, input.prompt]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  const scored = templates.map((template) => ({
    template,
    score: scoreTemplate(template, terms, rawQuery),
  }));
  scored.sort(
    (a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name)
  );

  const selected = scored.filter((item) => item.score > 0).slice(0, MAX_SELECTED);
  if (selected.length) return selected.map((item) => item.template);

  const fallback =
    templates.find((template) => template.id === 'ydeck-library-executive-strategy') ??
    templates.find((template) => template.category === 'ydeck-library') ??
    templates.find((template) => template.scenario === 'ydeck-library') ??
    templates[0];
  return fallback ? [fallback] : [];
}

export async function readDesignTemplatePreview(
  id: string,
  page = 'example'
): Promise<{ html: string; contentType: string } | null> {
  if (!safeSegment(id) || !safePreviewPage(page)) return null;

  const templates = await loadDesignTemplates();
  const template = templates.find((item) => item.id === id);
  if (!template || !isFrontendDeckTemplate(template)) return null;

  const file = await resolvePreviewFile(id, page);
  if (!file) return null;

  try {
    const html = await fs.readFile(file, 'utf8');
    return {
      html: await inlineLocalStyles(html, path.dirname(file)),
      contentType: 'text/html; charset=utf-8',
    };
  } catch (err) {
    logger.debug({ err, id, page }, 'design_template.preview_not_found');
    return null;
  }
}

export async function readDesignTemplateThumbnail(
  id: string
): Promise<{ body: Buffer | string; contentType: string } | null> {
  if (!safeSegment(id)) return null;

  const templates = await loadDesignTemplates();
  const template = templates.find((item) => item.id === id);
  if (!template || !isFrontendDeckTemplate(template)) return null;

  const asset = await resolveThumbnailFile(id);
  if (asset) {
    try {
      return {
        body: await fs.readFile(asset),
        contentType: thumbnailContentType(asset),
      };
    } catch (err) {
      logger.debug({ err, id }, 'design_template.thumbnail_asset_failed');
    }
  }

  return {
    body: generatedThumbnailSvg(template),
    contentType: 'image/svg+xml; charset=utf-8',
  };
}

async function loadDesignTemplates(): Promise<DesignTemplateContext[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.items;

  try {
    const entries = await fs.readdir(TEMPLATE_ROOT, { withFileTypes: true });
    const items = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => loadDesignTemplate(entry.name))
      )
    ).filter((item): item is DesignTemplateContext => Boolean(item));
    cache = { at: now, items };
    return items;
  } catch (err) {
    logger.warn({ err, root: TEMPLATE_ROOT }, 'design_templates.load_failed');
    cache = { at: now, items: [] };
    return [];
  }
}

async function loadDesignTemplate(slug: string): Promise<DesignTemplateContext | null> {
  const dir = path.join(TEMPLATE_ROOT, slug);
  try {
    const skill = await readText(path.join(dir, 'SKILL.md'), MAX_SKILL_CHARS);
    if (!skill) return null;
    const frontmatter = extractFrontmatter(skill);
    const parsed = parseSimpleFrontmatter(frontmatter);
    const [templateJson, design, checklist, layouts] = await Promise.all([
      readJson(path.join(dir, 'template.json')),
      readText(path.join(dir, 'DESIGN.md'), MAX_DESIGN_CHARS),
      readText(path.join(dir, 'references', 'checklist.md'), MAX_CHECKLIST_CHARS),
      readText(path.join(dir, 'references', 'layouts.md'), MAX_LAYOUTS_CHARS),
    ]);
    const metadata = templateMetadata(templateJson);
    const mode = metadata.mode ?? parsed.mode;
    if (mode && mode !== 'deck') return null;
    const previewPages = await templatePreviewPages(slug);
    return {
      id: slug,
      name: metadata.name ?? parsed.name ?? slug,
      description: metadata.description ?? parsed.description,
      category: metadata.category ?? parsed.category,
      scenario: metadata.scenario ?? parsed.scenario,
      exposure: metadata.exposure,
      version: metadata.version,
      compatibility: metadata.compatibility,
      capabilities: metadata.capabilities,
      quality: metadata.quality,
      typography: metadata.typography,
      layoutCount: metadata.layoutCount,
      recommendedFlows: metadata.recommendedFlows,
      bestFitDeckTypes: metadata.bestFitDeckTypes,
      preview: metadata.preview ?? parsed.preview,
      previewUrl: previewPages[0]?.url ?? null,
      thumbnailUrl: `/v1/design-templates/${slug}/thumbnail`,
      previewPages,
      skillExcerpt: skill,
      designExcerpt: design,
      checklistExcerpt: checklist,
      layoutsExcerpt: layouts,
      templateJson,
    };
  } catch (err) {
    logger.debug({ err, slug }, 'design_template.load_skipped');
    return null;
  }
}

function scoreTemplate(
  template: DesignTemplateContext,
  terms: Set<string>,
  rawQuery: string
): number {
  if (!terms.size)
    return template.id === 'ydeck-library-executive-strategy'
      ? 1
      : template.category === 'ydeck-library' ||
          template.scenario === 'ydeck-library'
        ? 0.75
        : 0;
  const haystack = [
    template.id,
    template.name,
    template.description,
    template.category,
    template.scenario,
    ...(template.bestFitDeckTypes ?? []),
    template.skillExcerpt.slice(0, 1600),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (template.id.toLowerCase() === term) score += 8;
    else if (template.name.toLowerCase() === term) score += 6;
    else if (haystack.includes(term)) score += 2;
  }
  const phraseHaystack = [
    template.id,
    template.name,
    template.scenario,
    template.description,
    ...(template.bestFitDeckTypes ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  for (const phrase of [template.scenario, ...(template.bestFitDeckTypes ?? [])]) {
    if (typeof phrase === 'string' && phrase && rawQuery.includes(phrase.toLowerCase())) {
      score += 5;
    }
  }
  if (rawQuery && phraseHaystack.includes(rawQuery)) score += 4;
  if (template.category === 'ydeck-library' || template.scenario === 'ydeck-library')
    score += 0.5;
  return score;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function readText(file: string, maxChars: number): Promise<string> {
  try {
    return (await fs.readFile(file, 'utf8')).slice(0, maxChars);
  } catch {
    return '';
  }
}

async function templatePreviewPages(slug: string): Promise<DesignTemplatePreviewPage[]> {
  const pages: DesignTemplatePreviewPage[] = [];
  if (await resolvePreviewFile(slug, 'example')) {
    pages.push({
      role: 'example',
      title: 'Example Deck',
      url: `/v1/design-templates/${slug}/preview`,
    });
  }
  if (await resolvePreviewFile(slug, 'template')) {
    pages.push({
      role: 'template',
      title: 'Template Seed',
      url: `/v1/design-templates/${slug}/preview/template`,
    });
  }
  return pages;
}

async function resolveThumbnailFile(slug: string): Promise<string | null> {
  const dir = path.join(TEMPLATE_ROOT, slug);
  const candidates = [
    'assets/preview-thumbnail.png',
    'assets/preview-thumbnail.jpg',
    'assets/preview-thumbnail.jpeg',
    'assets/preview-thumbnail.webp',
    'assets/preview-thumbnail.svg',
    'assets/preview-cover.png',
    'assets/preview-cover.jpg',
    'assets/preview-cover.jpeg',
    'assets/preview-cover.webp',
    'assets/preview-cover.svg',
  ];

  for (const candidate of candidates) {
    const file = path.join(dir, candidate);
    if (await fileExists(file)) return file;
  }
  return null;
}

async function resolvePreviewFile(slug: string, page: string): Promise<string | null> {
  const dir = path.join(TEMPLATE_ROOT, slug);
  const candidates =
    page === 'template'
      ? ['assets/template.html', 'template.html']
      : ['example.html', 'index.html', 'assets/example-slides.html', 'assets/template.html'];

  for (const candidate of candidates) {
    const file = path.join(dir, candidate);
    if (await fileExists(file)) return file;
  }
  return null;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

function thumbnailContentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml; charset=utf-8';
  return 'image/png';
}

function generatedThumbnailSvg(template: DesignTemplateSummary): string {
  const background =
    stringFromPath(template.quality, ['thumbnail', 'background']) ??
    stringFromPath(template.preview, ['thumbnail', 'background']) ??
    (template.category === 'ydeck-library' ? '#141512' : '#f7f3ea');
  const accent =
    stringFromPath(template.quality, ['thumbnail', 'accent']) ??
    stringFromPath(template.preview, ['thumbnail', 'accent']) ??
    '#7c3aed';
  const ink = background.toLowerCase() === '#f7f3ea' ? '#141512' : '#fffcf4';
  const name = escapeXml(template.name);
  const scenario = escapeXml(template.scenario ?? template.category ?? 'deck');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="${name} thumbnail">
  <rect width="640" height="360" fill="${escapeXml(background)}"/>
  <rect x="34" y="34" width="572" height="292" rx="10" fill="none" stroke="${escapeXml(ink)}" stroke-opacity=".18"/>
  <circle cx="512" cy="92" r="54" fill="${escapeXml(accent)}" opacity=".9"/>
  <rect x="64" y="78" width="150" height="8" fill="${escapeXml(accent)}"/>
  <text x="64" y="174" fill="${escapeXml(ink)}" font-family="Aptos, Segoe UI, Arial, sans-serif" font-size="42" font-weight="800">${name}</text>
  <text x="64" y="224" fill="${escapeXml(ink)}" fill-opacity=".68" font-family="Aptos, Segoe UI, Arial, sans-serif" font-size="24">${scenario}</text>
  <rect x="64" y="266" width="226" height="10" fill="${escapeXml(ink)}" fill-opacity=".18"/>
  <rect x="64" y="288" width="316" height="10" fill="${escapeXml(ink)}" fill-opacity=".12"/>
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function inlineLocalStyles(html: string, baseDir: string): Promise<string> {
  const linkPattern =
    /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi;
  const replacements: Array<{ from: string; to: string }> = [];
  for (const match of html.matchAll(linkPattern)) {
    const full = match[0];
    const href = match[1];
    if (!href || href.startsWith('http:') || href.startsWith('https:') || href.startsWith('//')) {
      continue;
    }
    const cssFile = path.resolve(baseDir, href);
    if (!cssFile.startsWith(TEMPLATE_ROOT)) continue;
    const css = await readText(cssFile, 200_000);
    if (!css) continue;
    replacements.push({
      from: full,
      to: `<style data-ydeck-template-preview-css>\n${css}\n</style>`,
    });
  }
  return replacements.reduce((text, item) => text.replace(item.from, item.to), html);
}

function toDesignTemplateSummary({
  skillExcerpt: _skill,
  designExcerpt: _design,
  checklistExcerpt: _checklist,
  layoutsExcerpt: _layouts,
  templateJson: _templateJson,
  ...item
}: DesignTemplateContext): DesignTemplateSummary {
  return item;
}

function isFrontendDeckTemplate(template: DesignTemplateSummary): boolean {
  return frontendDeckTemplateVisibility(template).visible;
}

function frontendDeckTemplateVisibility(template: DesignTemplateSummary): {
  visible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (FRONTEND_EXCLUDED_TEMPLATE_IDS.has(template.id)) {
    reasons.push('explicitly-excluded-from-frontend');
  }
  if (!template.previewUrl) {
    reasons.push('missing-preview-url');
  }
  if (template.exposure !== 'frontend') {
    reasons.push(`exposure-is-${template.exposure ?? 'missing'}`);
  }
  const previewSafety = stringFromPath(template.quality, ['previewSafety']);
  if (previewSafety !== 'pass') {
    reasons.push(`preview-safety-is-${previewSafety ?? 'missing'}`);
  }
  return {
    visible: reasons.length === 0,
    reasons,
  };
}

function safeSegment(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,100}$/i.test(value);
}

function safePreviewPage(value: string): boolean {
  return value === 'example' || value === 'template';
}

function extractFrontmatter(text: string): string {
  if (!text.startsWith('---')) return '';
  const end = text.indexOf('\n---', 3);
  return end === -1 ? '' : text.slice(3, end);
}

function parseSimpleFrontmatter(frontmatter: string): {
  name?: string;
  description?: string | null;
  scenario?: string | null;
  category?: string | null;
  mode?: string | null;
  preview?: unknown;
} {
  return {
    name: matchScalar(frontmatter, 'name') ?? undefined,
    description: matchDescription(frontmatter),
    category: matchScalar(frontmatter, 'category'),
    scenario: matchScalar(frontmatter, 'scenario'),
    mode: matchScalar(frontmatter, 'mode'),
    preview: matchPreview(frontmatter),
  };
}

function templateMetadata(value: unknown): {
  name?: string;
  description?: string | null;
  category?: string | null;
  scenario?: string | null;
  exposure?: string | null;
  mode?: string | null;
  version?: string | null;
  compatibility?: unknown;
  capabilities?: unknown;
  quality?: unknown;
  typography?: unknown;
  layoutCount?: number | null;
  recommendedFlows?: unknown;
  bestFitDeckTypes?: string[] | null;
  preview?: unknown;
} {
  if (!isRecord(value)) return {};
  return {
    name: stringValue(value.name) ?? undefined,
    description:
      stringValue(value.description) ??
      stringValue(value.tagline) ??
      stringValue(value.best_for) ??
      null,
    category: stringValue(value.category),
    scenario: stringValue(value.scenario),
    exposure: stringValue(value.exposure),
    mode: stringValue(value.mode),
    version: stringValue(value.version),
    compatibility: value.compatibility,
    capabilities: value.capabilities,
    quality: value.quality,
    typography: value.typography,
    layoutCount: numberValue(value.layoutCount),
    recommendedFlows: value.recommendedFlows,
    bestFitDeckTypes: stringArrayValue(value.bestFitDeckTypes),
    preview: value.preview,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringFromPath(value: unknown, pathParts: string[]): string | null {
  let current = value;
  for (const part of pathParts) {
    if (!isRecord(current)) return null;
    current = current[part];
  }
  return stringValue(current);
}

function matchScalar(frontmatter: string, key: string): string | null {
  const direct = new RegExp(`^${key}:\\s*['"]?([^'"\\n]+)['"]?\\s*$`, 'm').exec(
    frontmatter
  );
  if (direct) return direct[1].trim();
  const nested = new RegExp(`^\\s+${key}:\\s*['"]?([^'"\\n]+)['"]?\\s*$`, 'm').exec(
    frontmatter
  );
  return nested ? nested[1].trim() : null;
}

function matchDescription(frontmatter: string): string | null {
  const block = /^description:\s*\|\s*\n([\s\S]*?)(?:\n\S|$)/m.exec(frontmatter);
  if (block) {
    return block[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 500);
  }
  return matchScalar(frontmatter, 'description');
}

function matchPreview(frontmatter: string): unknown {
  const type = /preview:\s*\n(?:\s+[^\n]*\n)*?\s+type:\s*['"]?([^'"\n]+)['"]?/m.exec(
    frontmatter
  )?.[1];
  const entry = /preview:\s*\n(?:\s+[^\n]*\n)*?\s+entry:\s*['"]?([^'"\n]+)['"]?/m.exec(
    frontmatter
  )?.[1];
  return type || entry ? { type: type ?? null, entry: entry ?? null } : null;
}

function tokenize(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArrayValue(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((item): item is string => typeof item === 'string' && Boolean(item));
  return items.length ? items : null;
}
