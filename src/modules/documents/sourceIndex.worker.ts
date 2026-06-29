import { logger } from "../../lib/logger";
import { claimNextSourceForIndexing, indexSourceById } from "./sourceLibrary.service";

const POLL_MS = 1500;

/**
 * Background worker that indexes uploaded sources (paginate, detect sections,
 * embed, summarize). Decoupled from the upload request so large books don't
 * block it and a restart re-claims anything left `processing`. Mirrors the
 * deck job worker in `decks/jobs.worker.ts`.
 */
export function startSourceIndexWorker(): () => void {
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const sourceId = await claimNextSourceForIndexing();
      if (sourceId) await indexSourceById(sourceId);
    } catch (err) {
      logger.warn({ err }, "source_index_worker.tick_failed");
    } finally {
      if (!stopped) setTimeout(tick, POLL_MS);
    }
  };
  setTimeout(tick, POLL_MS);
  logger.info("source index worker started");
  return () => {
    stopped = true;
    logger.info("source index worker stopped");
  };
}
