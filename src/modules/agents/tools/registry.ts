import type { ToolContext, ToolDefinition, ToolResult } from "./types";
import { ToolPolicy } from "../loop/toolPolicy";

const tools = new Map<string, ToolDefinition>();

export function registerTool<TArgs>(tool: ToolDefinition<TArgs>): void {
  const key = normalizeToolName(tool.name);
  if (!key) throw new Error("Tool name is required");
  tools.set(key, { ...tool, name: key } as ToolDefinition);
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(normalizeToolName(name));
}

export function listTools(): ToolDefinition[] {
  return Array.from(tools.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function executeRegisteredTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
  policy = new ToolPolicy(),
): Promise<ToolResult> {
  const normalized = normalizeToolName(name);
  const decision = policy.check(normalized, ctx);
  if (!decision.allowed) {
    return { ok: false, content: decision.reason, error: "TOOL_BLOCKED" };
  }

  const tool = getTool(normalized);
  if (!tool) return { ok: false, content: `Unknown tool: ${normalized}`, error: "TOOL_NOT_FOUND" };
  if (!tool.execute) {
    return {
      ok: false,
      content: `Tool ${normalized} is registered but not implemented yet.`,
      error: "TOOL_NOT_IMPLEMENTED",
    };
  }

  const parsedArgs = tool.schema ? tool.schema.parse(args) : args;
  return tool.execute(parsedArgs as never, ctx);
}

export function normalizeToolName(name: string | undefined | null): string {
  return String(name ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function clearToolsForTests(): void {
  tools.clear();
  registerCoreTools();
}

function registerCoreTools(): void {
  registerTool({
    name: "ask_user",
    description: "Ask the user for missing information before taking action.",
    risk: "read",
    execute: async (args) => ({
      ok: true,
      content: typeof args === "string" ? args : JSON.stringify(args ?? { message: "Input requested." }),
    }),
  });

  registerTool({
    name: "update_plan",
    description: "Publish a plan status update for the current cloud deck job.",
    risk: "read",
    execute: async (args, ctx) => {
      ctx.publish?.({ channel: "agent.plan", payload: args ?? { status: "updated" } });
      return {
        ok: true,
        content: typeof args === "string" ? args : JSON.stringify(args ?? { status: "updated" }),
      };
    },
  });
}

registerCoreTools();
