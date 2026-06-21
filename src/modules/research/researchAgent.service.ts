import { randomToken } from "../../lib/crypto";
import { env } from "../../config/env";

export type ResearchMode = "off" | "auto" | "required" | "file_only";

export interface ResearchQuery {
  query: string;
  purpose: string;
}

export interface ResearchFact {
  claim: string;
  sourceTitle: string;
  sourceUrl: string;
  publisher?: string;
  publishedAt?: string;
  accessedAt: string;
  confidence: number;
  recommendedSlide?: number;
}

export interface ResearchSource {
  title: string;
  url: string;
  publisher?: string;
  used: boolean;
}

export interface ResearchArtifact {
  researchId: string;
  jobId: string;
  status: "skipped" | "complete" | "partial" | "error";
  queryPlan: ResearchQuery[];
  summary: string;
  facts: ResearchFact[];
  sources: ResearchSource[];
  warnings: string[];
}

export interface RunResearchInput {
  jobId: string;
  prompt: string;
  deckType: string;
  audience: string;
  slideCount: number;
  fileSummary?: string | null;
  maxQueries?: number;
  maxSourcesPerQuery?: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function runLiveResearch(input: RunResearchInput): Promise<ResearchArtifact> {
  const queryPlan = buildResearchQueryPlan(input).slice(0, input.maxQueries ?? 3);
  const internalWarnings: string[] = [];
  const sources = new Map<string, ResearchSource>();
  const facts: ResearchFact[] = [];
  const accessedAt = new Date().toISOString();
  const targetSources = input.maxSourcesPerQuery ?? 4;

  for (const query of queryPlan) {
    let results: SearchResult[] = [];
    try {
      results = await webSearch(query.query, Math.min(targetSources * 3, 10));
    } catch (err) {
      internalWarnings.push(`Search failed for "${query.query}": ${(err as Error).message}`);
      continue;
    }

    let usedForQuery = 0;
    for (const result of results) {
      if (usedForQuery >= targetSources) break;
      if (shouldSkipResearchUrl(result.url)) continue;
      sources.set(result.url, {
        title: result.title,
        url: result.url,
        publisher: publisherFromUrl(result.url),
        used: false,
      });
      let text = "";
      try {
        text = await webFetchText(result.url, 5000);
      } catch (err) {
        internalWarnings.push(`Fetch failed for ${result.url}: ${(err as Error).message}`);
      }
      const extracted = extractFactsFromText({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        text,
        accessedAt,
        slideCount: input.slideCount,
      });
      if (extracted.length) {
        sources.set(result.url, { ...sources.get(result.url)!, used: true });
        facts.push(...extracted);
        usedForQuery += 1;
      }
    }
  }

  const uniqueFacts = dedupeFacts(facts).slice(0, 16);
  const usedSources = Array.from(sources.values()).filter((source) => source.used);
  const publicWarnings = usedSources.length
    ? []
    : internalWarnings.length
      ? ["Some sources could not be accessed, so research results may be limited."]
      : [];
  return {
    researchId: `rsch_${randomToken(6)}`,
    jobId: input.jobId,
    status: usedSources.length ? "complete" : internalWarnings.length ? "partial" : "skipped",
    queryPlan,
    summary: usedSources.length
      ? `Research completed with ${usedSources.length} useful sources and ${uniqueFacts.length} extracted facts.`
      : "No useful live web research sources were found.",
    facts: uniqueFacts,
    sources: usedSources.length ? usedSources.slice(0, 12) : [],
    warnings: publicWarnings,
  };
}

export function shouldResearch(input: {
  researchMode?: unknown;
  classifierNeedsResearch: boolean;
  prompt: string;
}): boolean {
  const mode = normalizeResearchMode(input.researchMode);
  if (mode === "off" || mode === "file_only") return false;
  if (mode === "required") return true;
  return input.classifierNeedsResearch || researchKeywords(input.prompt);
}

export function normalizeResearchMode(value: unknown): ResearchMode {
  return value === "off" || value === "required" || value === "file_only" ? value : "auto";
}

function buildResearchQueryPlan(input: RunResearchInput): ResearchQuery[] {
  const base = compactQuery(input.prompt);
  const deckType = input.deckType.replace(/[_-]+/g, " ");
  const queries: ResearchQuery[] = [
    {
      query: `${base} market size statistics trends`,
      purpose: "Find market size, trend, or statistical context.",
    },
    {
      query: `${base} competitors companies examples`,
      purpose: "Find competitor, company, or example context.",
    },
    {
      query: `${deckType} ${input.audience} recent data 2026`,
      purpose: "Find recent supporting data for the target audience.",
    },
  ];
  if (input.fileSummary) {
    queries.unshift({
      query: `${compactQuery(input.fileSummary)} external validation data`,
      purpose: "Validate uploaded-file claims against external sources.",
    });
  }
  return dedupeQueries(queries);
}

async function webSearch(query: string, limit: number): Promise<SearchResult[]> {
  if (env.tavilyApiKey) return tavilySearch(query, limit);
  return duckDuckGoSearch(query, limit);
}

async function tavilySearch(query: string, limit: number): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.tavilyApiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: limit,
      search_depth: "advanced",
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily search failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      score?: number;
    }>;
  };
  return (body.results ?? [])
    .filter((result) => result.url)
    .slice(0, limit)
    .map((result) => ({
      title: result.title ?? result.url ?? "Untitled source",
      url: result.url ?? "",
      snippet: result.content ?? "",
    }));
}

async function duckDuckGoSearch(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "YDeckMainServer/1.0" } });
  if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
  const html = await res.text();
  const results: SearchResult[] = [];
  const blockRe = /<div class="result[\s\S]*?<\/div>\s*<\/div>/gi;
  for (const blockMatch of html.matchAll(blockRe)) {
    const block = blockMatch[0];
    const link = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!link) continue;
    const snippet = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] ?? "";
    results.push({
      title: decodeEntities(stripHtml(link[2])),
      url: normalizeDuckDuckGoUrl(decodeEntities(link[1])),
      snippet: decodeEntities(stripHtml(snippet)),
    });
    if (results.length >= limit) break;
  }
  return results;
}

async function webFetchText(url: string, maxLength: number): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Only HTTP(S) URLs are supported.");
  const res = await fetch(url, { headers: { "User-Agent": "YDeckMainServer/1.0" } });
  if (!res.ok) throw new Error(`Fetch HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  const plain = contentType.includes("html") ? stripHtml(text) : text;
  return decodeEntities(plain).replace(/\s{3,}/g, " ").trim().slice(0, maxLength);
}

function extractFactsFromText(input: {
  title: string;
  url: string;
  snippet: string;
  text: string;
  accessedAt: string;
  slideCount: number;
}): ResearchFact[] {
  const combined = `${input.snippet}. ${input.text}`;
  const sentences = combined
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 60 && sentence.length <= 280)
    .filter((sentence) => /%|\$|billion|million|market|growth|trend|competitor|company|industry|students|teachers|education|AI|artificial intelligence|revenue|CAGR|202[0-9]/i.test(sentence))
    .slice(0, 3);
  return sentences.map((claim, index) => ({
    claim,
    sourceTitle: input.title,
    sourceUrl: input.url,
    publisher: publisherFromUrl(input.url),
    accessedAt: input.accessedAt,
    confidence: confidenceForClaim(claim),
    recommendedSlide: Math.min(Math.max(3 + index, 1), input.slideCount),
  }));
}

function confidenceForClaim(claim: string): number {
  let score = 0.55;
  if (/\d/.test(claim)) score += 0.12;
  if (/%|\$|million|billion|CAGR/i.test(claim)) score += 0.1;
  if (/according to|reported|estimated|forecast|study|survey/i.test(claim)) score += 0.08;
  return Math.min(0.9, Number(score.toFixed(2)));
}

function researchKeywords(prompt: string): boolean {
  return /\b(market size|competitor|competitors|recent|latest|trend|trends|statistics|stats|data|news|country|policy|government|financial|business facts|investor|industry|CAGR|forecast)\b/i.test(prompt);
}

function compactQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 120) || "presentation research";
}

function dedupeQueries(queries: ResearchQuery[]): ResearchQuery[] {
  const seen = new Set<string>();
  return queries.filter((query) => {
    const key = query.query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeFacts(facts: ResearchFact[]): ResearchFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.sourceUrl}:${fact.claim.slice(0, 80).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function publisherFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function shouldSkipResearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (["youtube.com", "youtu.be", "facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com"].some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
      return true;
    }
    if (/\.(pdf|ppt|pptx|doc|docx|xls|xlsx|zip|mp4|mov|avi)(?:$|\?)/i.test(parsed.pathname)) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function normalizeDuckDuckGoUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.href;
  } catch {
    return url;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}
