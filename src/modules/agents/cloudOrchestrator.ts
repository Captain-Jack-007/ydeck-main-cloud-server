import { z } from "zod";

import { jobBus } from "../decks/jobs.events";
import {
  cloudWorkflowRegistry,
  type CloudAgentName,
  type CloudEventChannel,
  type CloudWorkflowDefinition,
  type CloudWorkflowName,
} from "./cloudWorkflow.contract";

export interface CloudOrchestratorJobRef {
  id: string;
  status: string;
  progress: number;
}

export interface CloudAgentStepOptions<TOutput> {
  job: CloudOrchestratorJobRef;
  agent: CloudAgentName;
  emit?: CloudEventChannel;
  input: unknown;
  schema: z.ZodType<TOutput>;
  execute: (input: unknown) => Promise<unknown>;
}

export interface CloudAgentStepResult<TOutput> {
  agent: CloudAgentName;
  ok: true;
  output: TOutput;
}

export async function runCloudAgentStep<TOutput>(
  options: CloudAgentStepOptions<TOutput>,
): Promise<CloudAgentStepResult<TOutput>> {
  emitCloudEvent(options.job, "deck.plan", {
    stage: "agent.step.start",
    agent: options.agent,
  });

  const raw = await options.execute(options.input);
  const parsed = options.schema.safeParse(raw);
  if (!parsed.success) {
    emitCloudEvent(options.job, "deck.error", {
      stage: "agent.step.validation_failed",
      agent: options.agent,
      issues: parsed.error.issues,
    });
    throw new Error(`Cloud agent ${options.agent} returned invalid output.`);
  }

  if (options.emit) {
    emitCloudEvent(options.job, options.emit, parsed.data);
  }

  return {
    agent: options.agent,
    ok: true,
    output: parsed.data,
  };
}

export function emitCloudEvent(job: CloudOrchestratorJobRef, channel: CloudEventChannel, payload: unknown): void {
  jobBus.emitJob({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    channel,
    payload,
    at: new Date().toISOString(),
  });
}

export function selectCloudWorkflow(input: {
  hasFiles?: boolean;
  needsResearch?: boolean;
  intent?: string;
}): CloudWorkflowDefinition {
  if (input.intent === "edit_deck") return cloudWorkflowRegistry.edit_deck;
  if (input.intent === "export_deck") return cloudWorkflowRegistry.export_deck;
  if (input.needsResearch) return cloudWorkflowRegistry.research_deck;
  if (input.hasFiles) return cloudWorkflowRegistry.file_to_deck;
  return cloudWorkflowRegistry.prompt_to_deck;
}

export function getCloudWorkflow(name: CloudWorkflowName): CloudWorkflowDefinition {
  return cloudWorkflowRegistry[name];
}

