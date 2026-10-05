import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleChatMessageSend,
  handleChatMessageEdit,
  handleChatMessageDelete,
  handleChatBadges
} from '../src/chatMessages.js';

const CORS = {};

function makeDeps(db = {}, overrides = {}) {
  return {
    verifyUser: overrides.verifyUser
      ?? (async (token) => (token === 'good-token' ? { uid: 'u1', email: 'u1@test.com' } : null)),
    read: overrides.read ?? (async (path) => db[path] ?? null),
    writeNode: overrides.writeNode ?? (async (path, data) => { db[path] = data; return true; }),
    patchNode: overrides.patchNode ?? (async (path, data) => { db[path] = { ...(db[path] ?? {}), ...data }; return true; }),
    deleteNode: overrides.deleteNode ?? (async (path) => { delete db[path]; return true; })
  };
}

function basicDb() {
  return {
    'lobby_chat/user_moderation/u1': {
      rulesAccepted: true,
      rulesVersionAccepted: 1,
      strikesRemaining: 3,
      moralityScore: 100
    },
    'lobby_chat/banned_words': { words: ['ass', 'fuck'] }
  };
}

function post(path, body, token = 'good-token') {
  return new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body == null ? null : JSON.stringify(body)
  });
}

async function result(res) {
  const body = await res.json();
  return { status: res.status, ...body };
}

test('send: happy path commits message via service account', async () => {
  const db = basicDb();
  const deps = makeDeps(db);
  const res = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'hello world', name: 'Bob' }),
    CORS, deps);
  const out = await result(res);
  assert.equal(out.status, 200);
  assert.equal(out.ok, true);
  const key = `lobby_chat/messages/${out.id}`;
  assert.ok(db[key], 'message was written through the deps.writeNode path');
  assert.equal(db[key].uid, 'u1');
  assert.equal(db[key].text, 'hello world');
});

test('send: rejects every evasion probe with 422 banned_word', async () => {
  const db = basicDb();
  const deps = makeDeps(db);
  for (const probe of ['a s s', 'a.s.s', 'f.u.c.k', 'f u c k', 'f0ck', 'FUCK', 'fuck!', '(fuck)', 'A55']) {
    const res = await handleChatMessageSend(
      post('/chat/message/send', { room: 'general', role: 'free', text: probe, name: 'x' }),
      CORS, deps);
    const out = await result(res);
    assert.equal(out.status, 422, `expected 422 for ${probe}`);
    assert.equal(out.error, 'banned_word', `expected banned_word for ${probe}`);
  }
});

test('send: allows substring embeddings (documented limitation)', async () => {
  const db = basicDb();
  const deps = makeDeps(db);
  const res = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'what a dumbass thing to say', name: 'x' }),
    CORS, deps);
  assert.equal(res.status, 200);
});

test('send: auth failures are 401', async () => {
  const deps = makeDeps(basicDb());
  const res = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'x' }, 'bad-token'),
    CORS, deps);
  assert.equal(res.status, 401);
  const noHeader = new Request('https://worker.test/chat/message/send', {
    method: 'POST', body: '{}'
  });
  assert.equal((await handleChatMessageSend(noHeader, CORS, deps)).status, 401);
});

test('send: banned user is rejected', async () => {
  const db = basicDb();
  db['lobby_chat/bans/u1'] = true;
  const deps = makeDeps(db);
  const res = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'hi', name: 'x' }),
    CORS, deps);
  const out = await result(res);
  assert.equal(out.status, 422);
  assert.equal(out.error, 'banned');
});

test('send: rules_not_accepted -> 422 rules_required', async () => {
  const db = basicDb();
  delete db['lobby_chat/user_moderation/u1'];
  const deps = makeDeps(db);
  const res = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'hi', name: 'x' }),
    CORS, deps);
  const out = await result(res);
  assert.equal(out.status, 422);
  assert.equal(out.error, 'rules_required');
});

test('send: zero strikes / stale rules version -> rejected', async () => {
  for (const mod of [
    { rulesAccepted: true, rulesVersionAccepted: 1, strikesRemaining: 0 },
    { rulesAccepted: true, rulesVersionAccepted: 0, strikesRemaining: 3 }
  ]) {
    const db = basicDb();
    db['lobby_chat/user_moderation/u1'] = mod;
    const deps = makeDeps(db);
    const res = await handleChatMessageSend(
      post('/chat/message/send', { room: 'general', role: 'free', text: 'hi', name: 'x' }),
      CORS, deps);
    assert.equal(res.status, 422);
  }
});

test('send: the record the app actually writes (rulesVersion) is allowed', async () => {
  // Exactly what LobbyChatService.AcceptRulesAsync stores and database.rules.json validates.
  // The worker used to read rulesVersionAccepted instead, rejecting every such user as 'banned'.
  for (const mod of [
    { rulesAccepted: true, rulesVersion: 1, strikesRemaining: 5, moralityScore: 100, displayName: 'Bob' },
    { rulesAccepted: true, rulesVersion: 1 } // older record without strikes/morality = untouched
  ]) {
    const db = basicDb();
    db['lobby_chat/user_moderation/u1'] = mod;
    const deps = makeDeps(db);
    const res = await handleChatMessageSend(
      post('/chat/message/send', { room: 'general', role: 'free', text: 'hello', name: 'Bob' }),
      CORS, deps);
    assert.equal(res.status, 200, JSON.stringify(mod));
  }
});

test('send: stale rules version asks to accept rules, zero morality is banned', async () => {
  const stale = basicDb();
  stale['lobby_chat/user_moderation/u1'] = { rulesAccepted: true, rulesVersion: 0, strikesRemaining: 5 };
  let out = await result(await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'hi', name: 'x' }), CORS, makeDeps(stale)));
  assert.equal(out.error, 'rules_required');

  const noMorality = basicDb();
  noMorality['lobby_chat/user_moderation/u1'] = { rulesAccepted: true, rulesVersion: 1, strikesRemaining: 5, moralityScore: 0 };
  out = await result(await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'hi', name: 'x' }), CORS, makeDeps(noMorality)));
  assert.equal(out.error, 'banned');
});

test('send: invalid room rejected', async () => {
  const deps = makeDeps(basicDb());
  const res = await handleChatMessageSend(
    post('/chat/message/send', { room: 'wow', role: 'free', text: 'hi', name: 'x' }),
    CORS, deps);
  assert.equal((await result(res)).error, 'invalid');
});

test('send: self-reported role is IGNORED and never written to the stored message', async () => {
  // This replaced "role must match stored users/role". That check existed only to keep a lying
  // client from getting a Pro badge, and the badge itself was a `role` field inside the stored
  // message - which made lobby_chat/messages (`.read: auth != null`) a complete, machine-readable
  // customer list. With the badge moved to POST /chat/badges there is nothing left for a forged
  // role to influence, so the honest assertion is the opposite of the old one: a client claiming
  // ANY role is accepted, and `role` is absent from what gets stored either way.
  for (const claimed of ['pro', 'dev', 'founder', 'staff', 'free', '', 'nonsense']) {
    const db = basicDb();
    db['users/u1/role'] = 'free';
    const deps = makeDeps(db);
    const res = await handleChatMessageSend(
      post('/chat/message/send', { room: 'general', role: claimed, text: 'hi', name: 'x' }),
      CORS, deps);
    const out = await result(res);
    assert.equal(out.status, 200, `claiming ${JSON.stringify(claimed)} should still send`);
    const stored = db[`lobby_chat/messages/${out.id}`];
    assert.ok(stored);
    assert.equal('role' in stored, false,
      `stored message must not carry a role field (claimed ${JSON.stringify(claimed)})`);
  }
});

test('send: a genuinely Pro sender is stored exactly like a free one', async () => {
  // The point of the change in one test: two users with different real tiers produce
  // byte-identical stored messages apart from uid/name/text, so the message tree carries no
  // paid-tier signal for anyone to read.
  const proDb = basicDb();
  proDb['users/u1/role'] = 'pro';
  const proDeps = makeDeps(proDb);
  const proRes = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'pro', text: 'hi', name: 'x' }),
    CORS, proDeps);
  const proOut = await result(proRes);

  const freeDb = basicDb();
  freeDb['users/u1/role'] = 'free';
  const freeDeps = makeDeps(freeDb);
  const freeRes = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'hi', name: 'x' }),
    CORS, freeDeps);
  const freeOut = await result(freeRes);

  assert.equal(proOut.status, 200);
  assert.equal(freeOut.status, 200);
  const proStored = { ...proDb[`lobby_chat/messages/${proOut.id}`] };
  const freeStored = { ...freeDb[`lobby_chat/messages/${freeOut.id}`] };
  assert.deepEqual(Object.keys(proStored).sort(), Object.keys(freeStored).sort());
  assert.equal(Object.keys(proStored).includes('role'), false);
});

test('send: english-only enforced on server', async () => {
  const deps = makeDeps(basicDb());
  const res = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'مرحبا', name: 'x' }),
    CORS, deps);
  assert.equal((await result(res)).error, 'english_only');
});

test('send: empty and over-long text rejected / clamped', async () => {
  const deps = makeDeps(basicDb());
  const empty = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: '   ', name: 'x' }),
    CORS, deps);
  assert.equal((await result(empty)).error, 'empty');
  // server mirrors the client's SanitizeText clamp at 400
  const long = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'x'.repeat(500), name: 'x' }),
    CORS, deps);
  assert.equal(long.status, 200);
});

test('send: image-only message with a key passes', async () => {
  const deps = makeDeps(basicDb());
  const res = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: '', imageKey: 'img_12345', name: 'x' }),
    CORS, deps);
  assert.equal(res.status, 200);
  const bad = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: '', imageKey: '..//evil', name: 'x' }),
    CORS, deps);
  assert.equal((await result(bad)).error, 'invalid');
});

test('send: invalid mentions rejected', async () => {
  const deps = makeDeps(basicDb());
  const tooMany = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'hi', name: 'x', mentions: { a: true, b: true, c: true, d: true, e: true, f: true, g: true, h: true, i: true } }),
    CORS, deps);
  assert.equal((await result(tooMany)).error, 'invalid');
  const badVal = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'hi', name: 'x', mentions: { a: false } }),
    CORS, deps);
  assert.equal((await result(badVal)).error, 'invalid');
  const good = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'hi @bob', name: 'x', mentions: { 'u-abc_123': true } }),
    CORS, deps);
  assert.equal(good.status, 200);
});

test('send: malformed body -> 400', async () => {
  const deps = makeDeps(basicDb());
  const res = await handleChatMessageSend(post('/chat/message/send', null), CORS, deps);
  assert.equal(res.status, 400);
});

test('edit: owner can edit, preserves other fields', async () => {
  const db = basicDb();
  db['lobby_chat/messages/m1'] = { uid: 'u1', text: 'old', room: 'general', ts: 100, role: 'free' };
  const deps = makeDeps(db);
  const res = await handleChatMessageEdit(
    post('/chat/message/edit', { messageId: 'm1', text: 'new text' }),
    CORS, deps);
  const out = await result(res);
  assert.equal(out.status, 200);
  assert.equal(out.ok, true);
  assert.equal(db['lobby_chat/messages/m1'].text, 'new text');
  assert.equal(db['lobby_chat/messages/m1'].edited, true);
  assert.ok(db['lobby_chat/messages/m1'].editedAt);
  assert.equal(db['lobby_chat/messages/m1'].room, 'general'); // untouched
});

test('edit: non-owner rejected', async () => {
  const db = basicDb();
  db['lobby_chat/messages/m1'] = { uid: 'someone-else', text: 'old', room: 'general' };
  const deps = makeDeps(db);
  const res = await handleChatMessageEdit(
    post('/chat/message/edit', { messageId: 'm1', text: 'new' }),
    CORS, deps);
  assert.equal((await result(res)).error, 'not_owner');
});

test('edit: missing message rejected', async () => {
  const deps = makeDeps(basicDb());
  const res = await handleChatMessageEdit(
    post('/chat/message/edit', { messageId: 'missing', text: 'new' }),
    CORS, deps);
  assert.equal((await result(res)).error, 'not_found');
});

test('edit: banned words rejected on new text', async () => {
  const db = basicDb();
  db['lobby_chat/messages/m1'] = { uid: 'u1', text: 'old', room: 'general' };
  const deps = makeDeps(db);
  const res = await handleChatMessageEdit(
    post('/chat/message/edit', { messageId: 'm1', text: 'f u c k' }),
    CORS, deps);
  assert.equal((await result(res)).error, 'banned_word');
});

test('delete: owner deletes own message', async () => {
  const db = basicDb();
  db['lobby_chat/messages/m1'] = { uid: 'u1', text: 'bye', room: 'general' };
  const deps = makeDeps(db);
  const res = await handleChatMessageDelete(
    post('/chat/message/delete', { messageId: 'm1' }),
    CORS, deps);
  assert.equal((await result(res)).ok, true);
  assert.equal(db['lobby_chat/messages/m1'], undefined);
});

test('delete: staff can delete others via stored role', async () => {
  const db = basicDb();
  db['lobby_chat/messages/m1'] = { uid: 'someone-else', text: 'bye', room: 'general' };
  db['users/u1/role'] = 'founder';
  const deps = makeDeps(db);
  const res = await handleChatMessageDelete(
    post('/chat/message/delete', { messageId: 'm1' }),
    CORS, deps);
  assert.equal((await result(res)).ok, true);
});

test('delete: admin uid bypasses role checks', async () => {
  const db = basicDb();
  db['lobby_chat/messages/m1'] = { uid: 'someone-else', text: 'bye', room: 'general' };
  const deps = makeDeps(db, {
    verifyUser: async () => ({ uid: 'ZHMxN5tZkNgLcxFnp98QUqfvw963', email: 'x@x.com' })
  });
  const res = await handleChatMessageDelete(
    post('/chat/message/delete', { messageId: 'm1' }),
    CORS, deps);
  assert.equal((await result(res)).ok, true);
});

test('delete: non-owner non-staff rejected', async () => {
  const db = basicDb();
  db['lobby_chat/messages/m1'] = { uid: 'someone-else', text: 'bye', room: 'general' };
  const deps = makeDeps(db);
  const res = await handleChatMessageDelete(
    post('/chat/message/delete', { messageId: 'm1' }),
    CORS, deps);
  assert.equal((await result(res)).error, 'not_owner');
});
// ── POST /chat/badges ────────────────────────────────────────────────────────
// The single replacement for the `role` field that used to live inside every stored chat
// message. Two properties matter and are asserted separately below:
//   1. an unentitled viewer gets NOTHING (not an error, not a "this one is free" shape)
//   2. an entitled viewer gets the tiers, and only for uids it actually asked about

test('badges: free viewer gets an empty map, not an error and not a per-uid answer', async () => {
  const db = basicDb();
  db['users/u1/role'] = 'free';
  db['users/p1/role'] = 'pro';
  db['users/p2/role'] = 'dev';
  const res = await handleChatBadges(
    post('/chat/badges', { uids: ['p1', 'p2'] }), CORS, makeDeps(db));
  const out = await result(res);
  assert.equal(out.status, 200);
  assert.equal(out.ok, true);
  assert.deepEqual(out.badges, {},
    'a free viewer must not learn anyone\'s tier, including that p1/p2 exist as paid users');
});

test('badges: account with no role field at all is treated as unentitled', async () => {
  const db = basicDb();
  db['users/p1/role'] = 'pro';
  // note: no users/u1/role at all - a missing role must fail closed, not fail open
  const out = await result(await handleChatBadges(
    post('/chat/badges', { uids: ['p1'] }), CORS, makeDeps(db)));
  assert.equal(out.status, 200);
  assert.deepEqual(out.badges, {});
});

test('badges: pro viewer gets tiers for the uids it asked about', async () => {
  const db = basicDb();
  db['users/u1/role'] = 'pro';
  db['users/p1/role'] = 'dev';
  db['users/p2/role'] = 'founder';
  db['users/f1/role'] = 'free';
  const out = await result(await handleChatBadges(
    post('/chat/badges', { uids: ['p1', 'p2', 'f1'] }), CORS, makeDeps(db)));
  assert.equal(out.status, 200);
  assert.deepEqual(out.badges, { p1: 'dev', p2: 'founder' },
    'a free account must be omitted rather than answered with "free"');
});

test('badges: staff tier is returned so a client could recognise it', async () => {
  const db = basicDb();
  db['users/u1/role'] = 'staff';
  db['users/s1/role'] = 'staff';
  const out = await result(await handleChatBadges(
    post('/chat/badges', { uids: ['s1'] }), CORS, makeDeps(db)));
  assert.deepEqual(out.badges, { s1: 'staff' });
});

test('badges: falls back to discordUsers when the users tree has no role', async () => {
  const db = basicDb();
  db['users/u1/role'] = 'pro';
  db['discordUsers/d1/role'] = 'pro';
  const out = await result(await handleChatBadges(
    post('/chat/badges', { uids: ['d1'] }), CORS, makeDeps(db)));
  assert.deepEqual(out.badges, { d1: 'pro' });
});

test('badges: an unknown uid is simply absent, never an error', async () => {
  const db = basicDb();
  db['users/u1/role'] = 'pro';
  const out = await result(await handleChatBadges(
    post('/chat/badges', { uids: ['nobody'] }), CORS, makeDeps(db)));
  assert.equal(out.status, 200);
  assert.deepEqual(out.badges, {});
});

test('badges: duplicate uids collapse and the map is deduplicated', async () => {
  const db = basicDb();
  db['users/u1/role'] = 'pro';
  db['users/p1/role'] = 'pro';
  const out = await result(await handleChatBadges(
    post('/chat/badges', { uids: ['p1', 'p1', 'p1'] }), CORS, makeDeps(db)));
  assert.deepEqual(out.badges, { p1: 'pro' });
});

test('badges: unauthenticated is rejected', async () => {
  for (const token of ['', 'wrong-token']) {
    const res = await handleChatBadges(
      post('/chat/badges', { uids: ['p1'] }, token), CORS, makeDeps(basicDb()));
    assert.equal(res.status, 401);
    assert.equal((await result(res)).error, 'unauthorized');
  }
});

test('badges: malformed uids envelopes are rejected before any read', async () => {
  const db = basicDb();
  db['users/u1/role'] = 'pro';
  db['users/p1/role'] = 'pro';
  let reads = 0;
  const deps = makeDeps(db, { read: async (path) => { reads++; return db[path] ?? null; } });

  const bad = [
    {},                                  // no uids
    { uids: 'p1' },                      // not an array
    { uids: [] },                        // empty
    { uids: ['p1', 42] },                // non-string member
    { uids: [null] },
    { uids: ['../users/p1'] },           // traversal
    { uids: ['p1/role'] },               // embedded separator
    { uids: ['p1$'] },
    { uids: ['p'.repeat(129)] },         // over the 128-char ceiling
    { uids: ['p1'], extra: 1 }           // shape is fine; sanity that this one reaches the gate
  ];
  for (const body of bad.slice(0, -1)) {
    const res = await handleChatBadges(post('/chat/badges', body), CORS, deps);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.equal((await result(res)).error, 'invalid_uids');
  }
  assert.equal(reads, 0, 'a malformed envelope must be rejected before touching the database');

  // the last one IS well shaped, so it gets past validation and reads the viewer's own role
  reads = 0;
  const okRes = await handleChatBadges(post('/chat/badges', bad[bad.length - 1]), CORS, deps);
  assert.equal((await result(okRes)).status, 200);
  assert.ok(reads > 0);
});

test('badges: over the per-request uid ceiling is rejected', async () => {
  const db = basicDb();
  db['users/u1/role'] = 'pro';
  const uids = Array.from({ length: 101 }, (_, i) => `u${i}`);
  const res = await handleChatBadges(post('/chat/badges', { uids }), CORS, makeDeps(db));
  assert.equal(res.status, 400);
  assert.equal((await result(res)).error, 'invalid_uids');
});

test('badges: exactly at the ceiling is accepted', async () => {
  const db = basicDb();
  db['users/u1/role'] = 'pro';
  const uids = Array.from({ length: 100 }, (_, i) => `u${i}`);
  const res = await handleChatBadges(post('/chat/badges', { uids }), CORS, makeDeps(db));
  assert.equal((await result(res)).status, 200);
});

test('badges: non-JSON body is a 400, not a crash', async () => {
  const req = new Request('https://worker.test/chat/badges', {
    method: 'POST',
    headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' },
    body: 'not json'
  });
  const res = await handleChatBadges(req, CORS, makeDeps(basicDb()));
  assert.equal(res.status, 400);
  assert.equal((await result(res)).error, 'invalid_body');
});

test('badges: a database read failure degrades to an empty map, never a 500', async () => {
  const deps = makeDeps({}, { read: async () => { throw new Error('rtdb down'); } });
  const out = await result(await handleChatBadges(
    post('/chat/badges', { uids: ['p1'] }), CORS, deps));
  assert.equal(out.status, 200, 'resolveStoredRole already swallows read errors');
  assert.deepEqual(out.badges, {});
});
