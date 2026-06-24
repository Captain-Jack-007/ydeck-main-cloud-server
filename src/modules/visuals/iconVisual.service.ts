import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface IconVisualItem {
  label: string;
  icon?: string;
}

export interface IconVisualOptions {
  accent?: string;
  textColor?: string;
  surface?: string;
  style?: string;
}

export interface IconVisualResult {
  library: 'phosphor';
  style: 'light' | 'thin' | 'duotone';
  html: string;
  icons: Array<{ label: string; icon: string }>;
}

const ICON_ROOT = path.resolve(
  path.dirname(require.resolve('@phosphor-icons/core')),
  '..'
);
const DEFAULT_ACCENT = '#2563EB';
const DEFAULT_TEXT = '#141512';
const DEFAULT_SURFACE = 'rgba(255,252,244,0.72)';

const ICON_ALIASES: Array<{ terms: RegExp; icon: string }> = [
  { terms: /growth|revenue|metric|chart|bar|kpi|traction/i, icon: 'chart-line-up' },
  { terms: /market|global|world|region|international/i, icon: 'globe-hemisphere-east' },
  { terms: /customer|audience|user|people|team|stakeholder/i, icon: 'users-four' },
  { terms: /launch|rocket|release/i, icon: 'rocket-launch' },
  { terms: /strategy|target|goal|focus|objective/i, icon: 'target' },
  { terms: /security|risk|trust|safe|guard|compliance/i, icon: 'shield-checkered' },
  { terms: /process|workflow|system|operation|architecture/i, icon: 'tree-structure' },
  { terms: /technical|code|developer|api|engineering/i, icon: 'code-block' },
  { terms: /finance|money|budget|runway|price|cost|investment/i, icon: 'currency-dollar' },
  { terms: /time|timeline|roadmap|schedule|deadline/i, icon: 'calendar-check' },
  { terms: /idea|insight|innovation|creative|spark/i, icon: 'sparkle' },
  { terms: /education|training|lesson|learn|workshop/i, icon: 'graduation-cap' },
  { terms: /brand|campaign|marketing|message/i, icon: 'megaphone-simple' },
  { terms: /portfolio|design|visual|image|gallery/i, icon: 'images-square' },
  { terms: /decision|approved|quality|success|check/i, icon: 'seal-check' },
  { terms: /data|database|storage|warehouse/i, icon: 'database' },
  { terms: /cloud|platform|infrastructure/i, icon: 'cloud-check' },
  { terms: /network|ecosystem|partner|integration/i, icon: 'network' },
  { terms: /filter|funnel|pipeline|conversion/i, icon: 'funnel-simple' },
  { terms: /presentation|deck|slide|report/i, icon: 'presentation-chart' },
];

export function renderIconVisual(
  items: IconVisualItem[],
  options: IconVisualOptions = {}
): IconVisualResult {
  const style = normalizeStyle(options.style);
  const accent = safeColor(options.accent, DEFAULT_ACCENT);
  const textColor = safeColor(options.textColor, DEFAULT_TEXT);
  const surface = options.surface ?? DEFAULT_SURFACE;
  const normalized = items.slice(0, 8).map((item) => {
    const label = String(item.label || 'Item').slice(0, 64);
    const icon = resolveIconName(item.icon || label);
    return { label, icon, svg: loadIconSvg(icon, style) };
  });

  const columns = Math.max(1, Math.min(normalized.length, 4));
  const html = `<div class="ydeck-modern-icons" style="display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:18px;">${normalized
    .map(
      (item) =>
        `<div class="ydeck-icon-tile" style="background:${escapeAttr(
          surface
        )};border:1px solid rgba(20,21,18,0.12);border-radius:8px;padding:24px;display:grid;gap:18px;align-content:start;min-height:154px;"><div style="width:58px;height:58px;color:${escapeAttr(
          accent
        )};">${item.svg}</div><div style="font-size:23px;line-height:1.18;font-weight:700;color:${escapeAttr(
          textColor
        )};">${escapeHtml(item.label)}</div></div>`
    )
    .join('')}</div>`;

  return {
    library: 'phosphor',
    style,
    html,
    icons: normalized.map(({ label, icon }) => ({ label, icon })),
  };
}

function resolveIconName(value: string): string {
  for (const mapping of ICON_ALIASES) {
    if (mapping.terms.test(value)) return mapping.icon;
  }
  return 'sparkle';
}

function loadIconSvg(name: string, style: IconVisualResult['style']): string {
  const file = path.join(ICON_ROOT, 'assets', style, `${name}-${style}.svg`);
  try {
    return sanitizeSvg(readFileSync(file, 'utf8'));
  } catch {
    return sanitizeSvg(
      readFileSync(
        path.join(ICON_ROOT, 'assets', style, `sparkle-${style}.svg`),
        'utf8'
      )
    );
  }
}

function normalizeStyle(value: unknown): IconVisualResult['style'] {
  const raw = String(value ?? 'light').toLowerCase();
  if (raw === 'thin' || raw === 'duotone') return raw;
  return 'light';
}

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace(
      '<svg ',
      '<svg style="width:100%;height:100%;display:block;" aria-hidden="true" '
    );
}

function safeColor(value: unknown, fallback: string): string {
  const raw = String(value ?? '');
  if (/^#[a-f0-9]{3,8}$/i.test(raw)) return raw;
  if (/^rgba?\([0-9.,\s%]+\)$/i.test(raw)) return raw;
  return fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
