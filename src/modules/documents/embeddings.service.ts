/**
 * Text embeddings for semantic book search.
 *
 * Reuses the cloud LLM config: if an OpenAI key is set it uses the OpenAI
 * embeddings endpoint, otherwise an OpenAI-compatible base URL if configured.
 * When no embeddings backend is available it returns null so callers can fall
 * back to keyword search — semantic search is an enhancement, never required.
 */
import { effectiveCloudConfig } from "../agents/cloudLlm";

const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
const BATCH_SIZE = 256;

interface EmbedEndpoint {
  url: string;
  apiKey: string;
}

async function resolveEndpoint(): Promise<EmbedEndpoint | null> {
  const cfg = await effectiveCloudConfig();
  if (cfg.keys.openai) {
    return { url: "https://api.openai.com/v1/embeddings", apiKey: cfg.keys.openai };
  }
  const base = cfg.baseUrls["openai-compatible"];
  if (base && cfg.keys["openai-compatible"]) {
    return {
      url: `${base.replace(/\/$/, "")}/embeddings`,
      apiKey: cfg.keys["openai-compatible"],
    };
  }
  return null;
}

export async function isEmbeddingsConfigured(): Promise<boolean> {
  return (await resolveEndpoint()) !== null;
}

/** Embed a batch of texts. Returns null if no embeddings backend is configured. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  const endpoint = await resolveEndpoint();
  if (!endpoint) return null;

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => t.slice(0, 8000) || " ");
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
    });
    if (!res.ok) {
      throw new Error(`Embeddings request failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { data?: Array<{ embedding: number[]; index: number }> };
    const sorted = (body.data ?? []).sort((a, b) => a.index - b.index);
    for (const item of sorted) out.push(item.embedding);
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const result = await embedTexts([text]);
  return result?.[0] ?? null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
