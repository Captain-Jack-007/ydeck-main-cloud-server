import { promises as fs } from 'node:fs';
import path from 'node:path';

import { logger } from '../../lib/logger';

export interface DesignSystemSummary {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  previewUrl?: string | null;
  previewPages?: DesignSystemPreviewPage[];
}

export interface DesignSystemContext extends DesignSystemSummary {
  designExcerpt: string;
  tokensExcerpt: string;
}

export interface DesignSystemPreviewPage {
  role?: string | null;
  title?: string | null;
  url: string;
}

const DESIGN_SYSTEM_ROOT = path.resolve(process.cwd(), 'design-systems');
const MAX_DESIGN_CHARS = 5000;
const MAX_TOKENS_CHARS = 2600;
const MAX_SELECTED = 3;
const FRONTEND_EXCLUDED_CATEGORIES = new Set([
  'AI & LLM',
  'Automotive',
  'Backend & Data',
  'Design & Creative',
  'Developer Tools',
  'E-Commerce & Retail',
  'Fintech & Crypto',
  'Media & Consumer',
  'Productivity & SaaS',
  'Social & Messaging',
]);
const FRONTEND_EXCLUDED_IDS = new Set([
  // Product/website fixture, not a reusable presentation style.
  'loom',
]);

let cache: { at: number; items: DesignSystemContext[] } | null = null;
const CACHE_MS = 30_000;

export async function listDesignSystems(): Promise<DesignSystemSummary[]> {
  const items = await loadDesignSystems();
  return items
    .filter(isFrontendDeckStyle)
    .map(({ designExcerpt: _design, tokensExcerpt: _tokens, ...item }) => item);
}

export async function selectDesignSystems(input: {
  designStyle?: unknown;
  deckType?: unknown;
  templateId?: unknown;
  branding?: unknown;
  preferences?: unknown;
}): Promise<DesignSystemContext[]> {
  const systems = (await loadDesignSystems()).filter(isFrontendDeckStyle);
  if (!systems.length) return [];

  const terms = new Set(
    [
      input.designStyle,
      input.deckType,
      input.templateId,
      ...objectStringValues(input.branding),
      ...objectStringValues(input.preferences),
    ]
      .flatMap((value) => tokenize(value))
      .filter(Boolean)
  );

  const scored = systems.map((system) => ({
    system,
    score: scoreSystem(system, terms),
  }));
  scored.sort((a, b) => b.score - a.score || a.system.name.localeCompare(b.system.name));

  const selected = scored.filter((item) => item.score > 0).slice(0, MAX_SELECTED);
  if (!selected.length) {
    const fallback =
      systems.find((system) => system.id === 'default') ??
      systems.find((system) => system.id === 'corporate') ??
      systems[0];
    return fallback ? [fallback] : [];
  }
  if (!selected.some((item) => item.system.id === 'default')) {
    const fallback = systems.find((system) => system.id === 'default');
    if (fallback && selected.length < MAX_SELECTED) selected.push({ system: fallback, score: 0 });
  }
  return selected.map((item) => item.system);
}

export async function readDesignSystemPreview(
  id: string,
  page = 'components'
): Promise<{ html: string; contentType: string } | null> {
  if (!safeSegment(id) || !safePreviewPage(page)) return null;

  const systems = await loadDesignSystems();
  const system = systems.find((item) => item.previewUrl === `/v1/design-systems/${id}/preview`);
  if (!system) return null;

  const dir = path.join(DESIGN_SYSTEM_ROOT, id);
  const file =
    page === 'components'
      ? path.join(dir, 'components.html')
      : path.join(dir, 'preview', `${page}.html`);

  try {
    const [html, tokens] = await Promise.all([
      fs.readFile(file, 'utf8'),
      readText(path.join(dir, 'tokens.css'), 200_000),
    ]);
    return {
      html: inlineTokenStyles(html, tokens),
      contentType: 'text/html; charset=utf-8',
    };
  } catch (err) {
    logger.debug({ err, id, page }, 'design_system.preview_not_found');
    return null;
  }
}

async function loadDesignSystems(): Promise<DesignSystemContext[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.items;

  try {
    const entries = await fs.readdir(DESIGN_SYSTEM_ROOT, { withFileTypes: true });
    const items = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => loadDesignSystem(entry.name))
      )
    ).filter((item): item is DesignSystemContext => Boolean(item));
    cache = { at: now, items };
    return items;
  } catch (err) {
    logger.warn({ err, root: DESIGN_SYSTEM_ROOT }, 'design_systems.load_failed');
    cache = { at: now, items: [] };
    return [];
  }
}

async function loadDesignSystem(slug: string): Promise<DesignSystemContext | null> {
  const dir = path.join(DESIGN_SYSTEM_ROOT, slug);
  try {
    const [manifest, design, tokens] = await Promise.all([
      readJson(path.join(dir, 'manifest.json')),
      readText(path.join(dir, 'DESIGN.md'), MAX_DESIGN_CHARS),
      readText(path.join(dir, 'tokens.css'), MAX_TOKENS_CHARS),
    ]);
    if (!design && !tokens) return null;
    const record = isRecord(manifest) ? manifest : {};
    return {
      id: stringValue(record.id) ?? slug,
      name: stringValue(record.name) ?? titleize(slug),
      category: stringValue(record.category),
      description: stringValue(record.description),
      previewUrl: `/v1/design-systems/${slug}/preview`,
      previewPages: previewPages(record, slug),
      designExcerpt: design,
      tokensExcerpt: tokens,
    };
  } catch (err) {
    logger.debug({ err, slug }, 'design_system.load_skipped');
    return null;
  }
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

function previewPages(manifest: Record<string, unknown>, slug: string): DesignSystemPreviewPage[] {
  const pages: DesignSystemPreviewPage[] = [
    {
      role: 'components',
      title: 'Components',
      url: `/v1/design-systems/${slug}/preview`,
    },
  ];
  const preview = isRecord(manifest.preview) ? manifest.preview : null;
  const manifestPages = Array.isArray(preview?.pages) ? preview.pages : [];

  for (const entry of manifestPages) {
    if (!isRecord(entry)) continue;
    const entryPath = stringValue(entry.path);
    if (!entryPath) continue;
    const match = /^preview\/([a-z0-9][a-z0-9-]{0,80})\.html$/i.exec(entryPath);
    if (!match) continue;
    pages.push({
      role: stringValue(entry.role),
      title: stringValue(entry.title) ?? titleize(match[1]),
      url: `/v1/design-systems/${slug}/preview/${match[1]}`,
    });
  }

  return pages;
}

function isFrontendDeckStyle(system: DesignSystemSummary): boolean {
  if (FRONTEND_EXCLUDED_IDS.has(system.id)) return false;
  return !system.category || !FRONTEND_EXCLUDED_CATEGORIES.has(system.category);
}

function inlineTokenStyles(html: string, tokens: string): string {
  if (!tokens) return html;
  const styleTag = `<style data-ydeck-design-system-tokens>\n${tokens}\n</style>`;
  const tokenLinkPattern =
    /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["'](?:\.\.?\/)?tokens\.css["'])[^>]*>/gi;
  if (tokenLinkPattern.test(html)) {
    return html.replace(tokenLinkPattern, styleTag);
  }
  return html.replace(/<\/head>/i, `${styleTag}\n</head>`);
}

function safeSegment(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,80}$/i.test(value);
}

function safePreviewPage(value: string): boolean {
  return value === 'components' || safeSegment(value);
}

function scoreSystem(system: DesignSystemContext, terms: Set<string>): number {
  if (!terms.size) return system.id === 'default' ? 1 : 0;
  const haystack = [
    system.id,
    system.name,
    system.category,
    system.description,
    system.designExcerpt.slice(0, 1200),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (system.id.toLowerCase() === term) score += 8;
    else if (system.name.toLowerCase() === term) score += 6;
    else if (haystack.includes(term)) score += 2;
  }
  if (system.id === 'default') score += 0.5;
  return score;
}

function objectStringValues(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return Object.values(value)
    .filter((item): item is string => typeof item === 'string')
    .slice(0, 12);
}

function tokenize(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function titleize(value: string): string {
  return value
    .split(/[-_]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
