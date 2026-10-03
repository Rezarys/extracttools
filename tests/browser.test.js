'use strict';
// Loads docs/ in headless Chrome, uses the calculator and the squad board like a person would,
// and checks that no request leaves the local server.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { Browser } = require('./cdp.js');

const DOCS = path.join(__dirname, '../docs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

function serve() {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(DOCS, u.endsWith('/') ? u + 'index.html' : u);
    if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('calculator and squad board work in a real browser, offline', { timeout: 60000 }, async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await Browser.launch();
  const urls = [];
  browser.listeners.add((m) => { if (m.method === 'Network.requestWillBeSent') urls.push(m.params.request.url); });
  try {
    const page = await browser.newPage();
    assert.strictEqual(await page.goto(base), 200);

    // by XP, defaults kept: 15 matches of 5,000 XP at an hour each, 20 hours a day so it always fits
    const xp = await page.evaluate(`(() => {
      const f = document.querySelector('#by-xp');
      f.elements.currentXp.value = '100,000';
      f.elements.targetXp.value = '175000';
      f.elements.hoursPerDay.value = '20';
      f.elements.wipeDay.value = '2099-01-01';
      f.requestSubmit();
      return f.querySelector('.result').textContent;
    })()`);
    assert.match(xp, /75,000 XP left, about 15 matches\./);
    assert.match(xp, /You make it before the wipe/);

    // by pace, with an error first
    const err = await page.evaluate(`(() => {
      const f = document.querySelector('#by-pace');
      f.elements.hoursPlayed.value = '40';
      f.elements.percentDone.value = '0';
      f.requestSubmit();
      return f.querySelector('.result').className + '|' + f.querySelector('.result').textContent;
    })()`);
    assert.match(err, /^result error\|Enter how far you are/);
    const pace = await page.evaluate(`(() => {
      const f = document.querySelector('#by-pace');
      f.elements.percentDone.value = '50';
      f.elements.hoursPerDay.value = '1';
      f.elements.wipeDay.value = '2099-01-01';
      f.requestSubmit();
      return f.querySelector('.result').textContent;
    })()`);
    assert.match(pace, /whole unlock takes about 80 h/);
    assert.match(pace, /40 play days/);

    // squad board: create, join twice, the link carries the board to a fresh page
    assert.strictEqual(await page.goto(base + 'squad/'), 200);
    await page.evaluate(`(() => {
      const c = document.querySelector('#create');
      c.elements.title.value = 'EU evening recon';
      c.requestSubmit();
      const j = document.querySelector('#join');
      j.elements.name.value = 'Ghost<script>';
      j.elements.region.value = 'EU';
      j.elements.when.value = 'weekdays 20:00 to 23:00 CET';
      j.elements.style.value = 'recon, mic';
      j.requestSubmit();
      j.elements.name.value = 'Max';
      j.elements.region.value = 'NA East';
      j.requestSubmit();
    })()`);
    const link = await page.evaluate(`document.querySelector('#share').value`);
    assert.ok(link.startsWith(base + 'squad/#'), link);
    assert.strictEqual(await page.evaluate('location.href'), link);

    const page2 = await browser.newPage();
    assert.strictEqual(await page2.goto(link), 200);
    await sleep(100);
    const seen = await page2.evaluate(`(() => ({
      title: document.querySelector('#board-title').textContent,
      rows: [...document.querySelectorAll('#members tr')].map((tr) => [...tr.children].map((td) => td.textContent).join('|')),
      scripts: document.querySelectorAll('#members script').length,
      createHidden: document.querySelector('#create').hidden
    }))()`);
    assert.strictEqual(seen.title, 'EU evening recon');
    assert.deepStrictEqual(seen.rows, ['Ghostscript|EU|weekdays 20:00 to 23:00 CET|recon, mic', 'Max|NA East|weekdays 20:00 to 23:00 CET|recon, mic']);
    assert.strictEqual(seen.scripts, 0);
    assert.strictEqual(seen.createHidden, true);

    // remove a name, the link changes
    const after = await page2.evaluate(`(() => {
      const l = document.querySelector('#leave');
      l.elements.name.value = 'max';
      l.requestSubmit();
      return { n: document.querySelectorAll('#members tr').length, link: document.querySelector('#share').value };
    })()`);
    assert.strictEqual(after.n, 1);
    assert.notStrictEqual(after.link, link);

    // a damaged link says so
    const page3 = await browser.newPage();
    assert.strictEqual(await page3.goto(base + 'squad/#%%%'), 200);
    await sleep(100);
    assert.match(await page3.evaluate(`document.querySelector('#board-msg').textContent`), /damaged/);
    assert.strictEqual(await page3.evaluate(`document.querySelector('#create').hidden`), false);
    await page3.close();

    // phone width: nothing wider than the screen
    await page.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
    for (const p of ['', 'squad/', 'wipe/', 'guides/hours-to-level-20/']) {
      await page.goto(base + p);
      await sleep(150);
      const sw = await page.evaluate('document.documentElement.scrollWidth');
      assert.ok(sw <= 375, p + ' fits a 375 px screen, got ' + sw);
    }

    // data: URLs are the browser's own date picker icon, not a request.
    const outside = urls.filter((u) => !u.startsWith(base) && !u.startsWith('data:') && u !== 'about:blank');
    assert.deepStrictEqual(outside, [], 'no request leaves the page');
    await page.close();
    await page2.close();
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
});
