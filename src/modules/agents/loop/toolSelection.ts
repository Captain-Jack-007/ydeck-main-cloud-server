import { listTools } from "../tools/registry";

export const ALWAYS_AVAILABLE: ReadonlySet<string> = new Set([
  "ask_user",
  "update_plan",
  "inspect_project",
  "read_workspace_context",
]);

const KEYWORD_HINTS: Array<{ words: string[]; tools: string[] }> = [
  { words: ["remember", "memory", "recall", "forget"], tools: ["manage_memory"] },
  { words: ["skill", "recipe", "workflow"], tools: ["manage_skills"] },
  { words: ["file", "upload", "attachment", "document"], tools: ["list_files", "read_file"] },
  { words: ["search", "latest", "news", "web"], tools: ["web_search"] },
  { words: ["fetch", "url", "website", "page"], tools: ["web_fetch"] },
  { words: ["research", "investigate", "deep dive"], tools: ["trigger_research"] },
  { words: ["past", "history", "previous"], tools: ["search_chats"] },
  { words: ["template", "theme", "pack", "plugin"], tools: ["list_packs"] },
  { words: ["brand", "workspace", "preference", "style"], tools: ["read_workspace_context"] },
  { words: ["project", "current deck", "existing deck"], tools: ["inspect_project"] },
  { words: ["create", "generate", "slides", "deck"], tools: ["create_deck", "create_document"] },
  { words: ["refine", "rewrite", "improve", "update", "edit"], tools: ["update_deck", "update_document", "edit_document"] },
  { words: ["suggest", "review", "critique"], tools: ["suggest_document"] },
];

export interface ToolSelectionResult {
  tools: string[];
  scores: Record<string, number>;
  reasons: Record<string, string>;
}

interface RankInput {
  query: string;
  k?: number;
  alwaysInclude?: ReadonlyArray<string>;
}

export function selectToolsForTurn(input: RankInput): ToolSelectionResult {
  const k = Math.max(1, Math.min(input.k ?? 8, 32));
  const all = listTools();
  const allowed = new Set(all.map((t) => t.name));
  const out = new Set<string>(input.alwaysInclude ?? ALWAYS_AVAILABLE);
  const reasons: Record<string, string> = {};
  for (const t of out) reasons[t] = "always";

  const q = input.query.toLowerCase();
  for (const { words, tools } of KEYWORD_HINTS) {
    if (!words.some((w) => q.includes(w))) continue;
    for (const t of tools) {
      out.add(t);
      reasons[t] ??= `keyword:${words.find((w) => q.includes(w)) ?? "match"}`;
    }
  }

  const scored = all
    .filter((t) => !out.has(t.name))
    .map((t) => ({ name: t.name, score: tokenOverlap(input.query, `${t.name} ${t.description}`) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const s of scored) {
    if (out.size >= k) break;
    out.add(s.name);
    reasons[s.name] = `overlap:${s.score.toFixed(3)}`;
  }

  const tools = [...out].filter((n) => allowed.has(n)).slice(0, k);
  const scores: Record<string, number> = {};
  for (const s of scored) if (tools.includes(s.name)) scores[s.name] = s.score;
  return { tools, scores, reasons };
}

function tokenOverlap(a: string, b: string): number {
  const at = tokens(a);
  const bt = tokens(b);
  if (!at.size || !bt.size) return 0;
  let same = 0;
  for (const t of at) if (bt.has(t)) same += 1;
  return same / new Set([...at, ...bt]).size;
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3),
  );
}
