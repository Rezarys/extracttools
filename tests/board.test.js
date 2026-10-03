'use strict';
const test = require('node:test');
const assert = require('node:assert');
const B = require('../docs/board.js');

function boardWith(n) {
  let b = B.newBoard('EU evening');
  for (let i = 0; i < n; i++) b = B.addMember(b, { n: 'p' + i, r: 'EU', w: 'evenings', p: 'medic' }).board;
  return b;
}

test('a board survives the link round trip', () => {
  let b = B.newBoard('EU evening recon');
  b = B.addMember(b, { n: 'Ghost', r: 'EU', w: 'weekdays 20:00 to 23:00 CET', p: 'recon, mic' }).board;
  b = B.addMember(b, { n: 'Medic Max', r: 'NA East', w: 'weekends', p: 'medic' }).board;
  const link = B.encode(b);
  assert.match(link, /^[A-Za-z0-9_-]+$/);
  assert.deepStrictEqual(B.decode(link), b);
});

test('non latin names survive the round trip', () => {
  const b = B.addMember(B.newBoard('Squad'), { n: 'Łukasz 狼', r: 'Asia', w: '', p: '' }).board;
  assert.strictEqual(B.decode(B.encode(b)).m[0].n, 'Łukasz 狼');
});

test('markup and control characters are stripped, fields are cut at 40', () => {
  const b = B.addMember(B.newBoard('<b>x</b>'), { n: '<img src=x onerror=alert(1)>', r: 'EU',
    w: 'a'.repeat(100), p: 'line\nbreak' }).board;
  assert.strictEqual(b.t, 'bx/b');
  assert.ok(!/[<>]/.test(b.m[0].n));
  assert.strictEqual(b.m[0].w.length, B.MAX_LEN);
  assert.strictEqual(b.m[0].p, 'linebreak');
});

test('unknown region becomes Other', () => {
  const b = B.addMember(B.newBoard(''), { n: 'a', r: 'Mars' }).board;
  assert.strictEqual(b.m[0].r, 'Other');
  assert.strictEqual(b.t, 'Squad board');
});

test('a name is required, same name replaces the old entry', () => {
  let b = B.newBoard('x');
  assert.strictEqual(B.addMember(b, { n: '   ' }).error, 'name');
  b = B.addMember(b, { n: 'Ghost', r: 'EU', w: 'mornings' }).board;
  b = B.addMember(b, { n: 'ghost', r: 'EU', w: 'nights' }).board;
  assert.strictEqual(b.m.length, 1);
  assert.strictEqual(b.m[0].w, 'nights');
});

test('remove by name, case insensitive', () => {
  const b = B.removeMember(boardWith(3), 'P1');
  assert.deepStrictEqual(b.m.map((x) => x.n), ['p0', 'p2']);
});

test('a board holds at most 20 players, also when decoded', () => {
  const full = boardWith(B.MAX_MEMBERS);
  assert.strictEqual(B.addMember(full, { n: 'late' }).error, 'full');
  const forged = Buffer.from(JSON.stringify({ v: 1, t: 't', m: Array.from({ length: 50 }, (_, i) => ['n' + i]) }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.strictEqual(B.decode(forged).m.length, B.MAX_MEMBERS);
});

test('damaged or foreign links decode to null', () => {
  assert.strictEqual(B.decode(''), null);
  assert.strictEqual(B.decode('not a board!'), null);
  assert.strictEqual(B.decode('abc'), null);
  const other = Buffer.from(JSON.stringify({ v: 2, m: [] })).toString('base64').replace(/=+$/, '');
  assert.strictEqual(B.decode(other), null);
  assert.strictEqual(B.decode('A'.repeat(17000)), null);
});

test('a full board of non latin names still decodes', () => {
  let b = B.newBoard('狼'.repeat(40));
  for (let i = 0; i < B.MAX_MEMBERS; i++) {
    b = B.addMember(b, { n: '狼'.repeat(38) + i, r: 'Asia', w: '夜'.repeat(40), p: '医'.repeat(40) }).board;
  }
  assert.strictEqual(B.decode(B.encode(b)).m.length, B.MAX_MEMBERS);
});

test('a full board still fits in a link that chat apps accept', () => {
  let b = B.newBoard('x'.repeat(40));
  for (let i = 0; i < B.MAX_MEMBERS; i++) {
    b = B.addMember(b, { n: 'n'.repeat(38) + i, r: 'South America', w: 'w'.repeat(40), p: 'p'.repeat(40) }).board;
  }
  assert.ok(B.encode(b).length < 6000);
  assert.strictEqual(B.decode(B.encode(b)).m.length, B.MAX_MEMBERS);
});
