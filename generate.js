/**
 * Daily content generator.
 *
 * Pipeline: fetch real trending items (free sources) → AI writes high-value,
 * grounded posts (Gemini) → merge into the archive at site/data/posts.json.
 *
 * Works WITHOUT a key (fallback: grounded structured posts from source data),
 * so the build never fails. With GEMINI_API_KEY it produces rich analysis.
 *
 * Output: one "daily brief" (one headline per category) + 3-4 featured
 * deep-dive posts, appended to a capped rolling archive.
 */

const fs = require('fs');
const path = require('path');
const { fetchCategory } = require('./lib/sources');
const gemini = require('./lib/gemini');

const CATS = [
  { key: 'tech', label: 'Tech' },
  { key: 'science', label: 'Science' },
  { key: 'ai', label: 'AI' },
  { key: 'business', label: 'Business' },
  { key: 'startups', label: 'Startups' },
  { key: 'industry', label: 'Industry' },
  { key: 'humanity', label: 'Humanity' },
  { key: 'viral', label: 'Viral' },
];

const DATA_DIR = path.join(__dirname, 'data');
const ARCHIVE = path.join(DATA_DIR, 'posts.json');
const FEATURED_COUNT = 4;
const MAX_POSTS = 500;
const MAX_BRIEFS = 120;

const today = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

function finalizePost(j, item, cat, ai) {
  const title = String(j.title || item.title).slice(0, 120);
  return {
    slug: slugify(title) + '-' + today().replace(/-/g, ''),
    title,
    dek: j.dek || '',
    body: j.body || '',
    takeaways: Array.isArray(j.takeaways) ? j.takeaways.slice(0, 5) : [],
    tags: (Array.isArray(j.tags) ? j.tags : [cat.key]).slice(0, 5).map((t) => String(t).toLowerCase()),
    category: cat.key,
    categoryLabel: cat.label,
    source: { name: item.source, url: item.url },
    impact: Math.max(1, Math.min(100, Math.round(j.impact || 60))),
    date: today(),
    ai: !!ai,
    ts: nowISO(),
  };
}

async function writePost(item, cat) {
  if (gemini.hasKey()) {
    const system =
      'You are a world-class technology and science journalist. You write accurate, ' +
      'high-signal, non-hyperbolic analysis grounded ONLY in the provided source. Never ' +
      'invent facts, numbers, names, or quotes beyond the source — if the source is thin, ' +
      'keep claims general and clearly framed as context. Punchy, clear, genuinely valuable.';
    const user =
      `Write a high-value post about this trending ${cat.label} item.\n\n` +
      `SOURCE TITLE: ${item.title}\n` +
      `SOURCE: ${item.source}\nURL: ${item.url}\n` +
      `SOURCE TEXT: ${item.summary || '(none — base it on the title only; stay general and frame as analysis)'}\n\n` +
      `Return ONLY minified JSON:\n` +
      `{"title":"<sharp headline <=80 chars>","dek":"<1-sentence subtitle>",` +
      `"body":"<3-5 short markdown paragraphs: what happened, why it matters, the bigger picture. No fabricated specifics.>",` +
      `"takeaways":["<3-4 crisp takeaways>"],"tags":["<2-4 lowercase tags>"],` +
      `"impact":<integer 1-100 importance>}`;
    try {
      return finalizePost(await gemini.chatJSON(system, user, { maxTokens: 1600 }), item, cat, true);
    } catch (e) {
      console.error(`  ai post failed (${cat.key}): ${e.message} — using fallback`);
    }
  }
  // Fallback: grounded structured post from the real source (no fabrication).
  return finalizePost(
    {
      dek: `Trending in ${cat.label} — surfaced from ${item.source}.`,
      body:
        (item.summary ? item.summary + '\n\n' : '') +
        `This is a trending ${cat.label.toLowerCase()} item picked up from ${item.source}. ` +
        `Follow the source link for the full story. *(Rich AI analysis appears here once a GEMINI_API_KEY is configured.)*`,
      takeaways: [`Trending now in ${cat.label}`, `Source: ${item.source}`, `${item.comments || 0} comments / ${item.score || 0} points`],
      tags: [cat.key, 'trending'],
      impact: Math.min(95, 55 + Math.round((item.score || 0) / 25)),
    },
    item,
    cat,
    false
  );
}

async function buildBrief(topByCat) {
  const items = CATS.map((c) => {
    const t = topByCat[c.key] && topByCat[c.key][0];
    return t ? { key: c.key, category: c.label, title: t.title, url: t.url, source: t.source } : null;
  }).filter(Boolean);

  let intro = 'Your daily signal across tech, science, AI, business, startups, and the wider world.';
  const lines = {};

  if (gemini.hasKey() && items.length) {
    const system =
      'You are the editor of a premium daily tech & science briefing. Crisp, smart, zero fluff. ' +
      'Ground every line ONLY in the provided headlines; never invent specifics.';
    const user =
      `Write a punchy 1-sentence intro for today's brief, plus a sharp 1-sentence "why it matters" per headline.\n` +
      `Return ONLY minified JSON: {"intro":"<1 sentence>","items":[{"key":"<key>","line":"<1 sentence>"}]}\n\n` +
      `HEADLINES:\n${items.map((i) => `- [${i.key}] ${i.title} (${i.source})`).join('\n')}`;
    try {
      const j = await gemini.chatJSON(system, user, { maxTokens: 1024 });
      if (j.intro) intro = j.intro;
      for (const it of j.items || []) if (it && it.key) lines[it.key] = it.line;
    } catch (e) {
      console.error(`  ai brief failed: ${e.message}`);
    }
  }

  return {
    date: today(),
    ts: nowISO(),
    intro,
    items: items.map((i) => ({ ...i, line: lines[i.key] || `Trending in ${i.category}.` })),
  };
}

function loadArchive() {
  try {
    const a = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
    return { posts: a.posts || [], briefs: a.briefs || [] };
  } catch {
    return { posts: [], briefs: [] };
  }
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`\nViralEngine Daily — generating (${gemini.hasKey() ? 'AI: ' + gemini.MODEL : 'NO KEY → fallback mode'})\n`);

  const topByCat = {};
  for (const c of CATS) {
    topByCat[c.key] = await fetchCategory(c.key);
    console.log(`  ${c.label.padEnd(9)} ${topByCat[c.key].length} item(s)`);
  }

  const brief = await buildBrief(topByCat);

  // Featured: one distinct top item per category (deduped by title across
  // categories so a shared front-page story can't repeat), then top N by score.
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
  const usedTitles = new Set();
  const pool = [];
  for (const c of CATS) {
    const pick = (topByCat[c.key] || []).find((it) => !usedTitles.has(norm(it.title)));
    if (pick) {
      usedTitles.add(norm(pick.title));
      pool.push({ item: pick, cat: c });
    }
  }
  pool.sort((a, b) => (b.item.score || 0) - (a.item.score || 0));
  const featured = [];
  for (const p of pool.slice(0, FEATURED_COUNT)) {
    console.log(`  → featuring [${p.cat.key}] ${p.item.title.slice(0, 60)}`);
    featured.push(await writePost(p.item, p.cat));
  }

  const archive = loadArchive();
  const oldBySlug = new Map(archive.posts.map((p) => [p.slug, p]));
  // Merge today's posts: a same-slug post replaces the old one, but never
  // downgrade a rich AI post back to a fallback (e.g. a later same-day re-run
  // that hit a quota). Then keep the rest of the archive untouched.
  const result = [];
  const used = new Set();
  for (const p of featured) {
    const old = oldBySlug.get(p.slug);
    const chosen = old && old.ai && !p.ai ? old : p;
    if (!used.has(chosen.slug)) { result.push(chosen); used.add(chosen.slug); }
  }
  for (const p of archive.posts) {
    if (!used.has(p.slug)) { result.push(p); used.add(p.slug); }
  }
  const added = result.filter((p) => !oldBySlug.has(p.slug)).length;
  const upgraded = featured.filter((p) => { const o = oldBySlug.get(p.slug); return o && !o.ai && p.ai; }).length;
  archive.posts = result.slice(0, MAX_POSTS);
  archive.briefs = [brief, ...archive.briefs.filter((b) => b.date !== brief.date)].slice(0, MAX_BRIEFS);
  archive.updated = nowISO();

  fs.writeFileSync(ARCHIVE, JSON.stringify(archive, null, 2));
  console.log(`\n✓ +${added} new · ${upgraded} upgraded · brief ${brief.date} · archive now ${archive.posts.length} posts\n`);
}

main().catch((e) => {
  console.error('GENERATE FAILED:', e);
  process.exit(1);
});
