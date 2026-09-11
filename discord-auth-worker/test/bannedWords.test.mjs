import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForBannedFilter, containsBannedWord } from '../src/bannedWords.js';

test('normalizeForBannedFilter strips leetspeak, separators and lowercases', () => {
  // NOTE: the same collapse step runs on BOTH the text and each banned word, so
  // "ass" (double-s) normalizes to "as" on both sides and still matches.
  assert.equal(normalizeForBannedFilter('a s s'), 'as');
  assert.equal(normalizeForBannedFilter('a.s.s'), 'as');
  assert.equal(normalizeForBannedFilter('(fuck)'), 'fuck');
  assert.equal(normalizeForBannedFilter('fuck!'), 'fuck');
  assert.equal(normalizeForBannedFilter('F.U.C.K'), 'fuck');
  assert.equal(normalizeForBannedFilter('f u c k'), 'fuck');
  // 0->o -> o->u vowel unification catches "f0ck"
  assert.equal(normalizeForBannedFilter('f0ck'), 'fuck');
  assert.equal(normalizeForBannedFilter('F0Ck'), 'fuck');
  // 4->a, 5->s, 3->e, 1->i
  assert.equal(normalizeForBannedFilter('4ss'), 'as');
  assert.equal(normalizeForBannedFilter('a55'), 'as');
  assert.equal(normalizeForBannedFilter('f4g'), 'fag');
  assert.equal(normalizeForBannedFilter('p3nis'), 'penis');
  assert.equal(normalizeForBannedFilter('d1ck'), 'dick');
  // repeated-char collapse
  assert.equal(normalizeForBannedFilter('fuuuck'), 'fuck');
});

test('containsBannedWord rejects every user-reported evasion technique', () => {
  const banned = ['ass', 'fuck'];
  for (const probe of ['ass', 'FUCK', 'a s s', 'a.s.s', 'f.u.c.k', 'f u c k', 'f0ck', 'F0Ck', 'fuck!', '(fuck)']) {
    assert.equal(containsBannedWord(probe, banned), true, `expected blocked: ${probe}`);
  }
});

test('containsBannedWord is word-boundary based (no substring false positives)', () => {
  const banned = ['ass', 'fuck'];
  for (const probe of ['dumbass', 'sassy', 'assess', 'class', 'passing', 'suffix', 'hi there world']) {
    assert.equal(containsBannedWord(probe, banned), false, `expected clean: ${probe}`);
  }
});

test('containsBannedWord matches inline whole words in sentences', () => {
  assert.equal(containsBannedWord('this has a badword in it', ['badword']), true);
  assert.equal(containsBannedWord('go fuck yourself', ['fuck']), true);
  assert.equal(containsBannedWord('dumbass thing to do', ['ass']), false);
});

test('edge cases', () => {
  assert.equal(containsBannedWord('', ['ass']), false);
  assert.equal(containsBannedWord(null, ['ass']), false);
  assert.equal(containsBannedWord('ass', null), false);
  assert.equal(containsBannedWord('ass', []), false);
  assert.equal(containsBannedWord('aaa', ['a']), false); // <2 char words ignored
});