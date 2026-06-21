import { normalizeToolName } from "../tools/registry";
import type { ToolBlock } from "../tools/types";

const TOOL_TAGS = [
  "tool",
  "ask_user",
  "create_document",
  "create_deck",
  "design_deck",
  "design_slide",
  "edit_document",
  "inspect_project",
  "list_files",
  "list_packs",
  "manage_memory",
  "manage_skills",
  "read_file",
  "read_workspace_context",
  "search_chats",
  "suggest_document",
  "trigger_research",
  "update_deck",
  "update_document",
  "update_plan",
  "web_fetch",
  "web_search",
  "write_file",
];

const TOOL_BLOCK_RE = new RegExp("```(" + TOOL_TAGS.map(escapeRegex).join("|") + ")\\s*\\n([\\s\\S]*?)```", "gi");
const TOOL_CALL_RE = /\[TOOL_CALL\]\s*\{([\s\S]*?)\}\s*\[\/TOOL_CALL\]/gi;
const XML_INVOKE_RE = /<invoke\s+name=["']([\w.-]+)["']>\s*([\s\S]*?)<\/invoke>/gi;
const XML_PARAM_RE = /<parameter\s+name=["']([\w.-]+)["'][^>]*>([\s\S]*?)<\/parameter>/gi;

const TOOL_NAME_MAP: Record<string, string> = {
  tool: "tool",
  ask_user: "ask_user",
  create_document: "create_document",
  create_deck: "create_deck",
  design_deck: "design_deck",
  design_slide: "design_slide",
  update_document: "update_document",
  edit_document: "edit_document",
  suggest_document: "suggest_document",
  update_deck: "update_deck",
  inspect_project: "inspect_project",
  read_workspace_context: "read_workspace_context",
  list_packs: "list_packs",
  list_files: "list_files",
  read_file: "read_file",
  write_file: "write_file",
  search_chats: "search_chats",
  manage_memory: "manage_memory",
  manage_skills: "manage_skills",
  web_search: "web_search",
  web_fetch: "web_fetch",
  trigger_research: "trigger_research",
  update_plan: "update_plan",
};

export function parseToolBlocks(text: string): ToolBlock[] {
  const fenced = parseFencedToolBlocks(text);
  if (fenced.length) return fenced;
  const calls = parseToolCallBlocks(text);
  if (calls.length) return calls;
  return parseXmlInvokeBlocks(text);
}

export function parseFencedToolBlocks(text: string): ToolBlock[] {
  const out: ToolBlock[] = [];
  for (const match of text.matchAll(resetGlobal(TOOL_BLOCK_RE))) {
    const tag = normalizeToolName(match[1]);
    const content = match[2]?.trim() ?? "";
    if (!content) continue;
    const parsed = tryParseJsonLike(content);
    if (tag === "tool" && isRecord(parsed)) {
      const rawName = String(parsed.name ?? parsed.tool ?? "");
      const name = mapToolName(rawName);
      if (!name) continue;
      const args = isRecord(parsed.arguments) ? parsed.arguments : isRecord(parsed.args) ? parsed.args : {};
      out.push({ name, content: JSON.stringify(args), args, raw: match[0], dialect: "fenced" });
      continue;
    }
    out.push({ name: mapToolName(tag) ?? tag, content, raw: match[0], dialect: "fenced" });
  }
  return out;
}

export function parseToolCallBlocks(text: string): ToolBlock[] {
  const out: ToolBlock[] = [];
  for (const match of text.matchAll(resetGlobal(TOOL_CALL_RE))) {
    const parsed = tryParseJsonLike(`{${match[1]}}`);
    if (!isRecord(parsed)) continue;
    const name = mapToolName(String(parsed.name ?? parsed.tool ?? ""));
    if (!name) continue;
    const args = isRecord(parsed.arguments) ? parsed.arguments : isRecord(parsed.args) ? parsed.args : {};
    out.push({ name, content: JSON.stringify(args), args, raw: match[0], dialect: "tool_call" });
  }
  return out;
}

export function parseXmlInvokeBlocks(text: string): ToolBlock[] {
  const out: ToolBlock[] = [];
  for (const invoke of text.matchAll(resetGlobal(XML_INVOKE_RE))) {
    const name = mapToolName(invoke[1]) ?? normalizeToolName(invoke[1]);
    if (!name) continue;
    const args: Record<string, string> = {};
    for (const param of (invoke[2] ?? "").matchAll(resetGlobal(XML_PARAM_RE))) {
      args[normalizeToolName(param[1])] = decodeXml(param[2].trim());
    }
    out.push({ name, content: JSON.stringify(args), args, raw: invoke[0], dialect: "xml" });
  }
  return out;
}

function mapToolName(name: string): string | undefined {
  const normalized = normalizeToolName(name);
  return TOOL_NAME_MAP[normalized] ?? (TOOL_TAGS.includes(normalized) ? normalized : undefined);
}

function tryParseJsonLike(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function resetGlobal(regex: RegExp): RegExp {
  regex.lastIndex = 0;
  return regex;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
