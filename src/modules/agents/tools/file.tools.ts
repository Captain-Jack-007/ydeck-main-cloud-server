import { z } from "zod";
import { FileModel } from "../../../models";
import { registerTool } from "./registry";
import type { ToolResult } from "./types";

const MAX_FETCH_BYTES = 200_000;

const ReadFileArgsSchema = z.object({
  fileId: z.string().min(1).optional(),
  path: z.string().min(1).max(2048).optional(),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});

const WriteFileArgsSchema = z.object({
  filename: z.string().min(1).max(255),
  kind: z.string().min(1).max(80).default("agent_artifact"),
  content: z.string().max(MAX_FETCH_BYTES),
  mimeType: z.string().max(120).optional(),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});

const ListFilesArgsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  kind: z.string().max(80).optional(),
});

export function registerFileTools(): void {
  registerTool({
    name: "read_file",
    description:
      "Read a cloud file by fileId, or fetch a direct HTTP(S) URL. Workspace/project access is enforced by tool context.",
    risk: "read",
    schema: ReadFileArgsSchema,
    execute: (args, ctx) => readCloudFile(args, ctx.workspaceId, ctx.projectId),
  });

  registerTool({
    name: "write_file",
    description:
      "Create a small text artifact record for this workspace/project. Content is stored as a data URL in File.storageUrl.",
    risk: "write",
    schema: WriteFileArgsSchema,
    execute: (args, ctx) => writeCloudFile(args, ctx.workspaceId, ctx.projectId),
  });

  registerTool({
    name: "list_files",
    description: "List recent cloud files for this workspace/project.",
    risk: "read",
    schema: ListFilesArgsSchema,
    execute: (args, ctx) => listCloudFiles(args, ctx.workspaceId, ctx.projectId),
  });
}

async function readCloudFile(
  args: z.infer<typeof ReadFileArgsSchema>,
  workspaceId?: string,
  projectId?: string,
): Promise<ToolResult> {
  try {
    let url = args.path;
    let fileMeta: unknown = null;
    if (args.fileId) {
      const file = await FileModel.findById(args.fileId).lean();
      if (!file) return { ok: false, content: "File not found", error: "NOT_FOUND" };
      if (workspaceId && String(file.workspaceId) !== workspaceId) {
        return { ok: false, content: "File is outside this workspace", error: "FORBIDDEN" };
      }
      if (projectId && file.projectId && String(file.projectId) !== projectId) {
        return { ok: false, content: "File is outside this project", error: "FORBIDDEN" };
      }
      url = file.storageUrl;
      fileMeta = file;
    }
    if (!url) return { ok: false, content: "fileId or path required", error: "BAD_ARGS" };
    if (url.startsWith("data:")) {
      return readDataUrl(url, args.encoding);
    }
    if (!/^https?:\/\//i.test(url)) {
      return {
        ok: false,
        content: "Cloud server can only read FileModel data URLs or HTTP(S) URLs.",
        error: "UNSUPPORTED_STORAGE_URL",
      };
    }
    const res = await fetch(url);
    if (!res.ok) return { ok: false, content: `Fetch failed: ${res.status}`, error: "FETCH_FAILED" };
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_FETCH_BYTES) {
      return { ok: false, content: `File exceeds ${MAX_FETCH_BYTES} bytes`, error: "FILE_TOO_LARGE" };
    }
    const buf = Buffer.from(ab);
    return {
      ok: true,
      content: args.encoding === "base64" ? buf.toString("base64") : buf.toString("utf8"),
      data: { file: fileMeta, bytes: buf.byteLength },
    };
  } catch (err) {
    return { ok: false, content: `read_file failed: ${(err as Error).message}`, error: "READ_FAILED" };
  }
}

async function writeCloudFile(
  args: z.infer<typeof WriteFileArgsSchema>,
  workspaceId?: string,
  projectId?: string,
): Promise<ToolResult> {
  if (!workspaceId) return { ok: false, content: "workspaceId required", error: "BAD_ARGS" };
  const buf = args.encoding === "base64" ? Buffer.from(args.content, "base64") : Buffer.from(args.content, "utf8");
  if (buf.byteLength > MAX_FETCH_BYTES) {
    return { ok: false, content: `Content exceeds ${MAX_FETCH_BYTES} bytes`, error: "CONTENT_TOO_LARGE" };
  }
  const mimeType = args.mimeType ?? "text/plain";
  const storageUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
  const file = new FileModel({
    workspaceId,
    projectId: projectId ?? null,
    scope: projectId ? "job" : "workspace",
    kind: args.kind,
    filename: args.filename,
    mimeType,
    sizeBytes: buf.byteLength,
    storageUrl,
    meta: { source: "agent_tool" },
  });
  await file.save();
  return { ok: true, content: `Created file ${file.id}`, data: { file: file.toJSON() } };
}

async function listCloudFiles(
  args: z.infer<typeof ListFilesArgsSchema>,
  workspaceId?: string,
  projectId?: string,
): Promise<ToolResult> {
  if (!workspaceId) return { ok: false, content: "workspaceId required", error: "BAD_ARGS" };
  const query: Record<string, unknown> = { workspaceId };
  if (projectId) query.$or = [{ projectId }, { projectId: null }];
  if (args.kind) query.kind = args.kind;
  const files = await FileModel.find(query)
    .sort({ createdAt: -1 })
    .limit(args.limit)
    .select("workspaceId projectId scope kind filename mimeType sizeBytes storageUrl checksum meta createdAt")
    .lean();
  return { ok: true, content: `${files.length} files`, data: { files } };
}

function readDataUrl(url: string, encoding: "utf8" | "base64"): ToolResult {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(url);
  if (!match) return { ok: false, content: "Invalid data URL", error: "BAD_DATA_URL" };
  const buf = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
  if (buf.byteLength > MAX_FETCH_BYTES) {
    return { ok: false, content: `File exceeds ${MAX_FETCH_BYTES} bytes`, error: "FILE_TOO_LARGE" };
  }
  return { ok: true, content: encoding === "base64" ? buf.toString("base64") : buf.toString("utf8"), data: { bytes: buf.byteLength } };
}
