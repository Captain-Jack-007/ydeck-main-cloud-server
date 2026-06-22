import { getTool, listTools } from "../tools/registry";
import { selectToolsForTurn } from "./toolSelection";

export interface BuildPromptInput {
  query: string;
  k?: number;
  guideOnly?: boolean;
  extraSystem?: string;
  alwaysInclude?: string[];
  allowedTools?: string[];
}

export interface BuiltPrompt {
  systemPrompt: string;
  tools: string[];
  reasons: Record<string, string>;
}

const HEADER = [
  "You are the YDeck cloud agent. You can call tools by emitting a fenced block:",
  "",
  "```tool",
  '{ "name": "<tool_name>", "arguments": { ... } }',
  "```",
  "",
  "Rules:",
  " - Use only the tools listed below.",
  " - Prefer reading project/workspace context before writing deck artifacts.",
  " - When creating or updating a deck, write structured YDeck JSON through a tool.",
  " - When you are done, respond with a short plain-text summary.",
].join("\n");

const GUIDE_ONLY_NOTE =
  "## GUIDE-ONLY MODE\nThe user has asked for guidance only. Do not call tools or mutate state.";

export function buildAgentSystemPrompt(input: BuildPromptInput): BuiltPrompt {
  const selection = selectToolsForTurn({
    query: input.query,
    k: input.k ?? 8,
    alwaysInclude: input.alwaysInclude,
    allowedTools: input.allowedTools,
  });
  const blocks: string[] = [HEADER];
  if (input.guideOnly) blocks.push(GUIDE_ONLY_NOTE);
  if (input.extraSystem) blocks.push(input.extraSystem.trim());

  blocks.push("## Available tools");
  for (const name of selection.tools) {
    const def = getTool(name);
    if (!def) continue;
    blocks.push(`### ${def.name} [${def.risk}]`);
    blocks.push(def.description.trim());
  }
  if (!selection.tools.length) blocks.push("(no tools available - respond in text only)");

  return { systemPrompt: blocks.join("\n\n"), tools: selection.tools, reasons: selection.reasons };
}

export function buildPromptWithAllTools(opts: { guideOnly?: boolean } = {}): BuiltPrompt {
  const all = listTools();
  const blocks: string[] = [HEADER];
  if (opts.guideOnly) blocks.push(GUIDE_ONLY_NOTE);
  blocks.push("## Available tools");
  for (const def of all) blocks.push(`### ${def.name} [${def.risk}]\n${def.description.trim()}`);
  return {
    systemPrompt: blocks.join("\n\n"),
    tools: all.map((t) => t.name),
    reasons: Object.fromEntries(all.map((t) => [t.name, "all"])),
  };
}
