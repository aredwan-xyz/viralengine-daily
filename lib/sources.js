/**
 * Trending sources — free, no API key required.
 * Each fetcher returns a normalized array of items:
 *   { title, url, source, score, comments, summary }
 *
 * Hacker News (Algolia) and arXiv are the reliable backbone; Reddit adds
 * flavor when reachable. Every fetch is wrapped so one failing source never
 * breaks a category.
 */

const UA = 'viralengine-daily/1.0 (+https://github.com/aredwan-xyz/viralengine)';

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// --- Hacker News via Algolia -------------------------------------------------
// Note: HN search treats query words as AND (no boolean OR), so use ONE keyword
// per call and merge several via hnAny(). sinceDays biases toward fresh stories.
async function hn(query, { tags = 'story', minPoints = 20, limit = 10, sinceDays = 0 } = {}) {
  const q = query ? `query=${encodeURIComponent(query)}&` : '';
  let nf = '';
  if (sinceDays > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - sinceDays * 86400;
    nf = `&numericFilters=created_at_i>${cutoff}`;
  }
  const data = await getJSON(`https://hn.algolia.com/api/v1/search?${q}tags=${tags}&hitsPerPage=${limit}${nf}`);
  return (data.hits || [])
    .filter((h) => h.title && (h.points || 0) >= (tags === 'show_hn' ? 5 : minPoints))
    .map((h) => ({
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      source: 'Hacker News',
      score: h.points || 0,
      comments: h.num_comments || 0,
      summary: (h.story_text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
    }));
}

// Several single-keyword HN searches, merged (works around the lack of OR).
async function hnAny(terms, opts = {}) {
  return merge(terms.map((t) => hn(t, opts)));
}

// --- Reddit (top of day) -----------------------------------------------------
async function reddit(sub, { limit = 10 } = {}) {
  const data = await getJSON(`https://www.reddit.com/r/${sub}/top.json?t=day&limit=${limit}`);
  return (data.data?.children || [])
    .map((c) => c.data)
    .filter((p) => p && p.title && !p.over_18 && !p.stickied)
    .map((p) => ({
      title: p.title,
      url: p.url_overridden_by_dest && !/redd\.it|reddit\.com/.test(p.url_overridden_by_dest)
        ? p.url_overridden_by_dest
        : `https://www.reddit.com${p.permalink}`,
      source: `r/${sub}`,
      score: p.ups || 0,
      comments: p.num_comments || 0,
      summary: (p.selftext || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    }));
}

// --- arXiv (latest research) -------------------------------------------------
async function arxiv(cat, { limit = 6 } = {}) {
  const xml = await getText(
    `http://export.arxiv.org/api/query?search_query=cat:${cat}&sortBy=submittedDate&sortOrder=descending&max_results=${limit}`
  );
  return xml.split('<entry>').slice(1).map((e) => {
    const pick = (tag) => {
      const m = e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].replace(/\s+/g, ' ').trim() : '';
    };
    return {
      title: pick('title'),
      url: pick('id'),
      source: 'arXiv',
      score: 0,
      comments: 0,
      summary: pick('summary').slice(0, 600),
    };
  }).filter((x) => x.title);
}

// --- merge + rank + dedupe ---------------------------------------------------
async function merge(promises) {
  const settled = await Promise.allSettled(promises);
  const items = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const seen = new Set();
  const out = [];
  for (const it of items.sort((a, b) => (b.score || 0) - (a.score || 0))) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// Category → source plan. Hacker News + arXiv are the always-on backbone so no
// category is empty even when Reddit is blocked (it often is from data centers).
const CATEGORIES = {
  tech: () => merge([hn('', { tags: 'front_page' }), hnAny(['software', 'hardware', 'chip'], { minPoints: 10, sinceDays: 4 }), reddit('technology')]),
  science: () => merge([hnAny(['science', 'research', 'physics', 'space'], { minPoints: 8, sinceDays: 5 }), arxiv('physics.gen-ph'), reddit('science')]),
  ai: () => merge([hnAny(['AI', 'LLM', 'machine learning', 'neural'], { minPoints: 8, sinceDays: 5 }), arxiv('cs.AI'), reddit('artificial')]),
  business: () => merge([hnAny(['funding', 'acquisition', 'revenue', 'economy'], { minPoints: 5, sinceDays: 6 }), reddit('business')]),
  startups: () => merge([hn('Show HN', { tags: 'show_hn' }), hnAny(['startup', 'founder'], { minPoints: 5, sinceDays: 6 }), reddit('startups')]),
  industry: () => merge([hnAny(['launch', 'release', 'announces', 'acquires'], { minPoints: 8, sinceDays: 5 }), hn('', { tags: 'front_page' })]),
  humanity: () => merge([hnAny(['climate', 'health', 'longevity', 'breakthrough', 'education'], { minPoints: 5, sinceDays: 6 }), reddit('UpliftingNews'), reddit('Futurology')]),
  viral: () => merge([hn('', { tags: 'front_page' }), reddit('popular')]),
};

async function fetchCategory(key) {
  try {
    return (await CATEGORIES[key]()).slice(0, 8);
  } catch (e) {
    console.error(`  source[${key}] failed: ${e.message}`);
    return [];
  }
}

module.exports = { fetchCategory, hn, reddit, arxiv };
