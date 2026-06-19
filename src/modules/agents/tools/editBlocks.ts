export interface EditBlock {
  find: string;
  replace: string;
}

export interface ApplyEditResult {
  content: string;
  applied: number;
  skipped: { find: string; reason: string }[];
}

const BLOCK_RE = /<<<FIND>>>\n([\s\S]*?)\n<<<REPLACE>>>\n([\s\S]*?)\n<<<END>>>/g;

export function parseEditBlocks(content: string): EditBlock[] {
  const blocks: EditBlock[] = [];
  for (const match of content.matchAll(BLOCK_RE)) {
    blocks.push({ find: match[1], replace: match[2] });
  }
  return blocks;
}

export function applyEditBlocks(source: string, blocks: EditBlock[]): ApplyEditResult {
  let updated = source;
  let applied = 0;
  const skipped: { find: string; reason: string }[] = [];
  for (const edit of blocks) {
    if (updated.includes(edit.find)) {
      updated = updated.replace(edit.find, edit.replace);
      applied += 1;
      continue;
    }
    const stripped = stripLineNumberGutter(edit.find);
    if (stripped !== edit.find && updated.includes(stripped)) {
      updated = updated.replace(stripped, edit.replace);
      applied += 1;
      continue;
    }
    skipped.push({ find: edit.find, reason: "no match" });
  }
  return { content: updated, applied, skipped };
}

export interface SuggestionBlock {
  id: string;
  find: string;
  replace: string;
  reason: string;
}

const SUGGEST_RE = /<<<FIND>>>\n([\s\S]*?)\n<<<REPLACE>>>\n([\s\S]*?)\n<<<REASON>>>\n([\s\S]*?)\n<<<END>>>/g;
const SKIP_PHRASES = ["no change", "no edit", "leave as is", "already correct"];

export function parseSuggestionBlocks(content: string): SuggestionBlock[] {
  const out: SuggestionBlock[] = [];
  let n = 0;
  for (const match of content.matchAll(SUGGEST_RE)) {
    const find = match[1];
    const replace = match[2];
    const reason = match[3].trim();
    if (find.trim() === replace.trim()) continue;
    if (SKIP_PHRASES.some((p) => reason.toLowerCase().includes(p))) continue;
    n += 1;
    out.push({ id: `sugg-${n}`, find, replace, reason });
  }
  return out;
}

function stripLineNumberGutter(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\d+\t/, ""))
    .join("\n");
}
