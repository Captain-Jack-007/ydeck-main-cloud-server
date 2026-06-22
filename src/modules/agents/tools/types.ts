import type { z } from "zod";

export type ToolRisk = "read" | "write" | "admin" | "external";

export interface ToolBlock {
  name: string;
  content: string;
  args?: Record<string, unknown>;
  raw?: string;
  dialect: "fenced" | "tool_call" | "xml" | "tool_code" | "dsml" | "function_call";
}

export interface ToolContext {
  projectId?: string;
  jobId?: string;
  workspaceId?: string;
  userId?: string;
  userRole?: "user" | "admin" | "enterprise_admin";
  mode?: "draft" | "preview" | "full" | "guide_only" | string;
  requestId?: string;
  publish?: (event: { channel: string; payload: unknown }) => void;
}

export interface ToolResult {
  ok: boolean;
  content: string;
  data?: unknown;
  error?: string;
}

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  risk: ToolRisk;
  group?: string;
  agents?: string[];
  maturity?: "implemented" | "adapter" | "placeholder";
  schema?: z.ZodType<TArgs>;
  parameters?: Record<string, unknown>;
  execute?: (args: TArgs, ctx: ToolContext) => Promise<ToolResult>;
}
