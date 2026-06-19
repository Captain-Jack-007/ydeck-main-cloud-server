import { EventEmitter } from "node:events";

export interface JobEvent {
  jobId: string;
  status: string;
  progress: number;
  errorMessage?: string | null;
  channel?: string;
  payload?: unknown;
  at: string;
}

class JobBus extends EventEmitter {
  emitJob(event: JobEvent): void {
    this.emit(`job:${event.jobId}`, event);
    this.emit("job:any", event);
  }
}

export const jobBus = new JobBus();
jobBus.setMaxListeners(1000);
