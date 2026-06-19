import type { ToolContext } from "../tools/types";
import { normalizeToolName } from "../tools/registry";

export const COMMON_TOOL_NAMES = new Set([
  "ask_user",
  "create_deck",
  "create_document",
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
]);

export const NON_ADMIN_BLOCKED_TOOLS = new Set<string>([]);

export interface ToolDecision {
  allowed: boolean;
  reason: string;
}

const GUIDE_ONLY_PATTERNS = [
  /\bguide[-\s]?only mode\b/i,
  /\bno[-\s]?tools? mode\b/i,
  /\bdo not use (?:any )?tools?\b/i,
  /\bdon'?t use (?:any )?tools?\b/i,
  /\bnot allowed to use (?:any )?tools?\b/i,
  /\bask (?:me )?(?:for confirmation )?before using tools?\b/i,
];

export function detectGuideOnlyTurn(message: unknown): string | undefined {
  if (typeof message !== "string" || !message.trim()) return undefined;
  const text = message.replace(/\s+/g, " ").trim();
  return GUIDE_ONLY_PATTERNS.some((pattern) => pattern.test(text))
    ? "User requested a guide-only/no-tools turn."
    : undefined;
}

export class ToolPolicy {
  readonly disabledTools: ReadonlySet<string>;
  readonly hiddenTools: ReadonlySet<string>;
  readonly reasons: ReadonlyMap<string, string>;
  readonly mode: string;
  readonly blockAllToolCalls: boolean;

  constructor(input: {
    disabledTools?: Iterable<string>;
    hiddenTools?: Iterable<string>;
    reasons?: Map<string, string> | Record<string, string>;
    mode?: string;
    blockAllToolCalls?: boolean;
  } = {}) {
    this.disabledTools = normalizeSet(input.disabledTools);
    this.hiddenTools = normalizeSet(input.hiddenTools);
    this.reasons =
      input.reasons instanceof Map ? input.reasons : new Map(Object.entries(input.reasons ?? {}));
    this.mode = input.mode ?? "normal";
    this.blockAllToolCalls = input.blockAllToolCalls ?? false;
  }

  blocks(toolName?: string | null): boolean {
    if (!toolName) return false;
    const name = normalizeToolName(toolName);
    return this.blockAllToolCalls || this.disabledTools.has(name) || this.hiddenTools.has(name);
  }

  reasonFor(toolName?: string | null): string {
    const name = normalizeToolName(toolName);
    const specific = name ? this.reasons.get(name) : undefined;
    if (specific) return specific;
    if (this.blockAllToolCalls && this.mode === "guide_only") {
      return "Tool use is disabled for this guide-only turn.";
    }
    return "Tool use is disabled for this turn.";
  }

  check(toolName: string, ctx: ToolContext = {}): ToolDecision {
    const name = normalizeToolName(toolName);
    if (this.blocks(name)) return { allowed: false, reason: this.reasonFor(name) };
    if (ctx.mode === "guide_only") {
      return { allowed: false, reason: "Tool use is disabled for this guide-only turn." };
    }
    if (!isAdminRole(ctx.userRole) && NON_ADMIN_BLOCKED_TOOLS.has(name)) {
      return { allowed: false, reason: `Tool ${name} requires an admin role.` };
    }
    return { allowed: true, reason: "allowed" };
  }
}

export function buildEffectiveToolPolicy(input: {
  disabledTools?: Iterable<string>;
  lastUserMessage?: unknown;
  mode?: string;
} = {}): ToolPolicy {
  const disabled = new Set<string>();
  const reasons = new Map<string, string>();
  for (const tool of input.disabledTools ?? []) {
    const name = normalizeToolName(tool);
    if (!name) continue;
    disabled.add(name);
    reasons.set(name, "Tool is disabled for this request.");
  }

  const guideReason =
    input.mode === "guide_only" ? "Guide-only mode requested." : detectGuideOnlyTurn(input.lastUserMessage);
  if (guideReason) {
    const hidden = new Set<string>();
    for (const tool of COMMON_TOOL_NAMES) {
      disabled.add(tool);
      hidden.add(tool);
      reasons.set(tool, guideReason);
    }
    return new ToolPolicy({
      disabledTools: disabled,
      hiddenTools: hidden,
      reasons,
      mode: "guide_only",
      blockAllToolCalls: true,
    });
  }

  return new ToolPolicy({ disabledTools: disabled, reasons, mode: input.mode });
}

function normalizeSet(values: Iterable<string> | undefined): Set<string> {
  const out = new Set<string>();
  for (const value of values ?? []) {
    const name = normalizeToolName(value);
    if (name) out.add(name);
  }
  return out;
}

function isAdminRole(role: ToolContext["userRole"]): boolean {
  return role === "admin" || role === "enterprise_admin";
}
