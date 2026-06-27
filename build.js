/**
 * Static site builder. Reads site/data/posts.json and renders a fast,
 * zero-framework site into site/dist/:
 *   index.html            — hero, daily brief, featured, filterable archive
 *   post/<slug>.html      — individual article pages
 *   assets/, data/        — styles, script, and the raw data
 *
 * Relative paths throughout, so it works under any GitHub Pages base path.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'data', 'posts.json');

const SITE = {
  title: 'ViralEngine Daily',
  tagline: 'High-signal, AI-written intelligence across tech, science & the world — refreshed every day.',
  repo: 'https://github.com/aredwan-xyz/viralengine',
};

const CATS = [
  { key: 'tech', label: 'Tech', accent: '#3b82f6' },
  { key: 'science', label: 'Science', accent: '#14b8a6' },
  { key: 'ai', label: 'AI', accent: '#8b5cf6' },
  { key: 'business', label: 'Business', accent: '#f59e0b' },
  { key: 'startups', label: 'Startups', accent: '#10b981' },
  { key: 'industry', label: 'Industry', accent: '#0ea5e9' },
  { key: 'humanity', label: 'Humanity', accent: '#f43f5e' },
  { key: 'viral', label: 'Viral', accent: '#d946ef' },
];
const catMeta = Object.fromEntries(CATS.map((c) => [c.key, c]));

// --- helpers ---------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

function inline(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function md(src) {
  return String(src || '')
    .split(/\n{2,}/)
    .map((b) => {
      b = b.trim();
      if (!b) return '';
      if (/^#{1,3}\s/.test(b)) {
        const lvl = Math.min(4, b.match(/^#+/)[0].length + 1);
        return `<h${lvl}>${inline(b.replace(/^#+\s/, ''))}</h${lvl}>`;
      }
      if (/^[-*]\s/.test(b)) {
        const items = b.split(/\n/).filter((l) => /^[-*]\s/.test(l)).map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${inline(b.replace(/\n/g, ' '))}</p>`;
    })
    .join('\n');
}

const fmtDate = (iso) => {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : ''));
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

function layout(title, bodyHtml, { depth = 0, description = SITE.tagline } = {}) {
  const up = '../'.repeat(depth);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${escAttr(description)}" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${up}assets/styles.css" />
</head>
<body>
<div class="orbs" aria-hidden="true"><span></span><span></span><span></span></div>
<header class="site-header">
  <a class="brand" href="${up}index.html"><span class="logo">⚡</span><span>Viral<span class="grad">Engine</span> <span class="daily">Daily</span></span></a>
  <a class="ghost" href="${SITE.repo}" target="_blank" rel="noopener">★ GitHub</a>
</header>
<main class="wrap">
${bodyHtml}
</main>
<footer class="site-footer">
  <span>Made with <span class="grad">⚡ ViralEngine</span> · auto-generated daily</span>
  <span class="muted">Grounded in real sources · always verify before acting.</span>
</footer>
<script src="${up}assets/app.js"></script>
</body>
</html>`;
}

function postCard(p, depth) {
  const c = catMeta[p.category] || { label: p.category, accent: '#888' };
  return `<article class="card" data-category="${escAttr(p.category)}" style="--accent:${c.accent}">
  <a class="card-link" href="${'../'.repeat(depth)}post/${escAttr(p.slug)}.html">
    <div class="card-top"><span class="tag">${esc(c.label)}</span><span class="impact" title="Impact score">${p.impact}</span></div>
    <h3>${esc(p.title)}</h3>
    <p class="dek">${esc(p.dek)}</p>
  </a>
  <div class="card-foot"><span class="src">${esc(p.source.name)}</span><span class="date">${fmtDate(p.date)}</span></div>
</article>`;
}

function renderIndex(data) {
  const brief = (data.briefs || [])[0];
  const posts = data.posts || [];

  const chips =
    `<button class="chip is-active" data-filter="all">All</button>` +
    CATS.map((c) => `<button class="chip" data-filter="${c.key}" style="--accent:${c.accent}">${c.label}</button>`).join('');

  const briefHtml = brief
    ? `<section class="brief">
        <div class="brief-head"><h2>The Daily Brief</h2><span class="brief-date">${fmtDate(brief.date)}</span></div>
        <p class="brief-intro">${esc(brief.intro)}</p>
        <ul class="brief-list">${brief.items
          .map((i) => {
            const c = catMeta[i.key] || { label: i.category, accent: '#888' };
            return `<li style="--accent:${c.accent}"><a href="${escAttr(i.url)}" target="_blank" rel="noopener"><span class="b-cat">${esc(c.label)}</span><span class="b-line">${esc(i.line)}</span><span class="b-title">${esc(i.title)}</span></a></li>`;
          })
          .join('')}</ul>
      </section>`
    : '';

  const featured = posts.slice(0, 4);
  const featuredHtml = featured.length
    ? `<section class="featured-sec"><h2 class="sec-title">Featured</h2><div class="featured-grid">${featured
        .map((p) => postCard(p, 0))
        .join('')}</div></section>`
    : '';

  const archiveHtml = `<section class="archive">
    <div class="archive-head"><h2 class="sec-title">All Stories</h2><div class="chips">${chips}</div></div>
    <div class="grid" id="grid">${posts.map((p) => postCard(p, 0)).join('') || '<p class="empty">No stories yet — the daily run will fill this in.</p>'}</div>
  </section>`;

  const hero = `<section class="hero">
    <div class="kicker">⚡ Daily signal engine</div>
    <h1>Today in <span class="grad">tech, science & the world</span>.</h1>
    <p class="sub">${esc(SITE.tagline)}</p>
    <div class="hero-meta"><span>${posts.length} stories</span><span>·</span><span>8 topics</span><span>·</span><span>refreshed daily</span></div>
  </section>`;

  return layout(SITE.title, hero + briefHtml + featuredHtml + archiveHtml, { depth: 0 });
}

function renderPost(p) {
  const c = catMeta[p.category] || { label: p.category, accent: '#888' };
  const takeaways = (p.takeaways || []).length
    ? `<aside class="takeaways"><h4>Key takeaways</h4><ul>${p.takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></aside>`
    : '';
  const tags = (p.tags || []).map((t) => `<span class="pill">#${esc(t)}</span>`).join('');
  const body = `<article class="post" style="--accent:${c.accent}">
    <a class="back" href="../index.html">← All stories</a>
    <div class="post-cat"><span class="tag">${esc(c.label)}</span><span class="impact">${p.impact}</span></div>
    <h1>${esc(p.title)}</h1>
    <p class="post-dek">${esc(p.dek)}</p>
    <div class="post-meta"><span>${fmtDate(p.date)}</span><span>·</span><a href="${escAttr(p.source.url)}" target="_blank" rel="noopener">Source: ${esc(p.source.name)} ↗</a></div>
    ${takeaways}
    <div class="prose">${md(p.body)}</div>
    <div class="tags">${tags}</div>
    <a class="source-cta" href="${escAttr(p.source.url)}" target="_blank" rel="noopener">Read the original at ${esc(p.source.name)} ↗</a>
  </article>`;
  return layout(`${p.title} · ${SITE.title}`, body, { depth: 1, description: p.dek });
}

// --- build -----------------------------------------------------------------
function main() {
  const data = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, 'utf8')) : { posts: [], briefs: [] };

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'post'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });

  // pages
  fs.writeFileSync(path.join(DIST, 'index.html'), renderIndex(data));
  for (const p of data.posts || []) {
    fs.writeFileSync(path.join(DIST, 'post', `${p.slug}.html`), renderPost(p));
  }

  // assets + data + Pages niceties
  for (const f of ['styles.css', 'app.js']) {
    fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(DIST, 'assets', f));
  }
  fs.writeFileSync(path.join(DIST, 'data', 'posts.json'), JSON.stringify(data));
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

  console.log(`✓ built ${DIST}: index + ${(data.posts || []).length} post pages`);
}

main();
