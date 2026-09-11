/**
 * Server-side banned-word filtering for lobby chat.
 *
 * Pure functions (no `fetch`/env) so they can be unit-tested directly with
 * `node --test` and are shared verbatim with the client's mirror in
 * `LobbyChatService`. Matches are computed on a normalized COPY of the text;
 * the original message is never rewritten.
 *
 * Normalization pipeline (applied to text AND to each banned word):
 *   1. lowercase
 *   2. leetspeak digits   0 -> o, 1 -> i, 3 -> e, 4 -> a, 5 -> s
 *   3. strip everything except a-z 0-9  (kills interleaved spaces/punctuation)
 *   4. collapse runs of identical characters  ("uu" -> "u")
 *   5. o -> u unification    (catches vowel-swaps like "f0ck" -> "fock" -> "fuck")
 *
* Matching is token-based: the text is split on whitespace, each token is
 * normalized, and a banned word hits on (a) an exact normalized token or
 * (b) the normalized concatenation of consecutive tokens (spaced single-letter
 * evasions like "a s s", or multi-word banned phrases). Substring embeddings are
 * NOT flagged (e.g. "dumbass" still contains "ass" with no boundary) — that is an
 * intentional, documented limitation to avoid false positives on words like
 * "class", "pass" or "mass".
 */

const LEET_DIGITS = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's' };

export function normalizeForBannedFilter(input) {
  if (typeof input !== 'string') return '';
  let out = '';
  for (const ch of input.toLowerCase()) {
    const mapped = LEET_DIGITS[ch] ?? ch;
    if ((mapped >= 'a' && mapped <= 'z') || (mapped >= '0' && mapped <= '9')) {
      out += mapped;
    }
  }
  out = out.replace(/([a-z0-9])\1+/g, '$1');
  out = out.replace(/o/g, 'u');
  return out;
}

export function containsBannedWord(text, bannedWords) {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (!Array.isArray(bannedWords) || bannedWords.length === 0) return false;

  // Split on whitespace so word boundaries survive normalization, then normalize
  // each token individually. This is what keeps "badword" inside a sentence a
  // match while "dumbass" (containing "ass" with no boundary) is not.
  const tokens = text
    .split(/\s+/)
    .map(normalizeForBannedFilter)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return false;

  for (const raw of bannedWords) {
    const word = String(raw ?? '').trim();
    if (word.length < 2) continue;
    const normalizedWord = normalizeForBannedFilter(word);
    if (normalizedWord.length < 2) continue;

    // exact token
    if (tokens.includes(normalizedWord)) return true;

    // consecutive-token concatenation: "a s s" (banned "ass") or "f u c k"
    for (let i = 0; i < tokens.length; i++) {
      let concat = tokens[i];
      if (concat === normalizedWord) return true;
      for (let j = i + 1; j < tokens.length; j++) {
        concat += tokens[j];
        if (concat.length > normalizedWord.length) break;
        if (concat === normalizedWord) return true;
      }
    }
  }
  return false;
}