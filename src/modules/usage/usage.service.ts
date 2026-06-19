import { UsageRecordModel } from "../../models";
import { logger } from "../../lib/logger";

/**
 * Records a usage metric for a workspace. Best-effort: failures are logged, not thrown,
 * because metering should never break the originating request.
 */
export async function recordUsage(
  workspaceId: string,
  metric: string,
  quantity = 1,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await UsageRecordModel.create({
      workspaceId,
      metric,
      quantity,
      meta: meta ?? null,
    });
  } catch (err) {
    logger.warn({ err, workspaceId, metric }, "usage.record_failed");
  }
}
