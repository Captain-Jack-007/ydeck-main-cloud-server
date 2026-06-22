import { listTools } from "../tools/registry";

export const ALWAYS_AVAILABLE: ReadonlySet<string> = new Set([
  "ask_user",
  "update_plan",
  "inspect_project",
  "read_workspace_context",
]);

const KEYWORD_HINTS: Array<{ words: string[]; tools: string[] }> = [
  { words: ["remember", "memory", "recall", "forget"], tools: ["manage_memory", "search_workspace_memory", "save_workspace_memory"] },
  { words: ["skill", "recipe", "workflow"], tools: ["manage_skills", "list_skills", "run_skill"] },
  { words: ["file", "upload", "attachment", "document"], tools: ["list_files", "read_file", "summarize_file"] },
  { words: ["pdf"], tools: ["extract_pdf", "summarize_file"] },
  { words: ["docx", "word"], tools: ["extract_docx", "summarize_file"] },
  { words: ["csv", "xlsx", "spreadsheet"], tools: ["extract_csv_xlsx", "create_chart", "create_table_visual"] },
  { words: ["search", "latest", "news", "web"], tools: ["web_search", "verify_sources", "extract_research_facts"] },
  { words: ["fetch", "url", "website", "page"], tools: ["web_fetch"] },
  { words: ["research", "investigate", "deep dive"], tools: ["trigger_research", "verify_sources", "create_citation_list"] },
  { words: ["past", "history", "previous"], tools: ["search_chats", "read_deck_history", "compare_deck_versions"] },
  { words: ["template", "theme", "pack", "plugin"], tools: ["list_packs", "list_design_packs", "choose_design_pack"] },
  { words: ["brand", "workspace", "preference", "style"], tools: ["read_workspace_context", "read_brand_kit", "read_user_preferences", "apply_brand_style"] },
  { words: ["project", "current deck", "existing deck"], tools: ["inspect_project", "create_project_snapshot"] },
  { words: ["plan", "brief", "outline"], tools: ["create_deck_brief", "create_deck_plan", "create_outline", "validate_outline"] },
  { words: ["create", "generate", "slides", "deck"], tools: ["create_deck_brief", "create_outline", "write_slide_content", "choose_layouts", "design_deck_html", "save_deck_artifact"] },
  { words: ["design", "visual", "html", "preview", "beautiful", "layout"], tools: ["choose_design_pack", "choose_layouts", "design_slide_html", "design_deck_html", "run_design_qa"] },
  { words: ["image", "photo", "picture", "stock"], tools: ["detect_visual_needs", "search_images", "select_image", "create_image_credits"] },
  { words: ["chart", "graph", "diagram", "table", "icon"], tools: ["create_chart", "create_diagram", "create_table_visual", "create_icon_visual"] },
  { words: ["qa", "quality", "review", "critique", "repair", "fix"], tools: ["run_design_qa", "check_content_quality", "repair_slide_design", "final_deck_review"] },
  { words: ["refine", "rewrite", "improve", "update", "edit"], tools: ["rewrite_slide", "rewrite_deck", "update_deck", "update_document", "edit_document"] },
  { words: ["translate", "language"], tools: ["translate_deck"] },
  { words: ["export", "pptx", "pdf", "download"], tools: ["export_pptx", "export_pdf", "create_share_link", "notify_user"] },
  { words: ["suggest"], tools: ["suggest_document"] },
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
  allowedTools?: ReadonlyArray<string>;
}

export function selectToolsForTurn(input: RankInput): ToolSelectionResult {
  const k = Math.max(1, Math.min(input.k ?? 8, 32));
  const all = listTools();
  const registered = new Set(all.map((t) => t.name));
  const allowed = new Set((input.allowedTools?.length ? input.allowedTools : all.map((t) => t.name)).filter((name) => registered.has(name)));
  const always = [...(input.alwaysInclude ?? ALWAYS_AVAILABLE)];
  const out = new Set<string>(always.filter((name: string) => allowed.has(name)));
  const reasons: Record<string, string> = {};
  for (const t of out) reasons[t] = "always";

  const q = input.query.toLowerCase();
  for (const { words, tools } of KEYWORD_HINTS) {
    if (!words.some((w) => q.includes(w))) continue;
    for (const t of tools) {
      if (!allowed.has(t)) continue;
      out.add(t);
      reasons[t] ??= `keyword:${words.find((w) => q.includes(w)) ?? "match"}`;
    }
  }

  const scored = all
    .filter((t) => allowed.has(t.name))
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
