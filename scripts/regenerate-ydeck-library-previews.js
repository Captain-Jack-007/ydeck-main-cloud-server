#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const templateRoot = path.join(root, 'design-templates');

const rendered = [];

function main() {
  const dirs = fs
    .readdirSync(templateRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('ydeck-library-'))
    .map((entry) => entry.name)
    .sort();

  for (const dirName of dirs) {
    const dir = path.join(templateRoot, dirName);
    const templatePath = path.join(dir, 'template.json');
    if (!fs.existsSync(templatePath)) continue;
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    if (template.preview?.authoring === 'manual') {
      rendered.push(`${template.slug}: skipped manual preview`);
      continue;
    }
    const html = renderPreview(template);
    fs.writeFileSync(path.join(dir, 'example.html'), html);
    rendered.push(`${template.slug}: ${Math.min(15, template.layouts.length)} preview slides`);
  }

  console.log(`Regenerated ${rendered.length} YDeck library previews.`);
  for (const item of rendered) console.log(`- ${item}`);
}

function renderPreview(template) {
  const palette = normalizePalette(template.palette || {});
  const slides = template.layouts.slice(0, Math.min(15, template.layouts.length));
  const context = {
    template,
    palette,
    scenario: template.scenario || scenarioFromSlug(template.slug),
    title: template.name || titleFromSlug(template.slug),
    tagline: template.tagline || template.description || 'A professional YDeck layout system for structured presentations.',
    fontStack:
      template.typography?.fontStacks?.sans ||
      '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(context.title)} Preview</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;background:${palette.porcelain};color:${palette.text};font-family:${context.fontStack};letter-spacing:0}
body{overflow:auto}
.deck{--preview-scale:.625;width:100%;background:${palette.porcelain}}
.slide-page{width:100%;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:0;background:${palette.porcelain};page-break-after:always}
.stage{width:calc(1920px * var(--preview-scale));height:calc(1080px * var(--preview-scale));overflow:hidden;background:${palette.porcelain}}
.scale{width:1920px;height:1080px;transform-origin:top left;transform:scale(var(--preview-scale));overflow:hidden}
.ydeck-slide{width:1920px;height:1080px;position:relative;overflow:hidden;letter-spacing:0}
.topline{position:absolute;left:112px;right:112px;top:54px;display:flex;justify-content:space-between;font-size:18px;letter-spacing:.08em;text-transform:uppercase;opacity:.64}
.eyebrow{position:absolute;left:112px;top:112px;font-size:20px;letter-spacing:.12em;text-transform:uppercase;font-weight:840}
.title{margin:0;font-size:76px;line-height:1.03;font-weight:880}
.copy{font-size:29px;line-height:1.34;margin:26px 0 0}
.footer{position:absolute;left:112px;right:112px;bottom:54px;display:flex;justify-content:space-between;font-size:20px;opacity:.62}
.num{font-size:18px;letter-spacing:.1em;text-transform:uppercase;opacity:.64;font-weight:840}
.card{border-radius:8px;border:1px solid rgba(17,24,39,.13);background:rgba(255,255,255,.78);padding:30px}
.dark-card{border-color:rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#FFFFFF}
.pill{border-radius:999px;padding:9px 15px;font-size:18px;font-weight:800;display:inline-block}
svg{max-width:100%}
@media(max-width:1308px){.deck{--preview-scale:.625}}
@media(max-width:1200px){.deck{--preview-scale:.58}}
@media(max-width:1120px){.deck{--preview-scale:.535}}
@media(max-width:1040px){.deck{--preview-scale:.49}}
@media(max-width:960px){.deck{--preview-scale:.445}}
@media(max-width:880px){.deck{--preview-scale:.4}}
@media(max-width:800px){.deck{--preview-scale:.35}}
@media(max-width:680px){.deck{--preview-scale:.285}}
@media(max-width:560px){.deck{--preview-scale:.22}}
</style>
</head>
<body>
<main class="deck">
${slides.map((layout, index) => wrapSlide(context, layout, index, slides.length)).join('\n')}
</main>
</body>
</html>
`;
}

function wrapSlide(context, layout, index, count) {
  const slide = renderSlide(context, layout, index);
  return `<section class="slide-page"><div class="stage"><div class="scale">${slide.replace(
    '<section ',
    `<section data-layout-id="${escapeAttr(layout.id)}" `
  )}</div></div></section>`;
}

function renderSlide(context, layout, index) {
  const type = classifyLayout(context, layout, index);
  if (isLearningScenario(context) && index > 0) {
    if (type === 'geo') return academicMapSlide(context, layout, index);
    if (type === 'timeline') return academicPlotTimelineSlide(context, layout, index);
    return academicLearningSlide(context, layout, index, type);
  }
  const methods = {
    title: titleSlide,
    summary: executiveSummarySlide,
    geo: geoMapSlide,
    metric: metricDashboardSlide,
    chart: chartSlide,
    timeline: timelineSlide,
    network: networkSlide,
    matrix: matrixSlide,
    education: educationSlide,
    image: imageFeatureSlide,
    evidence: evidenceSlide,
    close: closingSlide,
    narrative: narrativeSlide,
  };
  return methods[type](context, layout, index);
}

function academicLearningSlide(context, layout, index, type) {
  const { palette: p } = context;
  const progress = academicProgress(context, index);
  const body = academicBodyForLayout(layout, type);

  return baseSlide(context, layout, index, {
    bg: p.porcelain,
    fg: p.text,
    eyebrow: p.secondary,
    body: `
${academicSidebar(context, index, progress)}
<div style="position:absolute;left:536px;top:144px;width:1170px;height:790px;">
  ${body(context, layout, index)}
</div>`,
  });
}

function academicBodyForLayout(layout, type) {
  const text = `${layout.id} ${layout.name} ${layout.role || ''}`.toLowerCase();
  if (hasAny(text, ['objective'])) return academicObjectivesBody;
  if (hasAny(text, ['character'])) return academicCharacterBody;
  if (hasAny(text, ['vocabulary', 'grammar'])) return academicVocabularyBody;
  if (hasAny(text, ['theme', 'main idea', 'literary devices'])) return academicAnalysisBody;
  if (hasAny(text, ['quote', 'excerpt', 'evidence', 'close reading'])) return academicReadingBody;
  if (hasAny(text, ['discussion', 'creative response', 'writing prompt'])) return academicResponseBody;
  if (hasAny(text, ['summary', 'homework', 'next chapter'])) return academicSummaryBody;
  return {
    summary: academicObjectivesBody,
    education: academicExerciseBody,
    evidence: academicReadingBody,
    image: academicReadingBody,
    close: academicSummaryBody,
    chart: academicProgressBody,
    metric: academicProgressBody,
    matrix: academicExerciseBody,
    network: academicConceptBody,
    narrative: academicConceptBody,
  }[type] || academicConceptBody;
}

function academicSidebar(context, index, progress) {
  const { palette: p } = context;
  return `<aside style="position:absolute;left:112px;top:96px;bottom:96px;width:320px;border-right:1px solid ${alpha(p.text, 0.12)};padding:34px 34px 34px 0;">
    <div class="num" style="color:${p.secondary};opacity:1;">${escapeHtml(context.scenario)}</div>
    <div style="font-size:24px;line-height:1.12;font-weight:860;margin-top:34px;color:${p.text};">${escapeHtml(context.title.replace(/^YDeck\s+/, ''))}</div>
    <div style="margin-top:60px;" class="num">Learning path</div>
    <ol style="list-style:none;padding:0;margin:22px 0 0;display:grid;gap:18px;">
      ${progress.map((item, i) => `<li style="display:flex;gap:14px;align-items:flex-start;color:${i < index % progress.length ? alpha(p.text, 0.48) : p.text};">
        <span style="width:22px;height:22px;border-radius:50%;margin-top:3px;background:${i === index % progress.length ? p.accent : i < index % progress.length ? p.secondary : alpha(p.text, 0.12)};"></span>
        <span style="font-size:21px;line-height:1.22;font-weight:${i === index % progress.length ? 840 : 640};">${escapeHtml(item)}</span>
      </li>`).join('')}
    </ol>
    <div style="position:absolute;left:0;right:34px;bottom:0;">
      <div class="num">Module progress</div>
      <div style="height:10px;border-radius:999px;background:${alpha(p.text, 0.1)};overflow:hidden;margin-top:16px;"><div style="width:${Math.min(96, 12 + index * 6)}%;height:100%;background:${p.secondary};"></div></div>
      <p style="font-size:17px;color:${alpha(p.text, 0.56)};line-height:1.35;margin-top:16px;">Page ${index + 1} of 15 · preview sampler</p>
    </div>
  </aside>`;
}

function academicMapSlide(context, layout, index) {
  const { palette: p } = context;
  return baseSlide(context, layout, index, {
    bg: p.porcelain,
    fg: p.text,
    hideTopline: true,
    body: `
<div style="position:absolute;left:112px;top:54px;width:1696px;height:32px;display:flex;justify-content:space-between;align-items:center;">
  <span class="num" style="color:${p.secondary};opacity:1;">setting evidence</span>
  <span class="num">chapter geography</span>
</div>
<div style="position:absolute;left:112px;top:150px;width:1060px;height:700px;background:${p.fog};border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;overflow:hidden;">
  <svg viewBox="0 0 1060 700" aria-label="Chapter setting map with anchored callouts" style="width:1060px;height:700px;display:block;">
    <rect width="1060" height="700" fill="${p.fog}"/>
    <g stroke="${alpha(p.text, 0.12)}" stroke-width="2">
      ${Array.from({ length: 8 }, (_, i) => `<path d="M${118 + i * 112} 74V626"/>`).join('')}
      ${Array.from({ length: 5 }, (_, i) => `<path d="M74 ${118 + i * 106}H986"/>`).join('')}
    </g>
    <path d="M196 468C154 342 226 226 356 202C474 180 536 278 642 206C760 126 914 214 892 372C878 472 770 500 698 580C598 690 478 570 366 608C286 634 220 546 196 468Z" fill="#FFFFFF" stroke="${alpha(p.text, 0.2)}" stroke-width="3"/>
    <path d="M244 476C318 364 388 388 482 310C594 216 686 274 806 232" fill="none" stroke="${p.accent}" stroke-width="9" stroke-linecap="round"/>
    <path d="M292 540C416 486 468 530 578 438C670 360 742 404 844 330" fill="none" stroke="${p.secondary}" stroke-width="6" stroke-linecap="round"/>
    ${mapPin(244, 476, p.accent, 'home')}
    ${mapPin(482, 310, p.secondary, 'conflict')}
    ${mapPin(806, 232, p.accent, 'turning point')}
    ${mapPin(844, 330, p.secondary, 'return')}
    <rect x="72" y="72" width="276" height="120" rx="8" fill="${p.text}"/>
    <text x="104" y="122" fill="#FFFFFF" font-size="28" font-weight="860">Spatial reading</text>
    <text x="104" y="162" fill="#FFFFFF" opacity=".68" font-size="21">where setting changes meaning</text>
    <path d="M348 152C430 170 468 220 482 310" fill="none" stroke="${p.text}" stroke-width="4" stroke-dasharray="8 10" opacity=".5"/>
  </svg>
</div>
<div style="position:absolute;left:1220px;top:150px;width:588px;height:700px;display:grid;grid-template-rows:190px 1fr;gap:22px;">
  <div style="background:${p.text};color:#FFFFFF;border-radius:8px;padding:34px;">
    <div class="num" style="color:rgba(255,255,255,.62);">map question</div>
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1.12;margin-top:26px;">How does the place change the choices characters can make?</div>
  </div>
  <div style="background:#FFFFFF;border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:32px;">
    <div class="num" style="color:${p.accent};opacity:1;">fact ledger</div>
    ${[
      ['Home base', 'Safety, routine, first conflict'],
      ['Public space', 'Pressure from others becomes visible'],
      ['Threshold', 'A choice moves the plot forward'],
      ['Return point', 'The chapter shows what changed'],
    ].map(([label, copy], i) => `<div style="border-top:1px solid ${alpha(p.text, 0.1)};padding-top:22px;margin-top:${i === 0 ? 28 : 22}px;">
      <strong style="display:block;font-size:29px;line-height:1.05;color:${i === 2 ? p.accent : p.text};">${escapeHtml(label)}</strong>
      <p style="font-size:22px;line-height:1.32;color:${alpha(p.text, 0.62)};margin:10px 0 0;">${escapeHtml(copy)}</p>
    </div>`).join('')}
  </div>
</div>`,
  });
}

function academicPlotTimelineSlide(context, layout, index) {
  const { palette: p } = context;
  const stages = ['Exposition', 'Rising action', 'Turning point', 'Consequence', 'Reflection'];
  return baseSlide(context, layout, index, {
    bg: p.porcelain,
    fg: p.text,
    hideTopline: true,
    body: `
<div style="position:absolute;left:112px;top:54px;width:1696px;height:32px;display:flex;justify-content:space-between;align-items:center;">
  <span class="num" style="color:${p.secondary};opacity:1;">plot sequence</span>
  <span class="num">cause / choice / consequence</span>
</div>
<div style="position:absolute;left:112px;top:160px;width:680px;height:190px;">
  <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:76px;line-height:1.02;margin:0;color:${p.text};">${escapeHtml(layout.name)}</h2>
  <p style="font-size:27px;line-height:1.34;color:${alpha(p.text, 0.64)};margin:26px 0 0;">A plot timeline should show sequence, pressure, and the moment that changes the chapter.</p>
</div>
<div style="position:absolute;left:112px;top:390px;width:1696px;height:360px;background:${p.text};color:#FFFFFF;border-radius:8px;padding:42px;">
  <svg viewBox="0 0 1612 276" aria-label="Plot timeline with lanes and milestones" style="width:1612px;height:276px;display:block;">
    <g stroke="rgba(255,255,255,.14)" stroke-width="2">
      <path d="M64 86H1548"/><path d="M64 154H1548"/><path d="M64 222H1548"/>
    </g>
    <path d="M86 154H1506" stroke="rgba(255,255,255,.32)" stroke-width="4" stroke-linecap="round"/>
    ${stages.map((stage, i) => {
      const x = 112 + i * 330;
      const y = [92, 40, 126, 62, 112][i];
      const color = i === 2 ? p.accent : i === 3 ? p.secondary : '#FFFFFF';
      const darkText = color === '#FFFFFF';
      return `<g>
        <path d="M${x + 76} ${y + 86}V154" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity=".82"/>
        <rect x="${x}" y="${y}" width="230" height="94" rx="8" fill="${color}" opacity="${darkText ? '.95' : '1'}"/>
        <text x="${x + 24}" y="${y + 38}" fill="${darkText ? p.text : '#FFFFFF'}" font-size="23" font-weight="860">${escapeHtml(stage)}</text>
        <text x="${x + 24}" y="${y + 70}" fill="${darkText ? p.text : '#FFFFFF'}" opacity=".64" font-size="18">chapter beat ${i + 1}</text>
      </g>`;
    }).join('')}
    <path d="M198 210C390 168 548 186 724 118C920 42 1074 88 1288 62" fill="none" stroke="${p.secondary}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="724" cy="118" r="18" fill="${p.accent}"/>
    <text x="760" y="126" fill="#FFFFFF" font-size="22" font-weight="860">decision gate</text>
  </svg>
</div>
<div style="position:absolute;left:112px;top:790px;width:1696px;height:120px;display:grid;grid-template-columns:1.15fr .85fr 1fr;gap:18px;">
  ${[
    ['Cause', 'What creates pressure before the turning point?'],
    ['Choice', 'Which decision changes the direction of the chapter?'],
    ['Consequence', 'What new problem or insight appears after it?'],
  ].map(([label, copy], i) => `<div style="background:${i === 1 ? p.accent : '#FFFFFF'};color:${i === 1 ? '#FFFFFF' : p.text};border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:24px 28px;">
    <div class="num" style="color:${i === 1 ? 'rgba(255,255,255,.7)' : i === 2 ? p.secondary : p.accent};opacity:1;">${escapeHtml(label)}</div>
    <p style="font-size:23px;line-height:1.28;margin:14px 0 0;color:${i === 1 ? 'rgba(255,255,255,.82)' : alpha(p.text, 0.66)};">${escapeHtml(copy)}</p>
  </div>`).join('')}
</div>`,
  });
}

function academicObjectivesBody(context, layout, index) {
  const { palette: p } = context;
  const items = academicItems(context);
  return `<div class="num" style="color:${p.secondary};opacity:1;">objectives</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:72px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:64px;">
      ${items.slice(0, 4).map((item, i) => `<div style="min-height:142px;border:1px solid ${alpha(p.text, 0.12)};background:#FFFFFF;border-radius:8px;padding:30px;">
        <div style="font-size:22px;font-weight:860;color:${p.accent};">0${i + 1}</div>
        <div style="font-size:31px;line-height:1.15;font-weight:800;margin-top:16px;">${escapeHtml(item)}</div>
        <p style="font-size:20px;line-height:1.35;color:${alpha(p.text, 0.6)};margin:16px 0 0;">A concrete outcome learners can inspect, practice, or explain.</p>
      </div>`).join('')}
    </div>`;
}

function academicConceptBody(context, layout, index) {
  const { palette: p } = context;
  return `<div class="num" style="color:${p.secondary};opacity:1;">concept</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:72px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <p style="font-size:29px;line-height:1.44;color:${alpha(p.text, 0.66)};width:900px;margin:30px 0 0;">This layout explains one idea, gives a worked pattern, and leaves room for teacher narration or student notes.</p>
    <div style="display:grid;grid-template-columns:.9fr 1.1fr;gap:28px;margin-top:58px;">
      <div style="background:${p.fog};border:1px solid ${alpha(p.text, 0.1)};border-radius:8px;padding:34px;">
        <div class="num">Rule of thumb</div>
        <div style="font-size:36px;line-height:1.16;font-weight:820;margin-top:28px;">Name the idea before asking learners to use it.</div>
      </div>
      <div style="background:#FFFFFF;border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:34px;display:grid;gap:18px;">
        ${['Definition', 'Example', 'Check'].map((label, i) => `<div style="display:grid;grid-template-columns:42px 1fr;gap:18px;align-items:start;"><span style="width:42px;height:42px;border-radius:50%;background:${i === 1 ? p.accent : alpha(p.text, 0.08)};display:grid;place-items:center;color:${i === 1 ? '#FFFFFF' : p.text};font-weight:860;">${i + 1}</span><div><strong style="font-size:25px;">${label}</strong><p style="font-size:19px;line-height:1.35;color:${alpha(p.text, 0.58)};margin:6px 0 0;">Short, inspectable content block for the generated lesson.</p></div></div>`).join('')}
      </div>
    </div>`;
}

function academicExerciseBody(context, layout, index) {
  const { palette: p } = context;
  return `<div class="num" style="color:${p.secondary};opacity:1;">practice</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:72px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <div style="display:grid;grid-template-columns:1.08fr .92fr;gap:28px;margin-top:56px;">
      <div style="background:${p.text};color:#FFFFFF;border-radius:8px;padding:40px;">
        <div class="num" style="color:rgba(255,255,255,.62);">student task</div>
        <div style="font-size:44px;line-height:1.1;font-weight:860;margin-top:36px;">Choose, write, compare, then explain your answer.</div>
        <ol style="font-size:24px;line-height:1.58;color:rgba(255,255,255,.72);margin:42px 0 0;padding-left:28px;">
          <li>Read the prompt carefully.</li>
          <li>Make one answer visible.</li>
          <li>Defend it with evidence.</li>
        </ol>
      </div>
      <div style="display:grid;gap:16px;">
        ${['A', 'B', 'C'].map((letter, i) => `<div style="height:104px;border-radius:8px;background:${i === 1 ? p.accent : '#FFFFFF'};border:1px solid ${alpha(p.text, 0.12)};color:${i === 1 ? '#FFFFFF' : p.text};display:flex;align-items:center;gap:22px;padding:0 28px;">
          <span style="width:46px;height:46px;border-radius:50%;background:${i === 1 ? 'rgba(0,0,0,.16)' : p.fog};display:grid;place-items:center;font-weight:860;">${letter}</span>
          <strong style="font-size:27px;">${['Possible answer', 'Best supported answer', 'Common distractor'][i]}</strong>
        </div>`).join('')}
      </div>
    </div>`;
}

function academicReadingBody(context, layout, index) {
  const { palette: p } = context;
  return `<div class="num" style="color:${p.secondary};opacity:1;">reading evidence</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:70px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <div style="display:grid;grid-template-columns:.82fr 1.18fr;gap:28px;margin-top:58px;">
      <div style="background:${p.text};color:#FFFFFF;border-radius:8px;padding:42px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1.22;">"Evidence becomes useful when students can point to it, not just remember it."</div>
        <div style="height:8px;width:160px;background:${p.accent};border-radius:999px;margin-top:42px;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
        ${['Text clue', 'Interpretation', 'Vocabulary', 'Discussion'].map((label, i) => `<div style="background:#FFFFFF;border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:30px;">
          <div class="num" style="color:${i % 2 ? p.secondary : p.accent};opacity:1;">${label}</div>
          <p style="font-size:23px;line-height:1.34;color:${alpha(p.text, 0.66)};margin:24px 0 0;">A generated slot for source material, teacher notes, or learner response.</p>
        </div>`).join('')}
      </div>
    </div>`;
}

function academicCharacterBody(context, layout, index) {
  const { palette: p } = context;
  return `<div class="num" style="color:${p.secondary};opacity:1;">character system</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:70px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:28px;margin-top:54px;">
      <div style="background:#FFFFFF;border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:34px;height:420px;position:relative;">
        <svg viewBox="0 0 630 352" aria-label="Character relationship map" style="width:630px;height:352px;display:block;">
          <path d="M150 172H316M316 172H486M316 172L232 294M316 172L406 294M316 172L250 66M316 172L402 66" stroke="${alpha(p.text, 0.18)}" stroke-width="4" stroke-linecap="round"/>
          ${[
            [316, 172, 76, p.accent, 'Protagonist'],
            [150, 172, 58, p.fog, 'Ally'],
            [486, 172, 58, p.text, 'Foil'],
            [250, 66, 50, p.secondary, 'Mentor'],
            [402, 66, 50, p.fog, 'Pressure'],
            [232, 294, 50, p.fog, 'Family'],
            [406, 294, 50, p.secondary, 'Choice'],
          ].map(([cx, cy, r, color, label]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/><text x="${cx}" y="${cy + 6}" text-anchor="middle" fill="${color === p.text || color === p.accent || color === p.secondary ? '#FFFFFF' : p.text}" font-size="${r > 60 ? 21 : 18}" font-weight="860">${escapeHtml(label)}</text>`).join('')}
        </svg>
      </div>
      <div style="display:grid;gap:16px;">
        ${[
          ['Want', 'What the character is trying to protect or gain.'],
          ['Pressure', 'What forces a visible choice.'],
          ['Evidence', 'A quote, action, or contrast that proves the reading.'],
        ].map(([label, copy], i) => `<div style="background:${i === 1 ? p.text : i === 2 ? p.fog : '#FFFFFF'};color:${i === 1 ? '#FFFFFF' : p.text};border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:28px;min-height:128px;">
          <div class="num" style="color:${i === 1 ? 'rgba(255,255,255,.65)' : i === 2 ? p.secondary : p.accent};opacity:1;">${escapeHtml(label)}</div>
          <p style="font-size:23px;line-height:1.31;margin:18px 0 0;color:${i === 1 ? 'rgba(255,255,255,.7)' : alpha(p.text, 0.64)};">${escapeHtml(copy)}</p>
        </div>`).join('')}
      </div>
    </div>`;
}

function academicVocabularyBody(context, layout, index) {
  const { palette: p } = context;
  return `<div class="num" style="color:${p.secondary};opacity:1;">language lab</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:70px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <div style="display:grid;grid-template-columns:.88fr 1.12fr;gap:28px;margin-top:54px;">
      <div style="background:${p.text};color:#FFFFFF;border-radius:8px;padding:38px;">
        <div class="num" style="color:rgba(255,255,255,.62);">word focus</div>
        <div style="font-size:86px;line-height:.95;font-weight:880;margin-top:48px;">context</div>
        <p style="font-size:25px;line-height:1.36;color:rgba(255,255,255,.72);margin-top:34px;">Students infer meaning from sentence clues before checking a definition.</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
        ${[
          ['Text clue', 'What nearby words help?'],
          ['Inference', 'Best guessed meaning'],
          ['Definition', 'Clean student wording'],
          ['Use it', 'One new sentence'],
        ].map(([label, copy], i) => `<div style="background:${i === 1 ? p.accent : '#FFFFFF'};color:${i === 1 ? '#FFFFFF' : p.text};border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:30px;">
          <div class="num" style="color:${i === 1 ? 'rgba(255,255,255,.72)' : i === 2 ? p.secondary : p.accent};opacity:1;">${escapeHtml(label)}</div>
          <p style="font-size:24px;line-height:1.3;margin:30px 0 0;color:${i === 1 ? 'rgba(255,255,255,.82)' : alpha(p.text, 0.66)};">${escapeHtml(copy)}</p>
          <div style="height:7px;border-radius:999px;background:${i === 1 ? 'rgba(255,255,255,.3)' : alpha(p.text, 0.1)};margin-top:28px;overflow:hidden;"><div style="width:${[72, 54, 86, 64][i]}%;height:100%;background:${i === 1 ? '#FFFFFF' : i === 2 ? p.secondary : p.accent};"></div></div>
        </div>`).join('')}
      </div>
    </div>`;
}

function academicAnalysisBody(context, layout, index) {
  const { palette: p } = context;
  return `<div class="num" style="color:${p.secondary};opacity:1;">interpretation frame</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:70px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:58px;">
      ${[
        ['Claim', 'Name the reading in one sentence.', p.text],
        ['Evidence', 'Point to text, action, or contrast.', p.accent],
        ['Meaning', 'Explain why it matters to the chapter.', p.fog],
      ].map(([label, copy, color], i) => `<div style="height:390px;background:${color};color:${color === p.text || color === p.accent ? '#FFFFFF' : p.text};border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:34px;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div class="num" style="color:${color === p.text || color === p.accent ? 'rgba(255,255,255,.68)' : p.secondary};opacity:1;">0${i + 1} · ${escapeHtml(label)}</div>
          <p style="font-size:31px;line-height:1.18;font-weight:820;margin:42px 0 0;color:${color === p.text || color === p.accent ? 'rgba(255,255,255,.86)' : alpha(p.text, 0.74)};">${escapeHtml(copy)}</p>
        </div>
        <svg viewBox="0 0 280 70" aria-label="Analysis cue line" style="width:280px;height:70px;display:block;">
          <path d="M8 52C78 18 126 58 184 26C218 8 244 12 272 22" fill="none" stroke="${color === p.text || color === p.accent ? '#FFFFFF' : p.accent}" stroke-width="7" stroke-linecap="round" opacity=".74"/>
        </svg>
      </div>`).join('')}
    </div>`;
}

function academicResponseBody(context, layout, index) {
  const { palette: p } = context;
  return `<div class="num" style="color:${p.secondary};opacity:1;">student response</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:70px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <div style="display:grid;grid-template-columns:.82fr 1.18fr;gap:28px;margin-top:54px;">
      <div style="background:${p.accent};color:#FFFFFF;border-radius:8px;padding:38px;">
        <div class="num" style="color:rgba(255,255,255,.68);">prompt</div>
        <div style="font-size:43px;line-height:1.12;font-weight:860;margin-top:42px;">Turn the reading into a defendable response.</div>
        <p style="font-size:24px;line-height:1.35;color:rgba(255,255,255,.76);margin-top:34px;">Use one claim, one quote, and one explanation.</p>
      </div>
      <div style="background:#FFFFFF;border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:34px;">
        <div style="display:grid;grid-template-columns:160px 1fr;gap:22px;align-items:start;">
          <div class="num" style="color:${p.secondary};opacity:1;">draft area</div>
          <div style="display:grid;gap:22px;">
            ${['Claim', 'Evidence', 'Reasoning', 'Revision note'].map((label, i) => `<div style="display:grid;grid-template-columns:120px 1fr;gap:22px;align-items:center;">
              <strong style="font-size:24px;color:${i === 1 ? p.accent : p.text};">${escapeHtml(label)}</strong>
              <div style="height:${i === 2 ? 92 : 58}px;background:${p.fog};border-radius:8px;border:1px solid ${alpha(p.text, 0.08)};"></div>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

function academicTimelineBody(context, layout, index) {
  const { palette: p } = context;
  return `<div class="num" style="color:${p.secondary};opacity:1;">sequence</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:72px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <div style="margin-top:74px;height:330px;position:relative;">
      <div style="position:absolute;left:0;right:0;top:160px;height:2px;background:${alpha(p.text, 0.16)};"></div>
      ${['Open', 'Model', 'Practice', 'Reflect'].map((label, i) => `<div style="position:absolute;left:${i * 285}px;top:${i % 2 ? 96 : 32}px;width:220px;">
        <div style="width:54px;height:54px;border-radius:50%;background:${i === 2 ? p.accent : p.fog};border:1px solid ${alpha(p.text, 0.12)};"></div>
        <strong style="display:block;font-size:30px;margin-top:22px;">${label}</strong>
        <p style="font-size:19px;line-height:1.34;color:${alpha(p.text, 0.58)};">phase ${i + 1} learning action</p>
      </div>`).join('')}
    </div>`;
}

function academicProgressBody(context, layout, index) {
  const { palette: p } = context;
  return `<div class="num" style="color:${p.secondary};opacity:1;">progress check</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:72px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px;margin-top:74px;">
      ${[
        ['Accuracy', 78, p.accent],
        ['Confidence', 64, p.secondary],
        ['Participation', 86, p.accent],
      ].map(([label, value, color]) => `<div style="background:#FFFFFF;border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:34px;">
        <div class="num">${label}</div>
        <strong style="display:block;font-size:74px;margin-top:30px;">${value}%</strong>
        <div style="height:14px;border-radius:999px;background:${alpha(p.text, 0.1)};overflow:hidden;margin-top:28px;"><div style="width:${value}%;height:100%;background:${color};"></div></div>
      </div>`).join('')}
    </div>`;
}

function academicSummaryBody(context, layout, index) {
  const { palette: p } = context;
  return `<div class="num" style="color:${p.secondary};opacity:1;">wrap-up</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:76px;line-height:1.04;font-weight:760;margin:28px 0 0;color:${p.text};">${escapeHtml(layout.name)}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:64px;">
      ${['What changed?', 'What can learners do now?', 'What needs practice?', 'What comes next?'].map((label, i) => `<div style="background:${i === 0 ? p.text : '#FFFFFF'};color:${i === 0 ? '#FFFFFF' : p.text};border:1px solid ${alpha(p.text, 0.12)};border-radius:8px;padding:34px;min-height:148px;">
        <strong style="font-size:31px;">${label}</strong>
        <p style="font-size:20px;line-height:1.34;color:${i === 0 ? 'rgba(255,255,255,.68)' : alpha(p.text, 0.6)};margin:18px 0 0;">Clear close-out prompt for the generated lesson.</p>
      </div>`).join('')}
    </div>`;
}

function classifyLayout(context, layout, index) {
  const text = `${layout.id} ${layout.name} ${layout.role}`.toLowerCase();
  if (index === 0 || hasAny(text, ['title', 'opening thesis'])) return 'title';
  if (hasAny(text, ['executive', 'summary', 'snapshot', 'brief', 'who we are', 'key facts', 'one-page'])) return 'summary';
  if (hasAny(text, ['dashboard', 'kpi', 'metrics', 'monitoring', 'status', 'scoreboard', 'progress', 'impact'])) return 'metric';
  if (hasAny(text, ['trend', 'forecast', 'gdp', 'industry statistics', 'revenue', 'cost', 'financial', 'budget', 'valuation', 'roi', 'unit economics', 'market size', 'macro', 'traction', 'population', 'trade'])) return 'chart';
  if (hasAny(text, ['timeline', 'roadmap', 'history', 'agenda', 'schedule', 'countdown', 'milestone', 'journey', 'path'])) return 'timeline';
  if (hasAny(text, ['architecture', 'stakeholder', 'dependency', 'ecosystem', 'process', 'workstream', 'operating', 'operations map', 'context map', 'governance', 'implementation model', 'technology stack', 'solution overview', 'methodology', 'pavilion', 'demo flow'])) return 'network';
  if (hasAny(text, ['risk', 'gap', 'swot', 'challenge', 'option', 'comparison', 'competitive', 'policy', 'decision request', 'scope', 'boundaries', 'issue log', 'regulation'])) return 'matrix';
  if (hasAny(text, ['map location', 'venue map', 'regional map', 'geographic', 'cities', 'setting map', 'location', 'country map', 'presence'])) return 'geo';
  if (hasAny(text, ['teaching', 'exercise', 'question', 'quiz', 'matching', 'blank', 'answer', 'vocabulary', 'role play', 'reading', 'lesson', 'game', 'worksheet', 'homework', 'comprehension', 'warm-up', 'student'])) return 'education';
  if (hasAny(text, ['image', 'photo', 'showcase', 'team', 'founder', 'portfolio', 'case study', 'story', 'culture', 'tourism', 'product', 'speaker', 'logos', 'awards'])) return 'image';
  if (hasAny(text, ['quote', 'excerpt', 'evidence', 'sources', 'research', 'notes'])) return 'evidence';
  if (hasAny(text, ['closing', 'thank', 'contact', 'next steps', 'recommendation', 'commitment', 'cta', 'visit'])) return 'close';
  return 'narrative';
}

function titleSlide(context, layout, index) {
  const { palette: p, title, tagline } = context;
  if (isLearningScenario(context)) return academicTitleSlide(context, layout, index);
  if (context.scenario.includes('country')) return countryTitleSlide(context, layout, index);
  if (context.scenario.includes('technical')) return technicalTitleSlide(context, layout, index);
  const bg = p.text;
  return baseSlide(context, layout, index, {
    bg,
    fg: '#FFFFFF',
    body: `
<div style="position:absolute;left:112px;top:190px;width:1040px;">
  <div style="width:92px;height:10px;border-radius:999px;background:${p.accent};margin-bottom:42px;"></div>
  <h2 class="title" style="font-size:104px;line-height:.96;color:#FFFFFF;letter-spacing:0;">${escapeHtml(title.replace(/^YDeck\s+/, ''))}</h2>
  <p class="copy" style="width:780px;color:rgba(255,255,255,.70);margin-top:38px;">${escapeHtml(tagline)}</p>
</div>
<div style="position:absolute;right:112px;top:188px;width:474px;height:610px;border-left:1px solid rgba(255,255,255,.18);padding-left:54px;">
  <div class="num" style="color:rgba(255,255,255,.56);">Preview system</div>
  <div style="font-size:42px;line-height:1.04;font-weight:860;margin-top:28px;color:#FFFFFF;">25 layout options, selected by deck flow.</div>
  <div style="position:absolute;left:54px;right:0;bottom:0;display:grid;gap:14px;">
    ${coverLine('Scenario', context.scenario, p.accent)}
    ${coverLine('Format', 'HTML-first slides', p.secondary)}
    ${coverLine('Canvas', '1920 x 1080', p.accent)}
  </div>
</div>`,
  });
}

function academicTitleSlide(context, layout, index) {
  const { palette: p, title, tagline } = context;
  return baseSlide(context, layout, index, {
    bg: p.porcelain,
    fg: p.text,
    eyebrow: p.secondary,
    body: `
<div style="position:absolute;left:170px;top:190px;width:1040px;">
  <div class="num" style="color:${p.secondary};opacity:1;">${escapeHtml(context.scenario)} · preview module</div>
  <h2 style="margin:92px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:104px;line-height:.98;font-weight:760;letter-spacing:-1px;color:${p.text};">${escapeHtml(title.replace(/^YDeck\s+/, ''))}</h2>
  <p style="font-size:28px;line-height:1.42;color:${alpha(p.text, 0.62)};width:640px;margin:72px 0 0;">${escapeHtml(tagline)}</p>
</div>
<div style="position:absolute;right:170px;bottom:132px;display:flex;gap:16px;">
  <span style="font-family:Menlo,monospace;font-size:17px;border:1px solid ${alpha(p.text, 0.12)};background:${p.fog};padding:10px 16px;border-radius:4px;">25 layouts</span>
  <span style="font-family:Menlo,monospace;font-size:17px;border:1px solid ${alpha(p.text, 0.12)};background:${p.fog};padding:10px 16px;border-radius:4px;">classroom-ready</span>
  <span style="font-family:Menlo,monospace;font-size:17px;border:1px solid ${alpha(p.text, 0.12)};background:${p.fog};padding:10px 16px;border-radius:4px;">static HTML</span>
</div>`,
  });
}

function countryTitleSlide(context, layout, index) {
  const { palette: p, title, tagline } = context;
  return baseSlide(context, layout, index, {
    bg: p.text,
    fg: '#FFFFFF',
    body: `
<div style="position:absolute;left:112px;top:168px;width:720px;">
  <div class="num" style="color:${p.accent};opacity:1;">country intelligence deck</div>
  <h2 class="title" style="font-size:94px;color:#FFFFFF;margin-top:34px;">${escapeHtml(title.replace(/^YDeck\s+/, ''))}</h2>
  <p class="copy" style="color:rgba(255,255,255,.70);width:650px;">${escapeHtml(tagline)}</p>
</div>
<svg viewBox="0 0 760 760" aria-label="Editorial globe cover" style="position:absolute;right:40px;top:130px;width:760px;height:760px;">
  <circle cx="380" cy="380" r="270" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="2"/>
  <circle cx="380" cy="380" r="190" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
  <path d="M162 422C230 312 336 344 398 252C464 154 564 216 626 314" fill="none" stroke="${p.accent}" stroke-width="10" stroke-linecap="round"/>
  <path d="M196 514C314 440 404 526 550 392" fill="none" stroke="${p.secondary}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="398" cy="252" r="26" fill="${p.accent}"/><circle cx="550" cy="392" r="20" fill="${p.secondary}"/>
</svg>`,
  });
}

function technicalTitleSlide(context, layout, index) {
  const { palette: p, title, tagline } = context;
  return baseSlide(context, layout, index, {
    bg: p.text,
    fg: '#FFFFFF',
    body: `
<div style="position:absolute;left:112px;top:158px;width:860px;">
  <div class="num" style="color:${p.accent};opacity:1;">architecture review</div>
  <h2 class="title" style="font-size:96px;color:#FFFFFF;margin-top:38px;">${escapeHtml(title.replace(/^YDeck\s+/, ''))}</h2>
  <p class="copy" style="width:720px;color:rgba(255,255,255,.70);">${escapeHtml(tagline)}</p>
</div>
<div style="position:absolute;right:112px;top:162px;width:620px;height:650px;border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:44px;">
  ${nodeStrip('API edge', p.accent)}
  ${nodeStrip('Service mesh', p.secondary)}
  ${nodeStrip('Data plane', p.accent)}
  ${nodeStrip('Security layer', p.secondary)}
</div>`,
  });
}

function executiveSummarySlide(context, layout, index) {
  const { palette: p } = context;
  const cards = summaryLabels(context, layout);
  return baseSlide(context, layout, index, {
    bg: p.porcelain,
    fg: p.text,
    body: `
<div style="position:absolute;left:112px;top:186px;width:610px;">
  <h2 class="title">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="color:${alpha(p.text, 0.68)};">A sharp briefing slide with a clear claim, proof, implication, and action path.</p>
  <div style="margin-top:40px;width:520px;height:16px;border-radius:999px;background:${alpha(p.text, 0.1)};overflow:hidden;"><div style="width:${60 + (index % 4) * 8}%;height:100%;background:${p.accent};border-radius:999px;"></div></div>
</div>
<div style="position:absolute;right:112px;top:156px;width:900px;display:grid;grid-template-columns:1.05fr .95fr;grid-template-rows:262px 262px;gap:22px;">
  <div class="card" style="grid-row:span 2;background:${p.text};color:#FFFFFF;padding:42px;">
    ${inlineIcon('compass', p.accent, 76)}
    <div style="font-size:28px;color:rgba(255,255,255,.62);margin-top:34px;">Primary readout</div>
    <strong style="display:block;font-size:98px;line-height:.95;margin-top:18px;">${58 + index * 3}%</strong>
    <p style="font-size:27px;line-height:1.32;color:rgba(255,255,255,.72);margin-top:30px;">The story is organized around decision quality, not decorative filler.</p>
  </div>
  ${cards.map((card, i) => `<div class="card" style="background:${i === 1 ? p.fog : '#FFFFFF'};color:${p.text};">
    ${inlineIcon(card.icon, i === 1 ? p.secondary : p.accent, 58)}
    <h3 style="font-size:34px;line-height:1.08;margin:24px 0 0;">${escapeHtml(card.title)}</h3>
    <p style="font-size:22px;line-height:1.32;color:${alpha(p.text, 0.66)};">${escapeHtml(card.copy)}</p>
  </div>`).join('')}
</div>`,
  });
}

function geoMapSlide(context, layout, index) {
  const { palette: p } = context;
  return baseSlide(context, layout, index, {
    bg: p.porcelain,
    fg: p.text,
    body: `
<div style="position:absolute;left:112px;top:176px;width:620px;">
  <h2 class="title">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="color:${alpha(p.text, 0.68)};">A spatial overview with labeled zones, movement lines, and contextual facts.</p>
  <div style="margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:16px;width:560px;">
    ${metricTile('4', 'priority zones', p.accent, p.text)}
    ${metricTile(`${index + 6}`, 'field signals', p.secondary, p.text)}
  </div>
</div>
<div style="position:absolute;right:112px;top:132px;width:930px;height:660px;">
  <svg viewBox="0 0 930 660" aria-label="Spatial map with regional callouts" style="width:930px;height:660px;display:block;">
    <rect width="930" height="660" rx="8" fill="${p.fog}"/>
    <g stroke="${alpha(p.text, 0.13)}" stroke-width="2">
      ${Array.from({ length: 7 }, (_, i) => `<path d="M${98 + i * 104} 58V602"/>`).join('')}
      ${Array.from({ length: 5 }, (_, i) => `<path d="M64 ${116 + i * 100}H866"/>`).join('')}
    </g>
    <path d="M156 370C198 248 322 216 410 282C506 352 594 192 724 212C796 224 828 294 802 362C774 434 676 420 620 488C550 572 438 500 368 536C276 584 150 514 156 370Z" fill="#FFFFFF" stroke="${alpha(p.text, 0.18)}" stroke-width="3"/>
    <path d="M214 396C282 310 346 332 420 292C500 250 550 280 636 226C700 188 748 210 792 252" fill="none" stroke="${p.accent}" stroke-width="8" stroke-linecap="round"/>
    <path d="M262 468C344 410 430 454 500 394C574 332 660 354 738 314" fill="none" stroke="${p.secondary}" stroke-width="6" stroke-linecap="round" opacity=".9"/>
    ${mapPin(214, 396, p.accent, 'Hub')}
    ${mapPin(420, 292, p.secondary, 'Growth')}
    ${mapPin(636, 226, p.accent, 'Signal')}
    ${mapPin(738, 314, p.secondary, 'Entry')}
    <rect x="80" y="70" width="266" height="116" rx="8" fill="#FFFFFF" stroke="${alpha(p.text, 0.13)}"/>
    <text x="112" y="120" fill="${p.text}" font-size="25" font-weight="860">Coverage model</text>
    <text x="112" y="158" fill="${p.text}" opacity=".62" font-size="21">region, access, demand</text>
    <rect x="624" y="486" width="238" height="94" rx="8" fill="${p.text}"/>
    <text x="652" y="530" fill="#FFFFFF" font-size="25" font-weight="860">Decision zone</text>
    <text x="652" y="564" fill="#FFFFFF" opacity=".68" font-size="20">best fit cluster</text>
  </svg>
</div>`,
  });
}

function metricDashboardSlide(context, layout, index) {
  const { palette: p } = context;
  const values = [84, 67, 73, 91].map((v, i) => Math.max(42, v - ((index + i) % 5) * 4));
  return baseSlide(context, layout, index, {
    bg: p.fog,
    fg: p.text,
    body: `
<div style="position:absolute;left:112px;top:160px;width:660px;">
  <h2 class="title">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="color:${alpha(p.text, 0.68)};">A dense operating view with leading indicators, variance, and directional movement.</p>
</div>
<div style="position:absolute;right:112px;top:132px;width:920px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
  ${values.map((value, i) => `<div class="card" style="height:154px;background:${i === 3 ? p.text : '#FFFFFF'};color:${i === 3 ? '#FFFFFF' : p.text};">
    <div class="num">${['Reach', 'Quality', 'Velocity', 'Confidence'][i]}</div>
    <strong style="display:block;font-size:48px;margin-top:14px;">${value}%</strong>
    <span style="font-size:19px;color:${i === 3 ? alpha('#FFFFFF', 0.72) : i === 1 ? p.secondary : p.accent};font-weight:800;">${i === 1 ? 'watch' : '+ signal'}</span>
  </div>`).join('')}
</div>
<div style="position:absolute;left:112px;right:112px;top:350px;height:430px;display:grid;grid-template-columns:1.2fr .8fr;gap:24px;">
  <div style="border:1px solid ${alpha(p.text, 0.13)};border-radius:8px;background:#FFFFFF;padding:34px 38px;">
    <div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:29px;font-weight:860;">Performance ribbon</div><div class="pill" style="background:${p.fog};color:${p.text};">Actual vs plan</div></div>
    ${ribbonChart(p, index)}
  </div>
  <div style="border:1px solid ${alpha(p.text, 0.13)};border-radius:8px;background:#FFFFFF;padding:34px;">
    <div style="font-size:29px;font-weight:860;">Signal stack</div>
    <div style="display:grid;gap:24px;margin-top:30px;">${['Acquisition', 'Activation', 'Retention', 'Expansion'].map((label, i) => progressRow(label, values[i], i === 1 ? p.secondary : p.accent, p)).join('')}</div>
    <div style="margin-top:34px;padding-top:24px;border-top:1px solid ${alpha(p.text, 0.12)};font-size:24px;line-height:1.34;color:${alpha(p.text, 0.72)};"><strong style="color:${p.text};">Operator note:</strong> route resources to the highest-conversion lane.</div>
  </div>
</div>`,
  });
}

function chartSlide(context, layout, index) {
  const { palette: p } = context;
  const variants = [areaChart, waterfallChart, stackedBarsChart, bulletBarsChart, donutLedgerChart, rangeChart];
  const chart = variants[index % variants.length](p, index);
  return baseSlide(context, layout, index, {
    bg: p.fog,
    fg: p.text,
    body: `
<h2 class="title" style="position:absolute;left:112px;top:172px;width:790px;">${escapeHtml(layout.name)}</h2>
<div style="position:absolute;left:112px;top:356px;width:530px;height:362px;background:${p.text};color:#FFFFFF;border-radius:8px;padding:46px;">
  <div style="font-size:22px;color:rgba(255,255,255,.62);">Primary signal</div>
  <strong style="display:block;font-size:104px;line-height:.9;margin-top:42px;">${42 + ((index * 7) % 50)}%</strong>
  <p style="font-size:27px;line-height:1.28;color:rgba(255,255,255,.72);">A chart-led slide with one clear readout and a meaningful supporting view.</p>
</div>
<div style="position:absolute;right:112px;top:230px;width:860px;height:540px;border:1px solid ${alpha(p.text, 0.13)};border-radius:8px;background:#FFFFFF;color:${p.text};padding:38px;">
  <div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:30px;font-weight:860;">${escapeHtml(chart.title)}</div><div class="pill" style="background:${p.fog};color:${p.text};">${escapeHtml(chart.label)}</div></div>
  ${chart.svg}
</div>`,
  });
}

function timelineSlide(context, layout, index) {
  const { palette: p } = context;
  const stages = timelineLabels(context, layout);
  return baseSlide(context, layout, index, {
    bg: p.porcelain,
    fg: p.text,
    body: `
<div style="position:absolute;left:112px;top:170px;width:720px;">
  <h2 class="title">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="color:${alpha(p.text, 0.68)};">Milestones are shown as a paced roadmap with owners, dependencies, and visible decision gates.</p>
</div>
<div style="position:absolute;right:112px;top:160px;width:840px;height:620px;border-radius:8px;background:${p.text};padding:42px;color:#FFFFFF;">
  <svg viewBox="0 0 756 484" aria-label="Roadmap timeline" style="width:756px;height:484px;display:block;">
    <g stroke="rgba(255,255,255,.16)" stroke-width="2">${[82, 174, 266, 358].map((y) => `<path d="M68 ${y}H704"/>`).join('')}</g>
    <path d="M82 408H704" stroke="rgba(255,255,255,.28)" stroke-width="3"/>
    ${stages.map((stage, i) => roadmapItem(stage, i, p, index)).join('')}
    <path d="M92 334C198 300 268 330 350 244C432 158 538 204 666 126" fill="none" stroke="${p.secondary}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="666" cy="126" r="18" fill="${p.secondary}"/>
  </svg>
</div>
<div style="position:absolute;left:112px;bottom:148px;width:620px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
  ${metricTile('03', 'decision gates', p.accent, p.text)}
  ${metricTile('90d', 'execution horizon', p.secondary, p.text)}
</div>`,
  });
}

function networkSlide(context, layout, index) {
  const { palette: p } = context;
  const model = networkModel(context, layout);
  return baseSlide(context, layout, index, {
    bg: p.porcelain,
    fg: p.text,
    body: `
<div style="position:absolute;left:112px;top:176px;width:610px;">
  <h2 class="title">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="color:${alpha(p.text, 0.68)};">${escapeHtml(model.copy)}</p>
  <div style="margin-top:40px;display:grid;gap:16px;width:560px;">
    ${model.rails.map((label, i) => `<div style="height:76px;border-radius:8px;border:1px solid ${alpha(p.text, 0.12)};background:${i === 1 ? p.text : '#FFFFFF'};color:${i === 1 ? '#FFFFFF' : p.text};display:flex;align-items:center;gap:18px;padding:0 24px;">${inlineIcon(['spark', 'circuit', 'loop'][i], i === 1 ? p.accent : p.secondary, 40)}<strong style="font-size:25px;">${escapeHtml(label)}</strong></div>`).join('')}
  </div>
</div>
<div style="position:absolute;right:112px;top:134px;width:930px;height:650px;">
  <svg viewBox="0 0 930 650" aria-label="System topology diagram" style="width:930px;height:650px;display:block;">
    <rect width="930" height="650" rx="8" fill="${p.fog}"/>
    <g stroke="${alpha(p.text, 0.14)}" stroke-width="2">
      <path d="M116 170H820"/><path d="M116 324H820"/><path d="M116 478H820"/>
      <path d="M300 92V560"/><path d="M558 92V560"/>
    </g>
    ${nodeBox(96, 124, 218, 106, model.nodes[0].title, model.nodes[0].sub, p.accent, p)}
    ${nodeBox(356, 96, 218, 134, model.nodes[1].title, model.nodes[1].sub, p.secondary, p)}
    ${nodeBox(616, 124, 218, 106, model.nodes[2].title, model.nodes[2].sub, p.accent, p)}
    ${nodeBox(166, 300, 218, 106, model.nodes[3].title, model.nodes[3].sub, p.secondary, p)}
    ${nodeBox(478, 300, 218, 106, model.nodes[4].title, model.nodes[4].sub, p.accent, p)}
    ${nodeBox(296, 472, 338, 106, model.nodes[5].title, model.nodes[5].sub, p.text, p)}
    <g fill="none" stroke="${p.accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M314 177H348"/><path d="M574 177H608"/><path d="M384 354H470"/><path d="M465 230V294"/><path d="M512 408V466"/>
      <path d="M600 534C720 500 772 420 736 322"/>
    </g>
    <circle cx="736" cy="322" r="18" fill="${p.secondary}"/>
  </svg>
</div>`,
  });
}

function matrixSlide(context, layout, index) {
  const { palette: p } = context;
  const variant = index % 4;
  const visual = [
    riskHeatmap(p),
    optionScorecard(p),
    swotBoard(p),
    policyGapLadder(p),
  ][variant];
  return baseSlide(context, layout, index, {
    bg: p.fog,
    fg: p.text,
    body: `
<div style="position:absolute;left:112px;top:178px;width:620px;">
  <h2 class="title">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="color:${alpha(p.text, 0.68)};">Tradeoffs are made explicit with weighted criteria, controls, and a visible recommendation.</p>
</div>
<div style="position:absolute;right:112px;top:146px;width:902px;height:620px;border-radius:8px;background:#FFFFFF;border:1px solid ${alpha(p.text, 0.13)};padding:38px;">
  <div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:30px;font-weight:860;">${escapeHtml(visual.title)}</div><div class="pill" style="background:${p.fog};color:${p.text};">${escapeHtml(visual.label)}</div></div>
  ${visual.svg}
</div>
<div style="position:absolute;left:112px;bottom:152px;width:610px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
  ${metricTile('2', 'watch items', p.secondary, p.text)}
  ${metricTile('1', 'recommended path', p.accent, p.text)}
</div>`,
  });
}

function educationSlide(context, layout, index) {
  const { palette: p } = context;
  return baseSlide(context, layout, index, {
    bg: p.porcelain,
    fg: p.text,
    body: `
<div style="position:absolute;left:112px;top:172px;width:610px;">
  <h2 class="title">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="color:${alpha(p.text, 0.68)};">A classroom-ready slide with prompts, response areas, and a visible check-for-understanding pattern.</p>
</div>
<div style="position:absolute;right:112px;top:148px;width:890px;height:620px;border-radius:8px;background:${p.text};padding:38px;color:#FFFFFF;">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;height:100%;">
    <div style="border-radius:8px;background:rgba(255,255,255,.08);padding:32px;">
      <div class="num">Prompt</div>
      <div style="font-size:48px;line-height:1.08;font-weight:880;margin-top:42px;">Choose the strongest answer.</div>
      <div style="margin-top:42px;display:grid;gap:14px;">
        ${['A', 'B', 'C'].map((letter, i) => `<div style="height:68px;border-radius:8px;background:${i === 1 ? p.accent : 'rgba(255,255,255,.08)'};display:flex;align-items:center;padding:0 22px;font-size:25px;font-weight:820;"><span style="width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,.16);display:grid;place-items:center;margin-right:18px;">${letter}</span>${['Context clue', 'Best evidence', 'Distractor'][i]}</div>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-rows:1fr 1fr;gap:18px;">
      <div style="border-radius:8px;background:#FFFFFF;color:${p.text};padding:30px;">
        ${inlineIcon('pencil', p.secondary, 60)}
        <h3 style="font-size:34px;margin:24px 0 0;">Response space</h3>
        <div style="margin-top:24px;display:grid;gap:16px;">${[1,2,3].map(() => `<div style="height:18px;background:${alpha(p.text, 0.12)};border-radius:999px;"></div>`).join('')}</div>
      </div>
      <div style="border-radius:8px;background:${p.fog};color:${p.text};padding:30px;">
        <div style="font-size:26px;font-weight:860;">Teacher check</div>
        ${progressRow('Accuracy', 78, p.accent, p)}
        ${progressRow('Confidence', 64, p.secondary, p)}
      </div>
    </div>
  </div>
</div>`,
  });
}

function imageFeatureSlide(context, layout, index) {
  const { palette: p } = context;
  return baseSlide(context, layout, index, {
    bg: p.porcelain,
    fg: p.text,
    body: `
<div style="position:absolute;left:112px;top:174px;width:590px;">
  <h2 class="title">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="color:${alpha(p.text, 0.68)};">A strong image-ready composition with annotation rails and space for generated or uploaded visuals.</p>
  <div style="margin-top:42px;display:grid;gap:18px;">${['Hero visual', 'Detail crop', 'Callout note'].map((label, i) => `<div style="height:78px;border-radius:8px;background:${i === 0 ? p.text : '#FFFFFF'};border:1px solid ${alpha(p.text, 0.13)};color:${i === 0 ? '#FFFFFF' : p.text};display:flex;align-items:center;gap:18px;padding:0 24px;">${inlineIcon(['aperture','crop','pin'][i], i === 0 ? p.accent : p.secondary, 40)}<strong style="font-size:25px;">${label}</strong></div>`).join('')}</div>
</div>
<div style="position:absolute;right:112px;top:126px;width:930px;height:670px;">
  <svg viewBox="0 0 930 670" aria-label="Image feature placeholder with annotations" style="width:930px;height:670px;display:block;">
    <rect width="930" height="670" rx="8" fill="${p.fog}"/>
    <rect x="54" y="54" width="600" height="562" rx="8" fill="${p.text}"/>
    <path d="M54 520C150 416 238 462 318 330C402 190 502 230 654 106V616H54Z" fill="${p.accent}" opacity=".24"/>
    <circle cx="246" cy="238" r="92" fill="${p.secondary}" opacity=".5"/>
    <rect x="690" y="86" width="186" height="126" rx="8" fill="#FFFFFF" stroke="${alpha(p.text, 0.13)}"/>
    <text x="718" y="132" fill="${p.text}" font-size="24" font-weight="860">Callout 01</text>
    <text x="718" y="168" fill="${p.text}" opacity=".62" font-size="19">main signal</text>
    <rect x="690" y="268" width="186" height="126" rx="8" fill="#FFFFFF" stroke="${alpha(p.text, 0.13)}"/>
    <text x="718" y="314" fill="${p.text}" font-size="24" font-weight="860">Detail 02</text>
    <text x="718" y="350" fill="${p.text}" opacity=".62" font-size="19">proof point</text>
    <rect x="690" y="450" width="186" height="126" rx="8" fill="${p.text}"/>
    <text x="718" y="496" fill="#FFFFFF" font-size="24" font-weight="860">Action</text>
    <text x="718" y="532" fill="#FFFFFF" opacity=".68" font-size="19">next move</text>
    <g stroke="${p.accent}" stroke-width="4" fill="none" stroke-linecap="round"><path d="M654 150H690"/><path d="M608 330H690"/><path d="M612 512H690"/></g>
  </svg>
</div>`,
  });
}

function evidenceSlide(context, layout, index) {
  const { palette: p } = context;
  return baseSlide(context, layout, index, {
    bg: p.fog,
    fg: p.text,
    body: `
<div style="position:absolute;left:112px;top:158px;width:760px;">
  <h2 class="title">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="color:${alpha(p.text, 0.68)};">Evidence is handled as cited proof, not decorative text blocks.</p>
</div>
<div style="position:absolute;left:112px;right:112px;top:340px;height:430px;display:grid;grid-template-columns:.9fr 1.1fr;gap:24px;">
  <div style="border-radius:8px;background:${p.text};color:#FFFFFF;padding:46px;">
    <div class="num">Source read</div>
    <div style="font-family:Georgia,serif;font-size:46px;line-height:1.15;margin-top:42px;">The claim is only as strong as the evidence chain behind it.</div>
    <div style="margin-top:44px;width:230px;height:10px;border-radius:999px;background:${p.accent};"></div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;">
    ${['Observed pattern', 'Measured effect', 'Decision implication'].map((label, i) => `<div style="border:1px solid ${alpha(p.text, 0.13)};border-radius:8px;background:#FFFFFF;padding:32px;">
      ${inlineIcon(['document','chart','check'][i], i === 1 ? p.secondary : p.accent, 54)}
      <h3 style="font-size:31px;line-height:1.08;margin:30px 0 0;">${label}</h3>
      <p style="font-size:21px;line-height:1.32;color:${alpha(p.text, 0.66)};">Structured proof point with a citation slot and synthesis note.</p>
    </div>`).join('')}
  </div>
</div>`,
  });
}

function closingSlide(context, layout, index) {
  const { palette: p } = context;
  return baseSlide(context, layout, index, {
    bg: p.text,
    fg: '#FFFFFF',
    body: `
<div style="position:absolute;left:112px;top:180px;width:900px;">
  <h2 class="title" style="font-size:86px;color:#FFFFFF;">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="width:760px;color:rgba(255,255,255,.72);">End with a decision, the reasons that support it, and a clear owner for the next step.</p>
</div>
<div style="position:absolute;right:112px;top:174px;width:560px;display:grid;gap:18px;">
  ${['Decision', 'Rationale', 'Owner', 'Date'].map((label, i) => `<div style="height:118px;border-radius:8px;background:${i === 0 ? p.accent : 'rgba(255,255,255,.08)'};border:1px solid rgba(255,255,255,.12);display:grid;grid-template-columns:72px 1fr;align-items:center;padding:0 30px;">
    <div style="width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,.16);display:grid;place-items:center;font-size:20px;font-weight:860;">${i + 1}</div>
    <div><div class="num" style="color:rgba(255,255,255,.7);">${label}</div><strong style="font-size:30px;">${['Approve path', 'Evidence-led', 'Named team', 'Next cycle'][i]}</strong></div>
  </div>`).join('')}
</div>
<div style="position:absolute;left:112px;bottom:132px;width:1180px;height:14px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden;"><div style="width:74%;height:100%;background:${p.secondary};border-radius:999px;"></div></div>`,
  });
}

function narrativeSlide(context, layout, index) {
  const { palette: p } = context;
  return baseSlide(context, layout, index, {
    bg: index % 2 ? p.porcelain : p.fog,
    fg: p.text,
    body: `
<div style="position:absolute;left:112px;top:188px;width:610px;">
  <h2 class="title">${escapeHtml(layout.name)}</h2>
  <p class="copy" style="color:${alpha(p.text, 0.68)};">A flexible content slide with composition variety, modern iconography, and useful density.</p>
</div>
<div style="position:absolute;right:112px;top:150px;width:900px;height:630px;display:grid;grid-template-columns:1.1fr .9fr;grid-template-rows:1fr 1fr;gap:22px;">
  <div style="grid-row:span 2;border-radius:8px;background:${p.text};color:#FFFFFF;padding:42px;">
    ${inlineIcon('spark', p.accent, 76)}
    <div style="font-size:54px;line-height:1.06;font-weight:880;margin-top:64px;">Main idea with visible supporting structure.</div>
    <p style="font-size:25px;line-height:1.34;color:rgba(255,255,255,.7);margin-top:34px;">Designed for actual slide content, not empty decorative panels.</p>
  </div>
  ${['Proof', 'Action'].map((label, i) => `<div class="card" style="background:#FFFFFF;color:${p.text};">
    ${inlineIcon(i ? 'arrow' : 'document', i ? p.secondary : p.accent, 58)}
    <h3 style="font-size:34px;margin:26px 0 0;">${label}</h3>
    <p style="font-size:22px;line-height:1.32;color:${alpha(p.text, 0.66)};">A compact block for real examples, data, or next steps.</p>
  </div>`).join('')}
</div>`,
  });
}

function baseSlide(context, layout, index, opts) {
  const { template, palette: p } = context;
  const fg = opts.fg || p.text;
  const academic = isLearningScenario(context);
  const top = opts.hideTopline
    ? ''
    : academic
    ? `<div class="topline"><span>${escapeHtml(template.name)}</span><span>${String(index + 1).padStart(2, '0')} / ${String(Math.min(15, template.layouts.length)).padStart(2, '0')}</span></div>`
    : `<div class="topline"><span>${escapeHtml(template.name)}</span><span>${String(index + 1).padStart(2, '0')} / ${String(Math.min(15, template.layouts.length)).padStart(2, '0')}</span></div>
<div class="eyebrow" style="color:${opts.eyebrow || p.accent};">${escapeHtml(layout.id)}</div>`;
  const footer = academic
    ? `<div class="footer"><span>${escapeHtml(layout.name)}</span><span>${escapeHtml(context.scenario)} · ${template.layouts.length} layouts</span></div>`
    : `<div class="footer"><span>${escapeHtml(layout.name)}</span><span>ydeck-library · professional system</span></div>`;
  return `<section class="ydeck-slide" style="background:${opts.bg};color:${fg};">
${top}
${opts.body}
${footer}
</section>`;
}

function areaChart(p, index) {
  return {
    title: 'Adoption curve',
    label: 'Area trend',
    svg: `<svg viewBox="0 0 780 350" aria-label="Area trend chart" style="margin-top:26px;width:780px;height:350px;display:block;">
      ${chartGrid(p)}
      <path d="M70 292H730" stroke="${alpha(p.text, 0.28)}" stroke-width="3"/>
      <path d="M76 258C152 244 190 218 250 210C316 202 350 160 418 146C506 128 552 92 710 78L710 292H76Z" fill="${p.accent}" fill-opacity=".18"/>
      <path d="M76 258C152 244 190 218 250 210C316 202 350 160 418 146C506 128 552 92 710 78" fill="none" stroke="${p.accent}" stroke-width="6" stroke-linecap="round"/>
      <path d="M76 278C170 262 244 246 328 226C432 202 524 184 710 154" fill="none" stroke="${p.secondary}" stroke-width="5" stroke-linecap="round"/>
      ${axisLabels(p)}
    </svg>`,
  };
}

function waterfallChart(p) {
  return {
    title: 'Variance bridge',
    label: 'Waterfall',
    svg: `<svg viewBox="0 0 780 350" aria-label="Waterfall chart" style="margin-top:26px;width:780px;height:350px;display:block;">
      ${chartGrid(p)}
      <path d="M70 260H730" stroke="${alpha(p.text, 0.28)}" stroke-width="3"/>
      ${[
        [96, 176, 78, p.text, 'Plan'],
        [204, 128, 48, p.accent, 'Sales'],
        [312, 96, 32, p.secondary, 'Mix'],
        [420, 148, 52, '#D9DEE5', 'Cost'],
        [528, 74, 126, p.accent, 'Ops'],
        [636, 58, 202, p.secondary, 'Actual'],
      ].map(([x, y, h, color, label]) => `<rect x="${x}" y="${y}" width="70" height="${h}" rx="8" fill="${color}"/><text x="${x + 35}" y="306" text-anchor="middle" fill="${alpha(p.text, 0.62)}" font-size="17">${label}</text>`).join('')}
      <g stroke="${alpha(p.text, 0.25)}" stroke-width="3"><path d="M166 176H204"/><path d="M274 128H312"/><path d="M382 128H420"/><path d="M490 200H528"/><path d="M598 74H636"/></g>
    </svg>`,
  };
}

function stackedBarsChart(p) {
  return {
    title: 'Source mix',
    label: 'Stacked share',
    svg: `<svg viewBox="0 0 780 350" aria-label="Stacked bar chart" style="margin-top:26px;width:780px;height:350px;display:block;">
      ${chartGrid(p)}
      ${[104, 270, 436, 602].map((x, i) => {
        const a = [174, 202, 148, 216][i];
        const b = [94, 108, 84, 126][i];
        const c = [38, 48, 36, 52][i];
        return `<rect x="${x}" y="${292 - a}" width="86" height="${a}" rx="8" fill="${p.accent}"/><rect x="${x}" y="${292 - b}" width="86" height="${b}" rx="8" fill="${p.secondary}"/><rect x="${x}" y="${292 - c}" width="86" height="${c}" rx="8" fill="#D9DEE5"/><text x="${x + 43}" y="322" text-anchor="middle" fill="${alpha(p.text, 0.62)}" font-size="18">${['Lead','Qual','Prop','Won'][i]}</text>`;
      }).join('')}
    </svg>`,
  };
}

function bulletBarsChart(p) {
  return {
    title: 'Benchmark bars',
    label: 'Target delta',
    svg: `<svg viewBox="0 0 780 350" aria-label="Benchmark bars" style="margin-top:26px;width:780px;height:350px;display:block;">
      <rect x="70" y="58" width="650" height="46" rx="23" fill="${alpha(p.text, 0.09)}"/><rect x="70" y="58" width="520" height="46" rx="23" fill="${p.accent}"/><path d="M628 46V116" stroke="${p.text}" stroke-width="5" stroke-linecap="round"/>
      <rect x="70" y="136" width="650" height="46" rx="23" fill="${alpha(p.text, 0.09)}"/><rect x="70" y="136" width="438" height="46" rx="23" fill="${p.secondary}"/><path d="M558 124V194" stroke="${p.text}" stroke-width="5" stroke-linecap="round"/>
      <rect x="70" y="214" width="650" height="46" rx="23" fill="${alpha(p.text, 0.09)}"/><rect x="70" y="214" width="590" height="46" rx="23" fill="${p.accent}"/><path d="M604 202V272" stroke="${p.text}" stroke-width="5" stroke-linecap="round"/>
      ${['Conversion', 'Capacity', 'Retention'].map((label, i) => `<text x="70" y="${45 + i * 78}" fill="${p.text}" font-size="20" font-weight="820">${label}</text>`).join('')}
    </svg>`,
  };
}

function donutLedgerChart(p) {
  return {
    title: 'Allocation ledger',
    label: 'Donut + list',
    svg: `<svg viewBox="0 0 780 350" aria-label="Donut ledger chart" style="margin-top:26px;width:780px;height:350px;display:block;">
      <circle cx="230" cy="172" r="118" fill="none" stroke="#D9DEE5" stroke-width="42"/>
      <path d="M230 54A118 118 0 0 1 346 194" fill="none" stroke="${p.accent}" stroke-width="42" stroke-linecap="round"/>
      <path d="M346 194A118 118 0 0 1 162 268" fill="none" stroke="${p.secondary}" stroke-width="42" stroke-linecap="round"/>
      <circle cx="230" cy="172" r="62" fill="#FFFFFF"/>
      <text x="230" y="166" text-anchor="middle" font-size="24" font-weight="860" fill="${p.text}">Mix</text>
      <text x="230" y="198" text-anchor="middle" font-size="18" fill="${alpha(p.text, 0.62)}">portfolio</text>
      ${['Core engine', 'Growth bets', 'Reserve'].map((label, i) => `<rect x="460" y="${90 + i * 68}" width="24" height="24" rx="4" fill="${[p.accent,p.secondary,'#D9DEE5'][i]}"/><text x="504" y="${110 + i * 68}" fill="${p.text}" font-size="24" font-weight="820">${label}</text>`).join('')}
    </svg>`,
  };
}

function rangeChart(p) {
  return {
    title: 'Scenario range',
    label: 'Low / base / high',
    svg: `<svg viewBox="0 0 780 350" aria-label="Scenario range chart" style="margin-top:26px;width:780px;height:350px;display:block;">
      ${chartGrid(p)}
      ${[96, 202, 308, 414, 520, 626].map((x, i) => `<line x1="${x}" y1="${250 - i * 22}" x2="${x}" y2="${126 - i * 10}" stroke="${alpha(p.text, 0.2)}" stroke-width="16" stroke-linecap="round"/><circle cx="${x}" cy="${210 - i * 18}" r="22" fill="${i % 2 ? p.secondary : p.accent}"/>`).join('')}
      <path d="M96 210C198 198 270 172 358 158C466 140 542 126 626 112" fill="none" stroke="${p.text}" stroke-width="5" stroke-linecap="round" opacity=".72"/>
      ${axisLabels(p)}
    </svg>`,
  };
}

function ribbonChart(p, index) {
  return `<svg viewBox="0 0 900 292" aria-label="Performance ribbon chart" style="margin-top:22px;width:900px;height:292px;display:block;">
    <g stroke="${alpha(p.text, 0.11)}"><path d="M70 48H850"/><path d="M70 104H850"/><path d="M70 160H850"/><path d="M70 216H850"/><path d="M70 272H850"/></g>
    <path d="M70 272H850" stroke="${alpha(p.text, 0.28)}" stroke-width="3"/>
    ${[106,286,466,646].map((x, i) => `<rect x="${x}" y="${[150,132,104,92][i]}" width="54" height="${272 - [150,132,104,92][i]}" rx="8" fill="#D9DEE5"/><rect x="${x + 64}" y="${[126,106,76,64][i]}" width="54" height="${272 - [126,106,76,64][i]}" rx="8" fill="${i === 3 ? p.secondary : p.accent}"/><text x="${x + 58}" y="286" text-anchor="middle" fill="${alpha(p.text, 0.62)}" font-size="20">Q${i + 1}</text>`).join('')}
    <path d="M132 150C224 130 282 138 376 108C480 75 548 86 656 68C724 56 762 58 816 48" fill="none" stroke="${p.text}" stroke-width="5" stroke-linecap="round" opacity=".72"/>
  </svg>`;
}

function riskHeatmap(p) {
  return {
    title: 'Control heatmap',
    label: 'Risk view',
    svg: `<svg viewBox="0 0 824 466" aria-label="Risk heatmap" style="margin-top:24px;width:824px;height:466px;display:block;">
      <g transform="translate(72 64)">${[0,1,2].map((r) => [0,1,2,3].map((c) => `<rect x="${c * 122}" y="${r * 104}" width="104" height="86" rx="8" fill="${[p.fog,p.accent,p.secondary,p.text][(r+c)%4]}" opacity="${(r+c)%4 === 3 ? 1 : .88}"/>`).join('')).join('')}</g>
      <g fill="${p.text}" font-size="20" font-weight="820"><text x="610" y="114">Impact</text><text x="610" y="184">Likelihood</text><text x="610" y="254">Controls</text></g>
      <circle cx="438" cy="164" r="18" fill="${p.text}"/><circle cx="316" cy="268" r="18" fill="${p.text}"/>
    </svg>`,
  };
}

function optionScorecard(p) {
  return {
    title: 'Option scorecard',
    label: 'Weighted fit',
    svg: `<svg viewBox="0 0 824 466" aria-label="Option scorecard" style="margin-top:24px;width:824px;height:466px;display:block;">
      ${['Option A','Option B','Option C','Option D'].map((label, i) => `<text x="72" y="${96 + i * 78}" fill="${p.text}" font-size="23" font-weight="860">${label}</text><rect x="220" y="${70 + i * 78}" width="480" height="28" rx="14" fill="${alpha(p.text, 0.1)}"/><rect x="220" y="${70 + i * 78}" width="${[390,300,442,250][i]}" height="28" rx="14" fill="${i === 2 ? p.accent : i === 1 ? p.secondary : p.text}"/><text x="724" y="${94 + i * 78}" fill="${p.text}" font-size="21" font-weight="820">${[81,62,92,54][i]}</text>`).join('')}
      <path d="M220 388H704" stroke="${alpha(p.text, 0.16)}" stroke-width="2"/>
      <text x="220" y="426" fill="${alpha(p.text, 0.62)}" font-size="20">weighted by impact, cost, confidence, and time</text>
    </svg>`,
  };
}

function swotBoard(p) {
  return {
    title: 'Strategic board',
    label: '2x2 synthesis',
    svg: `<svg viewBox="0 0 824 466" aria-label="Strategic board" style="margin-top:24px;width:824px;height:466px;display:block;">
      ${[['Strengths',72,58,p.accent],['Weaknesses',428,58,p.fog],['Opportunities',72,250,p.secondary],['Threats',428,250,p.text]].map(([label,x,y,color]) => `<rect x="${x}" y="${y}" width="324" height="150" rx="8" fill="${color}"/><text x="${x + 28}" y="${y + 54}" fill="${color === p.text ? '#FFFFFF' : p.text}" font-size="26" font-weight="860">${label}</text><text x="${x + 28}" y="${y + 96}" fill="${color === p.text ? '#FFFFFF' : p.text}" opacity=".68" font-size="20">2-3 concise proof points</text>`).join('')}
    </svg>`,
  };
}

function policyGapLadder(p) {
  return {
    title: 'Gap ladder',
    label: 'From issue to action',
    svg: `<svg viewBox="0 0 824 466" aria-label="Gap ladder" style="margin-top:24px;width:824px;height:466px;display:block;">
      ${['Current state','Gap','Intervention','Outcome'].map((label, i) => `<rect x="${86 + i * 164}" y="${294 - i * 54}" width="128" height="${74 + i * 54}" rx="8" fill="${[p.fog,p.secondary,p.accent,p.text][i]}"/><text x="${150 + i * 164}" y="348" text-anchor="middle" fill="${i === 3 ? '#FFFFFF' : p.text}" font-size="19" font-weight="860">${label}</text>`).join('')}
      <path d="M150 270C256 248 318 206 408 184C514 158 588 112 704 86" fill="none" stroke="${p.text}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="704" cy="86" r="18" fill="${p.accent}"/>
    </svg>`,
  };
}

function chartGrid(p) {
  return `<g stroke="${alpha(p.text, 0.11)}" stroke-width="2"><path d="M70 76H730"/><path d="M70 130H730"/><path d="M70 184H730"/><path d="M70 238H730"/><path d="M70 292H730"/></g>`;
}

function axisLabels(p) {
  return `<g fill="${p.text}" font-size="18" opacity=".62"><text x="88" y="324">Jan</text><text x="236" y="324">Mar</text><text x="384" y="324">May</text><text x="532" y="324">Jul</text><text x="680" y="324">Sep</text></g>`;
}

function progressRow(label, value, color, p) {
  return `<div style="display:grid;grid-template-columns:128px 1fr 64px;gap:18px;align-items:center;margin-top:18px;"><span style="font-size:20px;color:${color};font-weight:860;">${escapeHtml(label)}</span><div style="height:14px;background:${alpha(p.text, 0.1)};border-radius:999px;overflow:hidden;"><div style="width:${value}%;height:100%;background:${color};border-radius:999px;"></div></div><strong style="font-size:22px;">${value}%</strong></div>`;
}

function metricTile(value, label, color, textColor) {
  return `<div style="border:1px solid rgba(31,26,23,.13);background:rgba(255,255,255,.72);border-radius:8px;padding:22px 24px;color:${textColor};"><div class="num" style="color:${color};opacity:1;">${escapeHtml(label)}</div><div style="font-size:38px;font-weight:880;margin-top:10px;line-height:1;">${escapeHtml(value)}</div></div>`;
}

function coverLine(label, value, color) {
  return `<div style="border-top:1px solid rgba(255,255,255,.16);padding-top:18px;"><div class="num" style="color:${color};opacity:1;">${escapeHtml(label)}</div><div style="font-size:25px;line-height:1.18;font-weight:820;color:#FFFFFF;margin-top:8px;">${escapeHtml(value)}</div></div>`;
}

function nodeStrip(label, color) {
  return `<div style="height:112px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);display:flex;align-items:center;gap:22px;padding:0 28px;margin-bottom:18px;">
    <span style="width:18px;height:18px;border-radius:50%;background:${color};box-shadow:0 0 0 8px rgba(255,255,255,.05);"></span>
    <span style="font-size:30px;font-weight:840;color:#FFFFFF;">${escapeHtml(label)}</span>
  </div>`;
}

function mapPin(x, y, color, label) {
  return `<g><circle cx="${x}" cy="${y}" r="24" fill="${color}"/><circle cx="${x}" cy="${y}" r="8" fill="#FFFFFF"/><text x="${x + 34}" y="${y + 8}" fill="#111827" font-size="20" font-weight="860">${label}</text></g>`;
}

function nodeBox(x, y, w, h, title, sub, color, p) {
  const dark = color === p.text;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${dark ? p.text : '#FFFFFF'}" stroke="${dark ? p.text : alpha(p.text, 0.13)}"/><circle cx="${x + 34}" cy="${y + 34}" r="13" fill="${dark ? p.accent : color}"/><text x="${x + 62}" y="${y + 42}" fill="${dark ? '#FFFFFF' : p.text}" font-size="24" font-weight="860">${escapeHtml(title)}</text><text x="${x + 32}" y="${y + h - 30}" fill="${dark ? '#FFFFFF' : p.text}" opacity="${dark ? '.68' : '.62'}" font-size="20">${escapeHtml(sub)}</text>`;
}

function networkModel(context, layout) {
  const text = `${context.scenario} ${layout.id} ${layout.name}`.toLowerCase();
  if (text.includes('technical') || text.includes('architecture') || text.includes('technology stack')) {
    return {
      copy: 'A technical topology that shows interfaces, services, data movement, and control boundaries.',
      rails: ['Interface layer', 'Service core', 'Control plane'],
      nodes: [
        { title: 'Clients', sub: 'web / mobile' },
        { title: 'Gateway', sub: 'auth, routing' },
        { title: 'Services', sub: 'domain APIs' },
        { title: 'Data layer', sub: 'stores, queues' },
        { title: 'Runtime', sub: 'workers, jobs' },
        { title: 'Security plane', sub: 'policy, audit, secrets' },
      ],
    };
  }
  if (text.includes('project')) {
    return {
      copy: 'A project operating map that shows workstreams, ownership, dependencies, and governance cadence.',
      rails: ['Sponsor lane', 'Delivery core', 'Governance loop'],
      nodes: [
        { title: 'Sponsor', sub: 'mandate' },
        { title: 'PMO', sub: 'scope, plan' },
        { title: 'Workstreams', sub: 'delivery teams' },
        { title: 'Stakeholders', sub: 'input, review' },
        { title: 'Milestones', sub: 'release gates' },
        { title: 'Steering group', sub: 'decisions, risks' },
      ],
    };
  }
  if (text.includes('business-report') || text.includes('operations')) {
    return {
      copy: 'An operations map that shows handoffs, throughput, ownership, and management controls.',
      rails: ['Front line', 'Operating core', 'Review loop'],
      nodes: [
        { title: 'Demand', sub: 'requests' },
        { title: 'Ops hub', sub: 'triage, route' },
        { title: 'Teams', sub: 'execution' },
        { title: 'Quality', sub: 'exceptions' },
        { title: 'Capacity', sub: 'staffing, load' },
        { title: 'Management', sub: 'cadence, controls' },
      ],
    };
  }
  if (text.includes('event') || text.includes('expo')) {
    return {
      copy: 'An event flow map that connects audience entry, demo moments, staff handoffs, and sponsor visibility.',
      rails: ['Audience path', 'Experience core', 'Follow-up loop'],
      nodes: [
        { title: 'Entry', sub: 'welcome' },
        { title: 'Main stage', sub: 'program' },
        { title: 'Demo pods', sub: 'showcase' },
        { title: 'Staff', sub: 'guidance' },
        { title: 'Leads', sub: 'capture' },
        { title: 'Partner desk', sub: 'handoff, next step' },
      ],
    };
  }
  if (text.includes('company') || text.includes('profile')) {
    return {
      copy: 'A company system view that connects services, customers, delivery model, and partner ecosystem.',
      rails: ['Market interface', 'Delivery engine', 'Ecosystem loop'],
      nodes: [
        { title: 'Customers', sub: 'segments' },
        { title: 'Offer suite', sub: 'services' },
        { title: 'Delivery', sub: 'methodology' },
        { title: 'Partners', sub: 'channels' },
        { title: 'Proof', sub: 'results' },
        { title: 'Leadership', sub: 'quality, standards' },
      ],
    };
  }
  if (text.includes('teaching') || text.includes('training')) {
    return {
      copy: 'A learning flow that connects instruction, practice, feedback, and mastery checks.',
      rails: ['Teacher input', 'Practice core', 'Feedback loop'],
      nodes: [
        { title: 'Objective', sub: 'lesson goal' },
        { title: 'Model', sub: 'example' },
        { title: 'Practice', sub: 'student work' },
        { title: 'Check', sub: 'quick assess' },
        { title: 'Feedback', sub: 'correction' },
        { title: 'Mastery', sub: 'next task' },
      ],
    };
  }
  return {
    copy: 'A system diagram that shows components, handoffs, ownership, and the control loop.',
    rails: ['Input layer', 'Decision core', 'Delivery loop'],
    nodes: [
      { title: 'Input', sub: 'signals' },
      { title: 'Core model', sub: 'logic' },
      { title: 'Output', sub: 'result' },
      { title: 'Review', sub: 'quality' },
      { title: 'Delivery', sub: 'execution' },
      { title: 'Governance', sub: 'rules, ownership' },
    ],
  };
}

function roadmapItem(stage, i, p, seed) {
  const x = 90 + i * 156;
  const y = [330, 240, 286, 166][i % 4];
  const color = i % 2 ? p.secondary : p.accent;
  return `<rect x="${x}" y="${y}" width="126" height="86" rx="8" fill="${i === 2 ? '#FFFFFF' : 'rgba(255,255,255,.09)'}" stroke="rgba(255,255,255,.14)"/><circle cx="${x + 28}" cy="${y + 28}" r="14" fill="${color}"/><text x="${x + 24}" y="${y + 62}" fill="${i === 2 ? p.text : '#FFFFFF'}" font-size="19" font-weight="860">${stage}</text><text x="${x + 24}" y="${y + 86}" fill="${i === 2 ? p.text : '#FFFFFF'}" opacity=".58" font-size="16">phase ${i + 1}</text>`;
}

function timelineLabels(context) {
  const scenario = context.scenario;
  if (scenario.includes('teaching')) return ['Warm-up', 'Model', 'Practice', 'Check'];
  if (scenario.includes('event')) return ['Open', 'Demo', 'Meet', 'Close'];
  if (scenario.includes('project')) return ['Scope', 'Build', 'Launch', 'Scale'];
  if (scenario.includes('country')) return ['History', 'Today', 'Entry', 'Outlook'];
  return ['Frame', 'Prove', 'Commit', 'Move'];
}

function isLearningScenario(context) {
  const scenario = String(context.scenario || '').toLowerCase();
  const title = String(context.title || '').toLowerCase();
  return (
    scenario.includes('teaching') ||
    scenario.includes('training') ||
    scenario.includes('book') ||
    scenario.includes('lesson') ||
    title.includes('teaching') ||
    title.includes('training') ||
    title.includes('lesson')
  );
}

function academicProgress(context, index) {
  if (context.scenario.includes('book')) {
    return ['Preview chapter', 'Read closely', 'Find evidence', 'Discuss meaning', 'Write response'];
  }
  if (context.scenario.includes('games')) {
    return ['Set teams', 'Learn rule', 'Play round', 'Check answer', 'Award points'];
  }
  if (context.scenario.includes('training')) {
    return ['Frame skill', 'Model behavior', 'Practice task', 'Feedback loop', 'Apply at work'];
  }
  return ['Set objective', 'Model example', 'Practice', 'Check understanding', 'Assign next step'];
}

function academicItems(context) {
  if (context.scenario.includes('book')) {
    return ['Identify the central idea', 'Use textual evidence', 'Analyze character choices', 'Discuss theme clearly'];
  }
  if (context.scenario.includes('games')) {
    return ['Understand the rules', 'Use target language', 'Collaborate with team', 'Reflect on mistakes'];
  }
  if (context.scenario.includes('training')) {
    return ['Name the skill', 'See the model', 'Practice safely', 'Transfer to the job'];
  }
  return ['Explain the concept', 'Apply it in context', 'Check the answer', 'Explain the reasoning'];
}

function summaryLabels(context) {
  if (context.scenario.includes('country')) {
    return [
      { title: 'Macro facts', copy: 'Population, economy, geography.', icon: 'globe' },
      { title: 'Decision lens', copy: 'Opportunity and risk in one view.', icon: 'compass' },
    ];
  }
  if (context.scenario.includes('teaching')) {
    return [
      { title: 'Objective', copy: 'What students should master.', icon: 'target' },
      { title: 'Practice', copy: 'How understanding is checked.', icon: 'pencil' },
    ];
  }
  return [
    { title: 'Context', copy: 'Frame the situation clearly.', icon: 'document' },
    { title: 'Action', copy: 'Commit to the next step.', icon: 'arrow' },
  ];
}

function inlineIcon(name, color, size) {
  const common = `width:${size}px;height:${size}px;color:${color};display:block;`;
  const stroke = `stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const icons = {
    compass: `<circle cx="48" cy="48" r="34" ${stroke}/><path d="M60 28 52 54 34 68l8-26Z" fill="currentColor" opacity=".88"/>`,
    circuit: `<path d="M24 30h20v20H24zM52 46h20v20H52zM34 50v16h18M44 40h18v6" ${stroke}/><circle cx="72" cy="30" r="7" fill="currentColor"/>`,
    loop: `<path d="M24 48c0-13 10-24 24-24h10M52 14l14 10-14 10M72 48c0 13-10 24-24 24H38M44 82 30 72l14-10" ${stroke}/>`,
    spark: `<path d="M48 10l8 26 26 12-26 12-8 26-8-26-26-12 26-12Z" fill="currentColor" opacity=".9"/><circle cx="76" cy="22" r="6" fill="currentColor"/>`,
    document: `<path d="M28 16h28l16 16v48H28Z" ${stroke}/><path d="M56 16v18h16M38 48h22M38 62h28" ${stroke}/>`,
    chart: `<path d="M20 74h58M30 64V44M48 64V26M66 64V36" ${stroke}/><path d="M26 32c14 6 24 8 38-10" ${stroke}/>`,
    check: `<circle cx="48" cy="48" r="34" ${stroke}/><path d="M31 49l12 12 24-28" ${stroke}/>`,
    pencil: `<path d="M24 68l8-24 30-30 20 20-30 30-24 8Z" ${stroke}/><path d="M56 20l20 20" ${stroke}/>`,
    aperture: `<circle cx="48" cy="48" r="34" ${stroke}/><path d="M48 14 35 48l13 34M82 48H48L24 26M24 70l24-22" ${stroke}/>`,
    crop: `<path d="M28 14v54h54M14 28h54v54" ${stroke}/>`,
    pin: `<path d="M48 84S72 58 72 36a24 24 0 0 0-48 0c0 22 24 48 24 48Z" ${stroke}/><circle cx="48" cy="36" r="8" fill="currentColor"/>`,
    target: `<circle cx="48" cy="48" r="34" ${stroke}/><circle cx="48" cy="48" r="18" ${stroke}/><circle cx="48" cy="48" r="5" fill="currentColor"/>`,
    globe: `<circle cx="48" cy="48" r="34" ${stroke}/><path d="M14 48h68M48 14c12 12 18 24 18 34S60 70 48 82M48 14C36 26 30 38 30 48s6 22 18 34" ${stroke}/>`,
    arrow: `<path d="M24 68 68 24M40 24h28v28" ${stroke}/><path d="M24 24h22M24 44h16M24 64h8" ${stroke}/>`,
  };
  return `<svg viewBox="0 0 96 96" aria-hidden="true" style="${common}">${icons[name] || icons.spark}</svg>`;
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

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function isDark(hex) {
  const clean = String(hex).replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function alpha(hex, opacity) {
  const clean = String(hex).replace('#', '');
  if (clean.length !== 6) return `rgba(17,24,39,${opacity})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function scenarioFromSlug(slug) {
  return String(slug || '').replace(/^ydeck-library-/, '');
}

function titleFromSlug(slug) {
  return scenarioFromSlug(slug)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

main();
