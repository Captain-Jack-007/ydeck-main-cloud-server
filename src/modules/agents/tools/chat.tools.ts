import { z } from "zod";
import { DeckJobModel, DeckProjectModel } from "../../../models";
import { registerTool } from "./registry";
import type { ToolResult } from "./types";

const SearchChatsArgsSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(5),
  scope: z.enum(["projects", "jobs", "all"]).default("projects"),
});

export function registerChatTools(): void {
  registerTool({
    name: "search_chats",
    description:
      "Search past cloud deck projects and jobs by keyword within the current workspace.",
    risk: "read",
    schema: SearchChatsArgsSchema,
    execute: (args, ctx) => searchChats(args, ctx.workspaceId),
  });
}

async function searchChats(args: z.infer<typeof SearchChatsArgsSchema>, workspaceId?: string): Promise<ToolResult> {
  if (!workspaceId) return { ok: false, content: "workspaceId required", error: "BAD_ARGS" };
  const terms = args.query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits: Array<Record<string, unknown> & { matchScore: number }> = [];

  if (args.scope === "projects" || args.scope === "all") {
    const projects = await DeckProjectModel.find({ workspaceId })
      .sort({ updatedAt: -1 })
      .limit(200)
      .select("title description templateId meta updatedAt")
      .lean();
    hits.push(
      ...projects
        .map((p) => ({
          kind: "project",
          id: String(p._id),
          title: p.title,
          description: p.description,
          templateId: p.templateId,
          updatedAt: p.updatedAt,
          matchScore: score([p.title, p.description, p.templateId, JSON.stringify(p.meta ?? {})].join(" "), terms),
        }))
        .filter((h) => h.matchScore > 0),
    );
  }

  if (args.scope === "jobs" || args.scope === "all") {
    const jobs = await DeckJobModel.find({ workspaceId })
      .sort({ updatedAt: -1 })
      .limit(200)
      .select("projectId type status inputParams resultMeta errorMessage updatedAt")
      .lean();
    hits.push(
      ...jobs
        .map((j) => ({
          kind: "job",
          id: String(j._id),
          projectId: String(j.projectId),
          type: j.type,
          status: j.status,
          updatedAt: j.updatedAt,
          matchScore: score([j.type, j.status, j.errorMessage, JSON.stringify(j.inputParams ?? {}), JSON.stringify(j.resultMeta ?? {})].join(" "), terms),
        }))
        .filter((h) => h.matchScore > 0),
    );
  }

  hits.sort((a, b) => b.matchScore - a.matchScore);
  return {
    ok: true,
    content: hits.length ? hits.slice(0, args.limit).map((h) => `${h.kind}:${h.id}`).join(", ") : "No matches.",
    data: { hits: hits.slice(0, args.limit) },
  };
}

function score(haystack: string, terms: string[]): number {
  const lower = haystack.toLowerCase();
  let s = 0;
  for (const t of terms) {
    const ix = lower.indexOf(t);
    if (ix >= 0) s += 1 + (ix === 0 ? 0.25 : 0);
  }
  return s;
}
