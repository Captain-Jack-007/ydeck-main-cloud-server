# YDeck Main Cloud Server

Express + Mongoose backend for YDeck: AI deck generation, the Book Source
library (upload a book once → generate decks from any page range / lesson /
chapter / topic), exports (PPTX/PDF), and web research.

## Quick start

```bash
npm install
cp .env.example .env   # if present; otherwise create .env (see below)
npm run dev            # starts MongoDB, frees port 2026, runs tsx watch
```

The server listens on **http://localhost:2026** (`/health` for a status check).

## Environment variables (`.env`)

`.env` is gitignored — keep all secrets there, never commit them.

### Required
| Var | Purpose | Example |
|-----|---------|---------|
| `DATABASE_URL` | MongoDB connection | `mongodb://localhost:27017/ydeck` |
| `LLM_PROVIDER` | Which model provider to use | `openai` |
| `OPENAI_API_KEY` | OpenAI key — powers generation, summaries, embeddings | `sk-...` |
| `OPENAI_MODEL` | Chat model. Use `gpt-4o-mini` if you hit rate limits | `gpt-4o` |

> Note: a small OpenAI tier (~30k tokens/min) will rate-limit heavy decks; the
> server retries 429s automatically, but `gpt-4o-mini` has a much higher ceiling.

### Recommended — deep web search ("latest information")
| Var | Purpose |
|-----|---------|
| `TAVILY_API_KEY` | **Needed for real deep search.** Powers `web_search` + live research with advanced depth, recency filtering, and a synthesized answer. Free tier at [tavily.com](https://tavily.com). |

**Without `TAVILY_API_KEY` the server falls back to scraping DuckDuckGo HTML** —
unreliable, with no recency control and no synthesized answer. Set the key to
get current, dated results for "latest" / news-style prompts.

### Optional
| Var | Purpose |
|-----|---------|
| `OPENAI_EMBED_MODEL` | Embedding model for "search this book" (default `text-embedding-3-small`) |
| `PEXELS_API_KEY` | Stock image search for slide visuals |
| `GOOGLE_VISION_CREDENTIALS_PATH` / `TENCENT_OCR_SECRET_ID` + `TENCENT_OCR_SECRET_KEY` | OCR for scanned PDFs (not yet wired into the book-source pipeline) |
| `PORT` | HTTP port (default `2026`) |
| `RENDER_CHROMIUM_EXECUTABLE_PATH` | Custom Chromium path for screenshot/PDF rendering |

### Minimal working `.env`
```env
DATABASE_URL=mongodb://localhost:27017/ydeck
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
TAVILY_API_KEY=tvly-...
```

## Scripts
- `npm run dev` — start Mongo + dev server (tsx watch)
- `npm run build` — `tsc` compile to `dist/`
- `npm start` — run the compiled server
- `npm run typecheck` — `tsc --noEmit`
