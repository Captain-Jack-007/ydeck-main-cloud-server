import { z } from "zod";
import {
  PluginPackModel,
  TemplatePackModel,
  WorkspacePreferenceModel,
} from "../../../models";
import { registerTool } from "./registry";
import type { ToolResult } from "./types";

const ManageMemoryArgsSchema = z.object({
  op: z.enum(["add", "list", "search", "delete"]),
  text: z.string().min(1).max(2000).optional(),
  query: z.string().min(1).max(500).optional(),
  category: z.string().max(60).optional(),
  id: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

const ManageSkillsArgsSchema = z.object({
  op: z.enum(["add", "list", "search", "update", "delete", "record_use"]),
  id: z.string().optional(),
  name: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  category: z.string().max(60).optional(),
  tags: z.array(z.string()).max(20).optional(),
  procedure: z.string().max(8000).optional(),
  query: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export function registerMemoryTools(): void {
  registerTool({
    name: "manage_memory",
    description:
      "Workspace memory CRUD. Stores notes under WorkspacePreference.meta.agentMemories. ops: add, list, search, delete.",
    risk: "write",
    schema: ManageMemoryArgsSchema,
    execute: (args, ctx) => runManageMemory(args, ctx.workspaceId),
  });
  registerTool({
    name: "manage_skills",
    description:
      "Cloud reusable deck recipes. Lists/searches template/plugin packs; add/update creates PluginPack records.",
    risk: "write",
    schema: ManageSkillsArgsSchema,
    execute: (args, ctx) => runManageSkills(args, ctx.workspaceId),
  });
}

async function runManageMemory(args: z.infer<typeof ManageMemoryArgsSchema>, workspaceId?: string): Promise<ToolResult> {
  if (!workspaceId) return { ok: false, content: "workspaceId required", error: "BAD_ARGS" };
  const pref = await WorkspacePreferenceModel.findOneAndUpdate(
    { workspaceId },
    { $setOnInsert: { workspaceId } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  const meta = record(pref.get("meta"));
  const memories = Array.isArray(meta.agentMemories) ? (meta.agentMemories as Array<Record<string, unknown>>) : [];

  if (args.op === "add") {
    if (!args.text) return { ok: false, content: "text required", error: "BAD_ARGS" };
    const item = {
      id: `mem_${Date.now().toString(36)}`,
      text: args.text,
      category: args.category ?? null,
      createdAt: new Date().toISOString(),
    };
    meta.agentMemories = [item, ...memories].slice(0, 200);
    pref.set("meta", meta);
    await pref.save();
    return { ok: true, content: `Stored memory ${item.id}`, data: { memory: item } };
  }
  if (args.op === "list") {
    const items = memories.filter((m) => !args.category || m.category === args.category).slice(0, args.limit);
    return { ok: true, content: `${items.length} memories`, data: { items } };
  }
  if (args.op === "search") {
    if (!args.query) return { ok: false, content: "query required", error: "BAD_ARGS" };
    const q = args.query.toLowerCase();
    const hits = memories
      .filter((m) => String(m.text ?? "").toLowerCase().includes(q))
      .slice(0, args.limit);
    return { ok: true, content: `${hits.length} hits`, data: { hits } };
  }
  if (!args.id) return { ok: false, content: "id required", error: "BAD_ARGS" };
  meta.agentMemories = memories.filter((m) => m.id !== args.id);
  pref.set("meta", meta);
  await pref.save();
  return { ok: true, content: "Deleted" };
}

async function runManageSkills(args: z.infer<typeof ManageSkillsArgsSchema>, workspaceId?: string): Promise<ToolResult> {
  if (args.op === "list" || args.op === "search") {
    const q = args.query?.toLowerCase();
    const [templates, plugins] = await Promise.all([
      TemplatePackModel.find().limit(100).lean(),
      PluginPackModel.find().limit(100).lean(),
    ]);
    const items = [...templates.map((p) => ({ kind: "template", ...p })), ...plugins.map((p) => ({ kind: "plugin", ...p }))];
    const filtered = q
      ? items.filter((p) => [p.name, p.description, p.slug].join(" ").toLowerCase().includes(q))
      : items;
    return { ok: true, content: `${filtered.slice(0, args.limit).length} skills`, data: { items: filtered.slice(0, args.limit) } };
  }

  if (args.op === "add") {
    if (!workspaceId) return { ok: false, content: "workspaceId required", error: "BAD_ARGS" };
    if (!args.name) return { ok: false, content: "name required", error: "BAD_ARGS" };
    const slug = slugify(`${args.name}-${workspaceId.slice(-6)}`);
    const pack = await PluginPackModel.create({
      slug,
      name: args.name,
      description: args.description ?? null,
      version: "0.1.0",
      authorName: "YDeck agent",
      isFree: true,
      minPlan: "free",
      manifest: {
        category: args.category,
        tags: args.tags ?? [],
        procedure: args.procedure,
        source: "agent_skill",
      },
    });
    return { ok: true, content: `Saved skill ${slug}`, data: { skill: pack.toJSON() } };
  }

  if (args.op === "update") {
    if (!args.id) return { ok: false, content: "id required", error: "BAD_ARGS" };
    const pack = await PluginPackModel.findById(args.id);
    if (!pack) return { ok: false, content: "Not found", error: "NOT_FOUND" };
    if (args.name) pack.name = args.name;
    if (args.description !== undefined) pack.description = args.description;
    pack.manifest = { ...record(pack.manifest), category: args.category, tags: args.tags, procedure: args.procedure };
    await pack.save();
    return { ok: true, content: "Updated", data: { skill: pack.toJSON() } };
  }

  if (args.op === "delete") {
    if (!args.id) return { ok: false, content: "id required", error: "BAD_ARGS" };
    const deleted = await PluginPackModel.findByIdAndDelete(args.id);
    return deleted ? { ok: true, content: "Deleted" } : { ok: false, content: "Not found", error: "NOT_FOUND" };
  }

  return { ok: true, content: "Recorded" };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
