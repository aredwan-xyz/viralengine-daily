# ⚡ ViralEngine Daily

A self-updating content site. Every day a GitHub Action pulls **real trending
items** from free sources, has an AI write **grounded, high-signal posts**, and
publishes them to **GitHub Pages** — a daily brief plus featured deep-dives
across Tech · Science · AI · Business · Startups · Industry · Humanity · Viral.

> Grounded by design: the AI only writes analysis of *real* items (with source
> links), so it stays current and doesn't hallucinate the news.

*The automated content/distribution arm of [ViralEngine](https://github.com/aredwan-xyz/viralengine).*

---

## How it works

```
lib/sources.js   fetch trending items (Hacker News, arXiv, Reddit) — no API keys
lib/gemini.js    minimal Gemini client (OpenAI-compatible), graceful no-key fallback
generate.js      pipeline: trending → AI posts → merge into data/posts.json
build.js         render data → static site in dist/ (zero framework)
assets/          premium dark styles + category filtering
.github/workflows/daily-content.yml   the daily cron: generate → build → deploy
```

- **Sources need no keys** and are resilient — if one is blocked (Reddit often
  is from CI), Hacker News + arXiv keep every category populated.
- **AI is optional but recommended.** With `GEMINI_API_KEY` set, posts are rich
  analysis. Without it, the generator still produces grounded posts from the raw
  source data, so a build never fails.
- The growing archive is persisted on a dedicated **`content` branch** (bot-owned),
  so the working branches stay code-only.

---

## Run it locally

```bash
# 1. generate today's content (real trending data; add a key for AI prose)
GEMINI_API_KEY=your_key npm run generate     # key optional

# 2. build the static site
npm run build

# 3. preview it
npm run serve        # open http://localhost:8000

# (or do steps 1+2 in one go: npm run daily)
```

`data/` and `dist/` are gitignored — they're generated.

---

## Going live (one-time setup)

1. **Add the AI key** — repo **Settings → Secrets and variables → Actions → New
   repository secret**: `GEMINI_API_KEY` = your Gemini key
   ([aistudio.google.com/apikey](https://aistudio.google.com/apikey), free).
   *(Optional: a repo **variable** `MODEL` to override `gemini-2.0-flash`.)*
2. **Enable Pages** — **Settings → Pages → Source: GitHub Actions**.
3. **Activate the cron** — make sure the workflow is on the default branch.
   The job runs daily at 13:00 UTC; you can also trigger it any time from the
   **Actions** tab (**Daily Content → Run workflow**).

---

## Tuning

- **Cadence** — the `cron` in `.github/workflows/daily-content.yml`.
- **Volume** — `FEATURED_COUNT` in `generate.js`.
- **Topics / sources** — the `CATEGORIES` map in `lib/sources.js`.
- **Look** — `assets/styles.css` (category accent colors live in `build.js`).
