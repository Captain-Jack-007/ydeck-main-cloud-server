/**
 * Export job handler: turn a project's generated deck artifact into a
 * downloadable, editable .pptx and persist it as a File. Wired into the deck
 * job worker for jobs of type "export".
 */
import { DeckJobModel, DeckProjectModel, FileModel, type DeckJobDoc } from "../../models";
import { logger } from "../../lib/logger";
import { jobBus } from "../decks/jobs.events";
import type { CloudDeckArtifact } from "../agents/tools/cloudDeck.tools";
import { renderDeckArtifactToPptx } from "./htmlPptx";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9-_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "deck";
}

export async function runExportJob(job: DeckJobDoc): Promise<void> {
  job.status = "exporting";
  job.progress = 20;
  if (!job.startedAt) job.startedAt = new Date();
  await job.save();
  jobBus.emitJob({ jobId: job.id, status: "exporting", progress: 20, at: new Date().toISOString() });

  const project = await DeckProjectModel.findById(job.projectId).lean();
  const meta = (project?.meta ?? null) as { deckArtifact?: CloudDeckArtifact } | null;
  const existingResult = (job.resultMeta ?? null) as { deckArtifact?: CloudDeckArtifact } | null;
  const deck = meta?.deckArtifact ?? existingResult?.deckArtifact;

  if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
    job.status = "error";
    job.progress = Math.max(job.progress, 1);
    job.errorMessage = "No generated deck to export — run a generate job first.";
    job.finishedAt = new Date();
    await job.save();
    jobBus.emitJob({ jobId: job.id, status: "error", progress: job.progress, errorMessage: job.errorMessage, at: new Date().toISOString() });
    return;
  }

  const buf = await renderDeckArtifactToPptx(deck);
  const filename = `${slugify(deck.deckTitle)}.pptx`;

  const file = await FileModel.create({
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    scope: "job",
    kind: "export",
    filename,
    mimeType: PPTX_MIME,
    sizeBytes: buf.byteLength,
    storageUrl: `data:${PPTX_MIME};base64,${buf.toString("base64")}`,
    meta: { jobId: job.id, slideCount: deck.slides.length },
  });

  const exportResult = {
    fileId: file.id,
    filename,
    mimeType: PPTX_MIME,
    sizeBytes: buf.byteLength,
    downloadUrl: `/v1/files/${file.id}/download`,
  };

  job.status = "done";
  job.progress = 100;
  job.finishedAt = new Date();
  job.resultMeta = { ...(job.resultMeta as Record<string, unknown> | null), export: exportResult };
  await job.save();

  logger.info({ jobId: job.id, fileId: file.id, slides: deck.slides.length }, "export.completed");
  jobBus.emitJob({ jobId: job.id, status: "done", progress: 100, channel: "deck.export", payload: exportResult, at: new Date().toISOString() });
}
