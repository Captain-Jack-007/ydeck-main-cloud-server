import { executeRegisteredTool } from "../tools/registry";
import type { ToolBlock, ToolContext, ToolResult } from "../tools/types";
import { parseToolBlocks } from "./toolParsing";
import { buildAgentSystemPrompt } from "./promptBuilder";
import { detectGuideOnlyTurn, ToolPolicy } from "./toolPolicy";

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export type LLMCaller = (prompt: string, history: AgentMessage[]) => Promise<string>;

export interface AgentEvent {
  type: "plan" | "llm.start" | "llm.end" | "tool.call" | "tool.result" | "tool.blocked" | "done" | "error";
  round?: number;
  data?: unknown;
}

export interface ToolAuditEvent {
  phase: "started" | "completed" | "blocked" | "errored";
  round: number;
  name: string;
  dialect: ToolBlock["dialect"];
  argKeys: string[];
  argsBytes: number;
  ok?: boolean;
  error?: string;
  contentBytes?: number;
  ms?: number;
}

export interface RunAgentLoopOptions {
  messages: AgentMessage[];
  llm: LLMCaller;
  ctx: ToolContext;
  policy?: ToolPolicy;
  maxRounds?: number;
  k?: number;
  alwaysInclude?: string[];
  onEvent?: (event: AgentEvent) => void;
  onToolEvent?: (event: ToolAuditEvent) => void;
  onTrace?: (event: AgentFlowTraceEvent) => void;
  signal?: AbortSignal;
}

export interface AgentFlowTraceEvent {
  direction: "send" | "receive";
  kind: "llm" | "tool";
  round: number;
  name?: string;
  chars?: number;
  data?: unknown;
}

export interface AgentLoopResult {
  text: string;
  rounds: number;
  toolCalls: Array<{ name: string; result: ToolResult }>;
  selectedTools: string[];
  stoppedReason: "no_calls" | "max_rounds" | "aborted" | "error";
}

function lastUserText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

function formatHistory(messages: AgentMessage[]): string {
  return messages
    .map((m) => {
      if (m.role === "tool") return `<tool name="${m.toolName ?? "unknown"}">\n${m.content}\n</tool>`;
      return `<${m.role}>\n${m.content}\n</${m.role}>`;
    })
    .join("\n\n");
}

async function runOneToolBlock(block: ToolBlock, ctx: ToolContext, policy?: ToolPolicy): Promise<ToolResult> {
  if (policy) {
    const decision = policy.check(block.name, ctx);
    if (!decision.allowed) {
      return {
        ok: false,
        content: `Tool '${block.name}' is blocked by policy: ${decision.reason}`,
        error: "POLICY_BLOCKED",
      };
    }
  }
  const args = block.args ?? safeJsonObject(block.content);
  try {
    return await executeRegisteredTool(block.name, args, ctx);
  } catch (err) {
    return {
      ok: false,
      content: `Tool '${block.name}' threw: ${(err as Error).message}`,
      error: "TOOL_THREW",
    };
  }
}

function safeJsonObject(text: string): Record<string, unknown> {
  try {
    const t = text.trim();
    if (!t) return {};
    const parsed = JSON.parse(t);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeByteLen(s?: string): number {
  if (!s) return 0;
  try {
    return Buffer.byteLength(s, "utf8");
  } catch {
    return s.length;
  }
}

export async function runAgentLoop(opts: RunAgentLoopOptions): Promise<AgentLoopResult> {
  const maxRounds = Math.max(1, Math.min(opts.maxRounds ?? 4, 10));
  const emit = (e: AgentEvent) => opts.onEvent?.(e);
  const trace = (e: AgentFlowTraceEvent) => opts.onTrace?.(e);
  const emitTool = (e: ToolAuditEvent) => {
    try {
      opts.onToolEvent?.(e);
    } catch {
      // Audit failures must not break the loop.
    }
  };
  const history: AgentMessage[] = [...opts.messages];
  const userText = lastUserText(history);
  const guideOnly = detectGuideOnlyTurn(userText);
  const built = buildAgentSystemPrompt({ query: userText, k: opts.k, guideOnly: !!guideOnly, alwaysInclude: opts.alwaysInclude });
  emit({ type: "plan", data: { tools: built.tools, reasons: built.reasons } });

  const toolCalls: AgentLoopResult["toolCalls"] = [];
  let stoppedReason: AgentLoopResult["stoppedReason"] = "max_rounds";
  let lastText = "";

  for (let round = 1; round <= maxRounds; round += 1) {
    if (opts.signal?.aborted) {
      stoppedReason = "aborted";
      break;
    }
    const promptForRound = `${built.systemPrompt}\n\n${formatHistory(history)}`;
    emit({ type: "llm.start", round, data: { promptChars: promptForRound.length } });
    trace({
      direction: "send",
      kind: "llm",
      round,
      chars: promptForRound.length,
      data: {
        prompt: promptForRound,
        history: history.map((m) => ({ role: m.role, toolName: m.toolName, content: m.content })),
      },
    });
    let response = "";
    try {
      response = await opts.llm(promptForRound, history);
    } catch (err) {
      response = (err as Error).message;
      lastText = response;
      emit({ type: "error", round, data: { message: response } });
      stoppedReason = "error";
      break;
    }
    emit({ type: "llm.end", round, data: { chars: response.length } });
    trace({ direction: "receive", kind: "llm", round, chars: response.length, data: { response } });
    history.push({ role: "assistant", content: response });
    lastText = response;

    const blocks = parseToolBlocks(response);
    if (!blocks.length || guideOnly) {
      stoppedReason = "no_calls";
      break;
    }
    for (const block of blocks) {
      const argKeys = block.args ? Object.keys(block.args) : [];
      const argsBytes = block.args ? safeByteLen(JSON.stringify(block.args)) : safeByteLen(block.content);
      emit({ type: "tool.call", round, data: { name: block.name, dialect: block.dialect } });
      trace({
        direction: "send",
        kind: "tool",
        round,
        name: block.name,
        chars: argsBytes,
        data: { name: block.name, dialect: block.dialect, args: block.args ?? safeJsonObject(block.content) },
      });
      emitTool({ phase: "started", round, name: block.name, dialect: block.dialect, argKeys, argsBytes });
      const t0 = Date.now();
      const result = await runOneToolBlock(block, opts.ctx, opts.policy);
      const ms = Date.now() - t0;
      trace({
        direction: "receive",
        kind: "tool",
        round,
        name: block.name,
        chars: safeByteLen(result.content),
        data: { name: block.name, ok: result.ok, error: result.error, content: result.content, data: result.data, ms },
      });
      toolCalls.push({ name: block.name, result });
      const blocked = result.error === "POLICY_BLOCKED";
      emit({
        type: blocked ? "tool.blocked" : "tool.result",
        round,
        data: { name: block.name, ok: result.ok, content: result.content },
      });
      emitTool({
        phase: blocked ? "blocked" : result.ok ? "completed" : "errored",
        round,
        name: block.name,
        dialect: block.dialect,
        argKeys,
        argsBytes,
        ok: result.ok,
        error: result.error,
        contentBytes: safeByteLen(result.content),
        ms,
      });
      history.push({
        role: "tool",
        toolName: block.name,
        content: JSON.stringify({ ok: result.ok, content: result.content, error: result.error }, null, 2),
      });
    }
  }

  emit({ type: "done", data: { stoppedReason } });
  return {
    text: lastText,
    rounds: Math.min(maxRounds, toolCalls.length + 1),
    toolCalls,
    selectedTools: built.tools,
    stoppedReason,
  };
}
