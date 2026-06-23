import { EventEmitter } from "node:events";
import { recordJobEvent } from "./jobEventLog.service";

export interface JobEvent {
  jobId: string;
  status: string;
  progress: number;
  seq?: number;
  errorMessage?: string | null;
  channel?: string;
  payload?: unknown;
  at: string;
}

class JobBus extends EventEmitter {
  private readonly chains = new Map<string, Promise<void>>();

  emitJob(event: JobEvent): void {
    const previous = this.chains.get(event.jobId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.persistAndEmit(event));

    this.chains.set(event.jobId, next);
    void next.finally(() => {
      if (this.chains.get(event.jobId) === next) {
        this.chains.delete(event.jobId);
      }
    });
  }

  private async persistAndEmit(event: JobEvent): Promise<void> {
    const seq = await recordJobEvent(event);
    const loggedEvent = seq ? { ...event, seq } : event;
    this.emit(`job:${event.jobId}`, loggedEvent);
    this.emit("job:any", loggedEvent);
  }
}

export const jobBus = new JobBus();
jobBus.setMaxListeners(1000);
