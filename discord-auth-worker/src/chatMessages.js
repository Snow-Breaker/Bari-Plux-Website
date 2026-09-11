/**
 * Server-side lobby-chat message endpoints.
 *
 * These are the enforcement point for the chat bans/strikes/rules/banned-words
 * gates. The RTDB node `lobby_chat/messages` no longer accepts direct client
 * writes (`$msgId."write"` is `false`), so every send/edit/delete must go
 * through the worker, which validates with the service account (rule-bypassing
 * reads/writes) and mirrors the client's fail-closed gating before committing.
 *
 * deps interface (injected by index.js so tests can fake the RTDB + Firebase):
 *   verifyUser(idToken) -> Promise<{ uid: string, email: string } | null>
 *   read(path)          -> Promise<unknown>          (service-account GET)
 *   writeNode(path, d)  -> Promise<boolean>          (service-account PUT)
 *   patchNode(path, d)  -> Promise<boolean>          (service-account PATCH)
 *   deleteNode(path)    -> Promise<boolean>          (service-account DELETE)
 */

import { containsBannedWord } from './bannedWords.js';

export const CHAT_ROOMS = new Set(['general', 'help', 'offtopic']);
export const CHAT_RULES_VERSION = 1;
const MAX_TEXT_LENGTH = 400;
const MAX_NAME_LENGTH = 32;
const MAX_REPLY_PREVIEW_LENGTH = 80;
const SAFE_MSG_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_IMAGE_KEY = /^[A-Za-z0-9_-]{4,120}$/;
const SAFE_PHOTO_URL = /^https?:\/\/[^\s]{10,488}$/;
const STAFF_ROLES = new Set(['dev', 'founder', 'staff']);
const ADMIN_UID = 'ZHMxN5tZkNgLcxFnp98QUqfvw963';
const ADMIN_EMAIL = 'mister.attaye@gmail.com';

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function unauthorized(corsHeaders) {
  return json({ ok: false, error: 'unauthorized' }, 401, corsHeaders);
}

function rejected(code, corsHeaders) {
  return json({ ok: false, error: code }, 422, corsHeaders);
}

function parseBody(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw;
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function isAllowedChatLetterCodePoint(cp) {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return true;
  if (cp >= 0x00c0 && cp <= 0x00ff && cp !== 0x00d7 && cp !== 0x00f7) return true;
  if (cp >= 0x0100 && cp <= 0x024f) return true;
  if (cp >= 0x1e00 && cp <= 0x1eff) return true;
  return false;
}

function isEnglishOnlyChatText(text) {
  if (!text) return true;
  for (const ch of [...text]) {
    if (/[\p{L}]/u.test(ch) && !isAllowedChatLetterCodePoint(ch.codePointAt(0))) return false;
  }
  return true;
}

function sanitizeText(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/[\r\n\t]+/g, ' ');
  s = s.replace(/[\u0000-\u001f\u007f]/g, '');
  s = s.replace(/\s{3,}/g, '  ').trim();
  if (s.length > MAX_TEXT_LENGTH) s = s.slice(0, MAX_TEXT_LENGTH);
  return s;
}

function sanitizeName(raw) {
  let name = typeof raw === 'string' ? raw.trim() : '';
  name = name.replace(/[\u0000-\u001f\u007f]/g, '');
  if (name.length > MAX_NAME_LENGTH) name = name.slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : 'Player';
}

function sanitizeReplyPreview(raw) {
  let plain = typeof raw === 'string' ? raw.trim().replace(/[\r\n\t]+/g, ' ') : '';
  plain = plain.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (plain.length > MAX_REPLY_PREVIEW_LENGTH) plain = plain.slice(0, MAX_REPLY_PREVIEW_LENGTH);
  return plain;
}

function extractBannedWords(node) {
  const set = new Set();
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node.words)) {
    for (const w of node.words) {
      if (typeof w === 'string' && w.trim()) set.add(w.trim());
    }
  } else if (node.words && typeof node.words === 'object') {
    for (const [key, value] of Object.entries(node.words)) {
      if (typeof value === 'string' && value.trim()) set.add(value.trim());
      else if (key.trim()) set.add(key.trim());
    }
  }
  if (node.list && typeof node.list === 'object') {
    for (const key of Object.keys(node.list)) {
      if (key.trim()) set.add(key.trim());
    }
  }
  return [...set];
}

function normalizeMentions(mentions) {
  if (mentions == null) return null;
  if (typeof mentions !== 'object' || Array.isArray(mentions)) return 'invalid';
  const entries = Object.entries(mentions);
  if (entries.length > 8) return 'invalid';
  const map = {};
  for (const [key, value] of entries) {
    if (!SAFE_MSG_ID.test(key) || value !== true) return 'invalid';
    map[key] = true;
  }
  return map;
}

function sanitizePhotoUrl(raw) {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  return SAFE_PHOTO_URL.test(url) ? url : null;
}

function makeMessageId() {
  const ts = Date.now().toString(36);
  const rand = crypto.getRandomValues(new Uint8Array(8));
  let hex = '';
  for (const b of rand) hex += b.toString(16).padStart(2, '0');
  return `-m${ts}-${hex}`;
}

/** Checks ban + rules/strikes gates; returns 'ok' or a rejection code. */
async function enforceCanChat(uid, deps) {
  let ban;
  try {
    ban = await deps.read(`lobby_chat/bans/${uid}`);
  } catch {
    ban = undefined;
  }
  if (ban === true) return 'banned';

  let mod = null;
  try {
    mod = await deps.read(`lobby_chat/user_moderation/${uid}`);
  } catch {
    mod = null;
  }
  const accepted = mod && mod.rulesAccepted === true;
  const versionOk = accepted && Number(mod.rulesVersionAccepted ?? 0) >= CHAT_RULES_VERSION;
  const strikesOk = accepted && Number(mod.strikesRemaining ?? 0) > 0;
  if (!accepted) return 'rules_required';
  if (!versionOk || !strikesOk) return 'banned';
  return 'ok';
}

async function resolveStoredRole(uid, deps) {
  try {
    const userRole = await deps.read(`users/${uid}/role`);
    if (typeof userRole === 'string' && userRole) return userRole;
    const discordRole = await deps.read(`discordUsers/${uid}/role`);
    if (typeof discordRole === 'string' && discordRole) return discordRole;
  } catch {
    return null;
  }
  return null;
}

function isStaffUser(user, storedRole) {
  if (!user) return false;
  if (user.uid === ADMIN_UID || user.email === ADMIN_EMAIL) return true;
  const role = typeof storedRole === 'string' ? storedRole.toLowerCase() : '';
  return STAFF_ROLES.has(role);
}

export async function handleChatMessageSend(request, corsHeaders, deps) {
  const idToken = bearerToken(request);
  if (!idToken) return unauthorized(corsHeaders);

  const user = await deps.verifyUser(idToken);
  if (!user) return unauthorized(corsHeaders);

  const body = parseBody(await readBodySafe(request));
  if (!body) return json({ ok: false, error: 'invalid_body' }, 400, corsHeaders);

  const room = typeof body.room === 'string' ? body.room : '';
  if (!CHAT_ROOMS.has(room)) return rejected('invalid', corsHeaders);

  const text = sanitizeText(body.text);
  const imageKey = typeof body.imageKey === 'string' ? body.imageKey : null;
  if (imageKey != null && !SAFE_IMAGE_KEY.test(imageKey)) return rejected('invalid', corsHeaders);
  if (text.length === 0 && imageKey == null) return rejected('empty', corsHeaders);
  if (text.length > MAX_TEXT_LENGTH) return rejected('too_long', corsHeaders);
  if (!isEnglishOnlyChatText(text)) return rejected('english_only', corsHeaders);

  const gate = await enforceCanChat(user.uid, deps);
  if (gate !== 'ok') return rejected(gate, corsHeaders);

  const role = typeof body.role === 'string' ? body.role : '';
  const storedRole = await resolveStoredRole(user.uid, deps);
  const roleOk = storedRole
    ? role.toLowerCase() === String(storedRole).toLowerCase()
    : role === 'free';
  if (!roleOk) return rejected('invalid_role', corsHeaders);

  let words = [];
  try {
    const node = await deps.read('lobby_chat/banned_words');
    words = extractBannedWords(node);
  } catch {
    words = [];
  }
  if (containsBannedWord(text, words)) return rejected('banned_word', corsHeaders);

  const name = sanitizeName(body.name);
  const photoURL = sanitizePhotoUrl(body.photoURL);
  const mentions = normalizeMentions(body.mentions);
  if (mentions === 'invalid') return rejected('invalid', corsHeaders);

  const payload = {
    uid: user.uid,
    name,
    text,
    role: role.toLowerCase(),
    room,
    ts: { '.sv': 'timestamp' }
  };
  if (imageKey != null) payload.imageKey = imageKey;
  if (photoURL != null) payload.photoURL = photoURL;
  if (mentions != null) payload.mentions = mentions;

  if (body.replyTo != null) {
    if (typeof body.replyTo !== 'string' || !SAFE_MSG_ID.test(body.replyTo)) {
      return rejected('invalid', corsHeaders);
    }
    const replyName = sanitizeName(body.replyName);
    const replyText = sanitizeReplyPreview(body.replyText);
    if (replyName.length === 0 || replyText.length === 0) return rejected('invalid', corsHeaders);
    payload.replyTo = body.replyTo;
    payload.replyName = replyName;
    payload.replyText = replyText;
  }

  const messageId = makeMessageId();
  let wrote;
  try {
    wrote = await deps.writeNode(`lobby_chat/messages/${messageId}`, payload);
  } catch {
    wrote = false;
  }
  if (!wrote) return json({ ok: false, error: 'write_failed' }, 502, corsHeaders);

  return json({ ok: true, id: messageId }, 200, corsHeaders);
}

export async function handleChatMessageEdit(request, corsHeaders, deps) {
  const idToken = bearerToken(request);
  if (!idToken) return unauthorized(corsHeaders);

  const user = await deps.verifyUser(idToken);
  if (!user) return unauthorized(corsHeaders);

  const body = parseBody(await readBodySafe(request));
  if (!body) return json({ ok: false, error: 'invalid_body' }, 400, corsHeaders);

  const messageId = typeof body.messageId === 'string' ? body.messageId : '';
  if (!SAFE_MSG_ID.test(messageId)) return rejected('invalid', corsHeaders);

  const text = sanitizeText(body.text);
  if (text.length === 0) return rejected('empty', corsHeaders);
  if (text.length > MAX_TEXT_LENGTH) return rejected('too_long', corsHeaders);
  if (!isEnglishOnlyChatText(text)) return rejected('english_only', corsHeaders);

  const gate = await enforceCanChat(user.uid, deps);
  if (gate !== 'ok') return rejected(gate, corsHeaders);

  let existing;
  try {
    existing = await deps.read(`lobby_chat/messages/${messageId}`);
  } catch {
    existing = null;
  }
  if (!existing || typeof existing !== 'object') return rejected('not_found', corsHeaders);
  if (existing.uid !== user.uid) return rejected('not_owner', corsHeaders);

  let words = [];
  try {
    const node = await deps.read('lobby_chat/banned_words');
    words = extractBannedWords(node);
  } catch {
    words = [];
  }
  if (containsBannedWord(text, words)) return rejected('banned_word', corsHeaders);

  const mentions = normalizeMentions(body.mentions);
  if (mentions === 'invalid') return rejected('invalid', corsHeaders);

  const patch = {
    text,
    edited: true,
    editedAt: { '.sv': 'timestamp' },
    mentions: mentions == null ? null : mentions
  };

  let patched;
  try {
    patched = await deps.patchNode(`lobby_chat/messages/${messageId}`, patch);
  } catch {
    patched = false;
  }
  if (!patched) return json({ ok: false, error: 'write_failed' }, 502, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

export async function handleChatMessageDelete(request, corsHeaders, deps) {
  const idToken = bearerToken(request);
  if (!idToken) return unauthorized(corsHeaders);

  const user = await deps.verifyUser(idToken);
  if (!user) return unauthorized(corsHeaders);

  const body = parseBody(await readBodySafe(request));
  if (!body) return json({ ok: false, error: 'invalid_body' }, 400, corsHeaders);

  const messageId = typeof body.messageId === 'string' ? body.messageId : '';
  if (!SAFE_MSG_ID.test(messageId)) return rejected('invalid', corsHeaders);

  let existing;
  try {
    existing = await deps.read(`lobby_chat/messages/${messageId}`);
  } catch {
    existing = null;
  }
  if (!existing || typeof existing !== 'object') return rejected('not_found', corsHeaders);

  const storedRole = await resolveStoredRole(user.uid, deps);
  if (existing.uid !== user.uid && !isStaffUser(user, storedRole)) {
    return rejected('not_owner', corsHeaders);
  }

  let deleted;
  try {
    deleted = await deps.deleteNode(`lobby_chat/messages/${messageId}`);
  } catch {
    deleted = false;
  }
  if (!deleted) return json({ ok: false, error: 'write_failed' }, 502, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

async function readBodySafe(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}