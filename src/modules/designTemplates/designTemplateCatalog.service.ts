import { promises as fs } from 'node:fs';
import path from 'node:path';

import { logger } from '../../lib/logger';

export interface DesignTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  scenario?: string | null;
  preview?: unknown;
  previewUrl?: string | null;
  previewPages?: DesignTemplatePreviewPage[];
}

export interface DesignTemplateContext extends DesignTemplateSummary {
  skillExcerpt: string;
  checklistExcerpt: string;
  layoutsExcerpt: string;
  templateJson?: unknown;
}

export interface DesignTemplatePreviewPage {
  role?: string | null;
  title?: string | null;
  url: string;
}

const TEMPLATE_ROOT = path.resolve(process.cwd(), 'design-templates');
const MAX_SKILL_CHARS = 5200;
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
    .map(
      ({
        skillExcerpt: _skill,
        checklistExcerpt: _checklist,
        layoutsExcerpt: _layouts,
        templateJson: _templateJson,
        ...item
      }) => item
    );
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
  const scored = templates.map((template) => ({
    template,
    score: scoreTemplate(template, terms),
  }));
  scored.sort(
    (a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name)
  );

  const selected = scored.filter((item) => item.score > 0).slice(0, MAX_SELECTED);
  if (selected.length) return selected.map((item) => item.template);

  const fallback =
    templates.find((template) => template.id === 'simple-deck') ??
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
    if (parsed.mode && parsed.mode !== 'deck') return null;
    const [templateJson, checklist, layouts] = await Promise.all([
      readJson(path.join(dir, 'template.json')),
      readText(path.join(dir, 'references', 'checklist.md'), MAX_CHECKLIST_CHARS),
      readText(path.join(dir, 'references', 'layouts.md'), MAX_LAYOUTS_CHARS),
    ]);
    const previewPages = await templatePreviewPages(slug);
    return {
      id: slug,
      name: parsed.name ?? slug,
      description: parsed.description,
      scenario: parsed.scenario,
      preview: parsed.preview,
      previewUrl: previewPages[0]?.url ?? null,
      previewPages,
      skillExcerpt: skill,
      checklistExcerpt: checklist,
      layoutsExcerpt: layouts,
      templateJson,
    };
  } catch (err) {
    logger.debug({ err, slug }, 'design_template.load_skipped');
    return null;
  }
}

function scoreTemplate(template: DesignTemplateContext, terms: Set<string>): number {
  if (!terms.size) return template.id === 'simple-deck' ? 1 : 0;
  const haystack = [
    template.id,
    template.name,
    template.description,
    template.scenario,
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
  if (template.id === 'simple-deck') score += 0.25;
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

function isFrontendDeckTemplate(template: DesignTemplateSummary): boolean {
  if (FRONTEND_EXCLUDED_TEMPLATE_IDS.has(template.id)) return false;
  if (!template.previewUrl) return false;
  return true;
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
  mode?: string | null;
  preview?: unknown;
} {
  return {
    name: matchScalar(frontmatter, 'name') ?? undefined,
    description: matchDescription(frontmatter),
    scenario: matchScalar(frontmatter, 'scenario'),
    mode: matchScalar(frontmatter, 'mode'),
    preview: matchPreview(frontmatter),
  };
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
