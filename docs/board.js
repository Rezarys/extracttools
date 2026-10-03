/* Squad board kept entirely in the link: nothing is sent to or stored on any server. */
(function (root) {
  'use strict';

  var REGIONS = ['EU', 'NA East', 'NA West', 'South America', 'Asia', 'Oceania', 'Other'];
  var MAX_MEMBERS = 20;
  var MAX_LEN = 40;

  function clean(s) {
    s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
    return s.slice(0, MAX_LEN);
  }

  function cleanMember(m) {
    m = m || {};
    var region = REGIONS.indexOf(m.r) >= 0 ? m.r : 'Other';
    return { n: clean(m.n), r: region, w: clean(m.w), p: clean(m.p) };
  }

  function newBoard(title) {
    return { v: 1, t: clean(title) || 'Squad board', m: [] };
  }

  function addMember(board, m) {
    var c = cleanMember(m);
    if (!c.n) return { error: 'name' };
    if (board.m.length >= MAX_MEMBERS) return { error: 'full' };
    var lower = c.n.toLowerCase();
    var others = board.m.filter(function (x) { return x.n.toLowerCase() !== lower; });
    return { board: { v: 1, t: board.t, m: others.concat([c]) } };
  }

  function removeMember(board, name) {
    var lower = clean(name).toLowerCase();
    return { v: 1, t: board.t, m: board.m.filter(function (x) { return x.n.toLowerCase() !== lower; }) };
  }

  function toBase64Url(str) {
    var b64 = typeof Buffer !== 'undefined' ? Buffer.from(str, 'utf8').toString('base64')
      : btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(s) {
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8')
      : decodeURIComponent(escape(atob(b64)));
  }

  function encode(board) {
    return toBase64Url(JSON.stringify({ v: 1, t: board.t, m: board.m.map(function (x) {
      return [x.n, x.r, x.w, x.p];
    }) }));
  }

  // Returns a clean board, or null when the link is damaged or not a board.
  function decode(s) {
    if (typeof s !== 'string' || !/^[A-Za-z0-9_-]{1,16000}$/.test(s)) return null;
    var o;
    try { o = JSON.parse(fromBase64Url(s)); } catch (e) { return null; }
    if (!o || o.v !== 1 || !Array.isArray(o.m)) return null;
    var b = newBoard(o.t);
    o.m.slice(0, MAX_MEMBERS).forEach(function (row) {
      if (!Array.isArray(row)) return;
      var r = addMember(b, { n: row[0], r: row[1], w: row[2], p: row[3] });
      if (r.board) b = r.board;
    });
    return b;
  }

  var api = { REGIONS: REGIONS, MAX_MEMBERS: MAX_MEMBERS, MAX_LEN: MAX_LEN, clean: clean, newBoard: newBoard,
    addMember: addMember, removeMember: removeMember, encode: encode, decode: decode };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SquadBoard = api;

  if (typeof document === 'undefined') return;

  var board = null;

  function link() {
    return location.origin + location.pathname + '#' + encode(board);
  }

  function cell(tr, text) {
    var td = document.createElement('td');
    td.textContent = text;
    tr.appendChild(td);
  }

  function show() {
    var has = !!board;
    document.getElementById('create').hidden = has;
    document.getElementById('board').hidden = !has;
    if (!has) return;
    document.getElementById('board-title').textContent = board.t;
    var body = document.getElementById('members');
    body.textContent = '';
    board.m.forEach(function (x) {
      var tr = document.createElement('tr');
      cell(tr, x.n); cell(tr, x.r); cell(tr, x.w); cell(tr, x.p);
      body.appendChild(tr);
    });
    document.getElementById('empty').hidden = board.m.length > 0;
    document.getElementById('share').value = link();
  }

  function save() {
    history.replaceState(null, '', '#' + encode(board));
    show();
  }

  function msg(t) { document.getElementById('board-msg').textContent = t; }

  document.addEventListener('DOMContentLoaded', function () {
    var h = location.hash.slice(1);
    board = h ? decode(h) : null;
    if (h && !board) msg('This link is damaged. Ask for a fresh one, or start a new board.');
    var sel = document.getElementById('m-region');
    REGIONS.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r; o.textContent = r;
      sel.appendChild(o);
    });
    document.getElementById('create').addEventListener('submit', function (e) {
      e.preventDefault();
      board = newBoard(e.target.elements.title.value);
      save();
    });
    document.getElementById('join').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target.elements;
      var r = addMember(board, { n: f.name.value, r: f.region.value, w: f.when.value, p: f.style.value });
      if (r.error === 'name') { msg('Enter a name.'); return; }
      if (r.error === 'full') { msg('This board is full (' + MAX_MEMBERS + ' players). Start a new one.'); return; }
      board = r.board;
      msg('Added. Copy the new link below and post it where your squad talks: the old link does not show you.');
      save();
    });
    document.getElementById('leave').addEventListener('submit', function (e) {
      e.preventDefault();
      board = removeMember(board, e.target.elements.name.value);
      msg('Removed. Share the new link below.');
      save();
    });
    document.getElementById('copy').addEventListener('click', function () {
      var input = document.getElementById('share');
      input.select();
      if (navigator.clipboard) navigator.clipboard.writeText(input.value);
      msg('Link copied.');
    });
    window.addEventListener('hashchange', function () {
      var b = decode(location.hash.slice(1));
      if (b) { board = b; show(); } else { msg('This link is damaged. Ask for a fresh one, or start a new board.'); }
    });
    show();
  });
})(typeof window !== 'undefined' ? window : this);
