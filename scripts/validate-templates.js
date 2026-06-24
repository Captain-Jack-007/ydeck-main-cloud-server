#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const templateRoot = path.join(root, 'design-templates');
const schema = JSON.parse(
  fs.readFileSync(path.join(templateRoot, 'template.schema.json'), 'utf8')
);
const allowedCategories = new Set(schema.properties.category.enum);
const allowedExposures = new Set(schema.properties.exposure.enum);
const failures = [];
const warnings = [];
const summaries = [];

function main() {
  const dirs = fs
    .readdirSync(templateRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const slug of dirs) validateTemplate(slug);

  const frontendCount = summaries.filter((item) => item.exposure === 'frontend').length;
  const warningCount = warnings.length;
  console.log(
    `Validated ${summaries.length} templates (${frontendCount} frontend templates).`
  );
  if (warningCount) {
    console.log(`Warnings: ${warningCount}`);
    for (const warning of warnings.slice(0, 80)) console.warn(`WARN ${warning}`);
    if (warningCount > 80) console.warn(`WARN ... ${warningCount - 80} more`);
  }
  if (failures.length) {
    console.error(`Failures: ${failures.length}`);
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
}

function validateTemplate(slug) {
  const dir = path.join(templateRoot, slug);
  const skillPath = path.join(dir, 'SKILL.md');
  const designPath = path.join(dir, 'DESIGN.md');
  const templatePath = path.join(dir, 'template.json');
  const referencesDir = path.join(dir, 'references');
  const layoutsPath = path.join(referencesDir, 'layouts.md');
  const checklistPath = path.join(referencesDir, 'checklist.md');
  const promptsPath = path.join(referencesDir, 'sample_prompts.md');

  if (!exists(skillPath)) return;
  const skill = read(skillPath);
  const frontmatter = extractFrontmatter(skill);
  const skillMeta = parseFrontmatter(frontmatter);

  if (!exists(templatePath)) {
    if (!resolvePreviewFile(dir, skillMeta.previewEntry)) return;
    fail(slug, 'template.json is missing');
    return;
  }

  const template = readJson(templatePath, slug);
  if (!template) return;

  const exposure = typeof template.exposure === 'string' ? template.exposure : null;
  const strict = exposure === 'frontend';
  summaries.push({ slug, exposure: exposure ?? 'missing' });

  requireString(slug, template, 'slug');
  requireString(slug, template, 'name');
  requireString(slug, template, 'category');
  requireString(slug, template, 'scenario');
  requireString(slug, template, 'mode');
  requireString(slug, template, 'exposure');
  requireString(slug, template, 'version');

  if (template.slug !== slug) fail(slug, `template.json slug must match folder name`);
  if (template.mode !== 'deck') fail(slug, `mode must be "deck"`);
  if (!allowedExposures.has(template.exposure)) {
    fail(slug, `exposure must be "frontend" or "reference"`);
  }
  if (!allowedCategories.has(template.category)) {
    fail(slug, `category "${template.category}" is not allowed`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(String(template.version ?? ''))) {
    fail(slug, `version must be semver-like, for example 1.0.0`);
  }

  if (!template.compatibility || typeof template.compatibility !== 'object') {
    fail(slug, 'compatibility is missing');
  } else if (!/^\d+\.\d+\.\d+$/.test(String(template.compatibility.minYDeckVersion ?? ''))) {
    fail(slug, 'compatibility.minYDeckVersion is missing or invalid');
  }

  if (!template.canvas || template.canvas.width !== 1920 || template.canvas.height !== 1080) {
    fail(slug, 'canvas must be 1920x1080');
  }
  if (!template.palette || typeof template.palette !== 'object') {
    fail(slug, 'palette is missing');
  }
  if (!Array.isArray(template.layouts) || !template.layouts.length) {
    fail(slug, 'layouts must be a non-empty array');
  } else if (
    Number.isInteger(template.layoutCount) &&
    template.layoutCount !== template.layouts.length
  ) {
    fail(slug, `layoutCount ${template.layoutCount} does not match ${template.layouts.length} layouts`);
  }
  validateRecommendedFlows(slug, template);
  validateCapabilities(slug, template.capabilities);
  validateQuality(slug, template.quality, strict);
  validateDrift(slug, skillMeta, template);

  if (!exists(layoutsPath)) fail(slug, 'references/layouts.md is missing');
  if (!exists(checklistPath)) fail(slug, 'references/checklist.md is missing');
  if (!exists(promptsPath)) warn(slug, 'references/sample_prompts.md is missing');
  validateDesignDoc(slug, template, designPath);

  const preview = resolvePreviewFile(dir, template.preview?.entry);
  if (!preview) {
    fail(slug, 'preview HTML is missing');
    return;
  }
  validatePreview(slug, preview, template, strict);

  if (exists(layoutsPath) && Array.isArray(template.layouts)) {
    const layoutsText = read(layoutsPath);
    for (const layout of template.layouts) {
      if (!layout || typeof layout.id !== 'string') {
        fail(slug, 'every layout needs an id');
        continue;
      }
      if (!layoutsText.includes(layout.id)) {
        fail(slug, `layout id "${layout.id}" is not documented in references/layouts.md`);
      }
    }
  }
}

function validateDesignDoc(slug, template, designPath) {
  const required =
    template.exposure === 'frontend' &&
    (template.category === 'ydeck-library' || String(template.slug ?? '').startsWith('ydeck-library-'));
  if (!required) return;
  if (!exists(designPath)) {
    fail(slug, 'DESIGN.md is missing');
    return;
  }
  const design = read(designPath);
  for (const heading of [
    '## 1. Art Direction',
    '## 4. Grid And Spatial System',
    '## 5. Chart, Bar, And Diagram Grammar',
    '## 8. Layout Engine',
  ]) {
    if (!design.includes(heading)) fail(slug, `DESIGN.md missing "${heading}"`);
  }
  if (Array.isArray(template.layouts)) {
    for (const layout of template.layouts) {
      if (typeof layout?.id === 'string' && !design.includes(`\`${layout.id}\``)) {
        fail(slug, `DESIGN.md does not document layout "${layout.id}"`);
      }
    }
  }
}

function validateRecommendedFlows(slug, template) {
  if (template.recommendedFlows === undefined) return;
  if (!Array.isArray(template.recommendedFlows)) {
    fail(slug, 'recommendedFlows must be an array when present');
    return;
  }
  const layoutIds = new Set(
    Array.isArray(template.layouts)
      ? template.layouts
          .map((layout) => layout?.id)
          .filter((id) => typeof id === 'string')
      : []
  );
  for (const flow of template.recommendedFlows) {
    if (!flow || typeof flow !== 'object') {
      fail(slug, 'recommendedFlows entries must be objects');
      continue;
    }
    if (typeof flow.id !== 'string' || !flow.id) {
      fail(slug, 'recommendedFlows entries need an id');
    }
    if (typeof flow.name !== 'string' || !flow.name) {
      fail(slug, 'recommendedFlows entries need a name');
    }
    if (!Array.isArray(flow.layoutIds) || !flow.layoutIds.length) {
      fail(slug, `recommendedFlows.${flow.id ?? 'unknown'} needs layoutIds`);
      continue;
    }
    for (const layoutId of flow.layoutIds) {
      if (!layoutIds.has(layoutId)) {
        fail(slug, `recommendedFlows.${flow.id ?? 'unknown'} references unknown layout "${layoutId}"`);
      }
    }
  }
}

function validateCapabilities(slug, capabilities) {
  const required = [
    'supportsCharts',
    'supportsIcons',
    'supportsImageSlides',
    'supportsTeachingSlides',
    'supportsFinancialSlides',
    'supportsSpeakerNotes',
  ];
  if (!capabilities || typeof capabilities !== 'object') {
    fail(slug, 'capabilities is missing');
    return;
  }
  for (const key of required) {
    if (typeof capabilities[key] !== 'boolean') {
      fail(slug, `capabilities.${key} must be boolean`);
    }
  }
}

function validateQuality(slug, quality, strict) {
  const numeric = [
    'compositionVariety',
    'chartReadiness',
    'iconReadiness',
    'generationReliability',
  ];
  if (!quality || typeof quality !== 'object') {
    fail(slug, 'quality is missing');
    return;
  }
  for (const key of ['previewSafety', 'layoutCoverage', 'contrast']) {
    if (typeof quality[key] !== 'string' || !quality[key]) {
      fail(slug, `quality.${key} must be a string`);
    }
  }
  for (const key of numeric) {
    if (typeof quality[key] !== 'number' || quality[key] < 0 || quality[key] > 100) {
      fail(slug, `quality.${key} must be a 0-100 number`);
    }
  }
  if (strict && quality.previewSafety !== 'pass') {
    fail(slug, 'frontend templates require quality.previewSafety="pass"');
  }
}

function validateDrift(slug, skillMeta, template) {
  for (const key of ['name', 'category', 'scenario', 'mode']) {
    if (skillMeta[key] && template[key] && skillMeta[key] !== template[key]) {
      warn(slug, `SKILL.md ${key}="${skillMeta[key]}" differs from template.json "${template[key]}"`);
    }
  }
  if (skillMeta.previewEntry && template.preview?.entry && skillMeta.previewEntry !== template.preview.entry) {
    warn(
      slug,
      `SKILL.md preview entry "${skillMeta.previewEntry}" differs from template.json "${template.preview.entry}"`
    );
  }
}

function validatePreview(slug, previewFile, template, strict) {
  const html = read(previewFile);
  const slideCount = countSlides(html);
  const expected = Number(template.minSlides ?? template.slideCount ?? template.slide_count ?? 1);
  const issues = {
    scripts: /<script\b/i.test(html),
    iframes: /<iframe\b/i.test(html),
    remoteUrls: /https?:\/\//i.test(html) || /src=["']\/\//i.test(html) || /href=["']\/\//i.test(html),
    externalCss: /<link\b(?=[^>]*\brel=["']stylesheet["'])/i.test(html),
    remoteFonts: /fonts\.(googleapis|gstatic)\.com|use\.typekit\.net|fontshare\.com/i.test(html),
  };

  if (slideCount < expected) {
    fail(slug, `preview has ${slideCount} slides, expected at least ${expected}`);
  }

  const activeIssues = Object.entries(issues)
    .filter(([, present]) => present)
    .map(([name]) => name);
  if (activeIssues.length) {
    const message = `preview safety issues: ${activeIssues.join(', ')}`;
    if (strict) fail(slug, message);
    else warn(slug, `${message} (reference-only template)`);
  }
}

function countSlides(html) {
  const ydeck = (html.match(/class=["'][^"']*\bydeck-slide\b/g) || []).length;
  if (ydeck) return ydeck;
  return (html.match(/class=["'][^"']*\bslide\b/g) || []).length;
}

function resolvePreviewFile(dir, preferred) {
  const candidates = [
    preferred,
    'example.html',
    'index.html',
    'assets/example-slides.html',
    'assets/template.html',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const file = path.join(dir, candidate);
    if (exists(file)) return file;
  }
  return null;
}

function readJson(file, slug) {
  try {
    return JSON.parse(read(file));
  } catch (err) {
    fail(slug, `template.json is invalid JSON: ${err.message}`);
    return null;
  }
}

function requireString(slug, object, key) {
  if (typeof object[key] !== 'string' || !object[key]) fail(slug, `${key} is missing`);
}

function parseFrontmatter(frontmatter) {
  return {
    name: matchScalar(frontmatter, 'name'),
    category: matchScalar(frontmatter, 'category'),
    scenario: matchScalar(frontmatter, 'scenario'),
    mode: matchScalar(frontmatter, 'mode'),
    previewEntry: matchPreviewEntry(frontmatter),
  };
}

function extractFrontmatter(text) {
  if (!text.startsWith('---')) return '';
  const end = text.indexOf('\n---', 3);
  return end === -1 ? '' : text.slice(3, end);
}

function matchScalar(frontmatter, key) {
  const direct = new RegExp(`^${key}:\\s*['"]?([^'"\\n]+)['"]?\\s*$`, 'm').exec(
    frontmatter
  );
  if (direct) return direct[1].trim();
  const nested = new RegExp(`^\\s+${key}:\\s*['"]?([^'"\\n]+)['"]?\\s*$`, 'm').exec(
    frontmatter
  );
  return nested ? nested[1].trim() : null;
}

function matchPreviewEntry(frontmatter) {
  return /preview:\s*\n(?:\s+[^\n]*\n)*?\s+entry:\s*['"]?([^'"\n]+)['"]?/m.exec(
    frontmatter
  )?.[1] ?? null;
}

function exists(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function fail(slug, message) {
  failures.push(`${slug}: ${message}`);
}

function warn(slug, message) {
  warnings.push(`${slug}: ${message}`);
}

main();
