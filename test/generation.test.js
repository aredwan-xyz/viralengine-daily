const { test } = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('../lib/gemini');
const generator = require('../generate');
const { renderPost, renderIndex } = require('../build');
const fs = require('node:fs');

test('AI failure produces explicitly source-only content', async () => {
  const originalHasKey = gemini.hasKey;
  const originalChat = gemini.chatJSON;
  try {
    gemini.hasKey = () => true;
    gemini.chatJSON = async () => { throw new Error('provider unavailable'); };
    const post = await generator.writePost({ title: 'Example', url: 'https://example.com', source: 'Example' }, { key: 'tech', label: 'Tech' });
    assert.equal(post.ai, false);
    assert.match(renderPost(post), /Source-only summary/);
    assert.match(renderIndex({ posts: [post], health: { mode: 'source-only-or-partial' } }), /source-only-or-partial/);
  } finally {
    gemini.hasKey = originalHasKey;
    gemini.chatJSON = originalChat;
  }
});

test('empty source brief stays empty and records no AI success', async () => {
  const brief = await generator.buildBrief({});
  assert.deepEqual(brief.items, []);
  assert.equal(brief.ai, false);
});

test('a total source outage fails before overwriting the archive', async (t) => {
  const write = t.mock.method(fs, 'writeFileSync', () => {});
  await assert.rejects(generator.main({ fetchItems: async () => [] }), /preserving/);
  assert.equal(write.mock.callCount(), 0);
});
