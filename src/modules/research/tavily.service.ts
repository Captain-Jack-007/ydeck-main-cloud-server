/**
 * Shared Tavily client used by the web_search tool and the live-research
 * pipeline. Tavily is the "deep search" API for agents: advanced search depth,
 * recency controls for latest information, and an optional synthesized answer.
 *
 * Set TAVILY_API_KEY (or TAVILY_WEB_SEARCH_API / CLOUD_TAVILY_API_KEY) to
 * activate it; callers fall back to DuckDuckGo HTML scraping when it is unset.
 */
import { env } from "../../config/env";

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  publishedDate?: string;
}

export interface TavilyResult {
  results: WebSearchHit[];
  answer?: string;
}

export interface TavilyOptions {
  limit?: number;
  /** Bias toward fresh results (defaults to auto-detect from the query). */
  recency?: boolean;
  /** Tavily time window when recency is on: day | week | month | year. */
  timeRange?: "day" | "week" | "month" | "year";
  /** Ask Tavily for a synthesized answer over the results. */
  includeAnswer?: boolean;
}

export function isTavilyConfigured(): boolean {
  return Boolean(env.tavilyApiKey);
}

/** Heuristic: does this query want the latest / most recent information? */
export function wantsRecency(query: string): boolean {
  return /\b(latest|recent|recently|current|currently|today|tonight|now|breaking|news|update[ds]?|this\s+(week|month|year)|past\s+(week|month|year)|up[-\s]?to[-\s]?date|as\s+of|20(2[5-9]|[3-9]\d))\b/i.test(
    query,
  );
}

export async function tavilySearch(query: string, opts: TavilyOptions = {}): Promise<TavilyResult> {
  if (!env.tavilyApiKey) throw new Error("Tavily API key not set");
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 20));
  const recency = opts.recency ?? wantsRecency(query);

  const body: Record<string, unknown> = {
    query,
    max_results: limit,
    search_depth: "advanced",
    topic: "general",
    include_answer: opts.includeAnswer ? "advanced" : false,
    include_raw_content: false,
  };
  // Recency: narrow to a recent time window so "latest" queries surface fresh,
  // dated results instead of stale evergreen pages.
  if (recency) body.time_range = opts.timeRange ?? "month";

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.tavilyApiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Tavily search failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    answer?: string;
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      score?: number;
      published_date?: string;
    }>;
  };
  const results = (data.results ?? [])
    .filter((r) => r.url)
    .slice(0, limit)
    .map((r) => ({
      title: r.title ?? r.url ?? "Untitled source",
      url: r.url ?? "",
      snippet: r.content ?? "",
      score: typeof r.score === "number" ? r.score : undefined,
      publishedDate: r.published_date || undefined,
    }));
  return { results, answer: data.answer?.trim() || undefined };
}
