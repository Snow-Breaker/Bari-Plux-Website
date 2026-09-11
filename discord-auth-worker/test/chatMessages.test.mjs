import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleChatMessageSend,
  handleChatMessageEdit,
  handleChatMessageDelete
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

test('send: invalid room rejected', async () => {
  const deps = makeDeps(basicDb());
  const res = await handleChatMessageSend(
    post('/chat/message/send', { room: 'wow', role: 'free', text: 'hi', name: 'x' }),
    CORS, deps);
  assert.equal((await result(res)).error, 'invalid');
});

test('send: role must match stored users/role', async () => {
  const db = basicDb();
  db['users/u1/role'] = 'Pro';
  const deps = makeDeps(db);
  const mismatch = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'free', text: 'hi', name: 'x' }),
    CORS, deps);
  assert.equal((await result(mismatch)).error, 'invalid_role');
  const match = await handleChatMessageSend(
    post('/chat/message/send', { room: 'general', role: 'pro', text: 'hi', name: 'x' }),
    CORS, deps);
  assert.equal(match.status, 200);
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