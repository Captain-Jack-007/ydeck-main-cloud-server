import { z } from "zod";
import { registerTool } from "./registry";
import type { ToolResult } from "./types";
import {
  isTavilyConfigured,
  tavilySearch,
  type WebSearchHit,
} from "../../research/tavily.service";

const WebSearchArgsSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(10).default(5),
  fetchContent: z.boolean().default(false),
  // Bias toward the latest/most recent results. Omit to auto-detect from the
  // query ("latest", "today", "2026", "news", ...).
  recency: z.boolean().optional(),
});

const WebFetchArgsSchema = z.object({
  url: z.string().url().max(2000),
  maxLength: z.number().int().min(500).max(32_000).default(8_000),
});

const TriggerResearchArgsSchema = z.object({
  question: z.string().min(3).max(1000),
  maxRounds: z.number().int().min(1).max(4).default(2),
  pagesPerRound: z.number().int().min(1).max(10).default(4),
});

export function registerWebTools(): void {
  registerTool({
    name: "web_search",
    description:
      "Search the public web for up-to-date information. Returns {url, title, snippet, publishedDate} hits and a synthesized answer. Set recency=true (or ask for 'latest') to bias toward recent results; fetchContent=true to fetch top result bodies.",
    risk: "external",
    schema: WebSearchArgsSchema,
    execute: async (args): Promise<ToolResult> => {
      try {
        const { results, answer } = await webSearch(args.query, args.limit, args.recency);
        const enriched = args.fetchContent
          ? await Promise.all(
              results.map(async (r) => ({
                ...r,
                text: (await webFetchText(r.url, 3000).catch(() => "")) || undefined,
              })),
            )
          : results;
        return {
          ok: true,
          content: answer
            ? `${enriched.length} results. Answer: ${answer}`
            : `${enriched.length} results`,
          data: {
            results: enriched,
            answer,
            provider: isTavilyConfigured() ? "tavily" : "duckduckgo-html",
          },
        };
      } catch (err) {
        return { ok: false, content: `web_search failed: ${(err as Error).message}`, error: "SEARCH_FAILED" };
      }
    },
  });

  registerTool({
    name: "web_fetch",
    description: "Fetch a single HTTP(S) URL and return plain text content with HTML stripped.",
    risk: "external",
    schema: WebFetchArgsSchema,
    execute: async (args): Promise<ToolResult> => {
      try {
        const text = await webFetchText(args.url, args.maxLength);
        return { ok: true, content: `Fetched ${text.length} chars from ${args.url}`, data: { url: args.url, text } };
      } catch (err) {
        return { ok: false, content: `web_fetch failed: ${(err as Error).message}`, error: "FETCH_FAILED" };
      }
    },
  });

  registerTool({
    name: "trigger_research",
    description:
      "Run a lightweight iterative research flow: search, fetch top pages, and return a markdown findings report.",
    risk: "external",
    schema: TriggerResearchArgsSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      try {
        const findings: Array<{ title: string; url: string; snippet: string; excerpt?: string }> = [];
        const answers: string[] = [];
        for (let round = 1; round <= args.maxRounds; round += 1) {
          const query = round === 1 ? args.question : `${args.question} details examples`;
          ctx.publish?.({ channel: "agent.research", payload: { round, status: "searching", query } });
          const { results, answer } = await webSearch(query, args.pagesPerRound);
          if (answer) answers.push(answer);
          for (const result of results) {
            ctx.publish?.({ channel: "agent.research", payload: { round, status: "fetching", url: result.url } });
            const excerpt = await webFetchText(result.url, 1800).catch(() => "");
            findings.push({ ...result, excerpt: excerpt || undefined });
          }
        }
        const report = [
          `# Research: ${args.question}`,
          "",
          ...(answers.length ? [`**Summary:** ${answers[0]}`, ""] : []),
          ...findings.map((f, i) => [`## ${i + 1}. ${f.title}`, f.url, f.snippet, f.excerpt ?? ""].join("\n\n")),
        ].join("\n\n");
        return { ok: true, content: `Research complete (${findings.length} findings)`, data: { findings, report } };
      } catch (err) {
        return { ok: false, content: `trigger_research failed: ${(err as Error).message}`, error: "RESEARCH_FAILED" };
      }
    },
  });
}

async function webSearch(
  query: string,
  limit: number,
  recency?: boolean,
): Promise<{ results: WebSearchHit[]; answer?: string }> {
  // Tavily (advanced depth + recency + synthesized answer) when configured;
  // otherwise scrape DuckDuckGo HTML (no answer, no recency control).
  if (isTavilyConfigured()) {
    return tavilySearch(query, { limit, recency, includeAnswer: true });
  }
  return { results: await duckDuckGoSearch(query, limit) };
}

async function duckDuckGoSearch(query: string, limit: number): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "YDeckMainServer/1.0" } });
  if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
  const html = await res.text();
  const results: Array<{ title: string; url: string; snippet: string }> = [];
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
