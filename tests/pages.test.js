'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DOCS = path.join(__dirname, '..', 'docs');

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

const pages = htmlFiles(DOCS);
const guides = pages.filter((p) => p.includes(path.sep + 'guides' + path.sep) && !p.endsWith(path.join('guides', 'index.html')));

test('the site has the three tools and ten question pages', () => {
  for (const p of ['index.html', 'wipe/index.html', 'squad/index.html', 'guides/index.html']) {
    assert.ok(fs.existsSync(path.join(DOCS, p)), p);
  }
  assert.strictEqual(guides.length, 10);
});

for (const file of pages) {
  const rel = path.relative(DOCS, file);
  const html = fs.readFileSync(file, 'utf8');

  test(rel + ': English, titled, described', () => {
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<title>[^<]{10,}<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{40,}">/);
  });

  test(rel + ': says it is unofficial and not affiliated', () => {
    assert.match(html, /Unofficial fan tool\. Not affiliated with, endorsed by or connected to BULKHEAD, Team17 or Valve\./);
  });

  test(rel + ': no long dash, no claim of being official', () => {
    assert.ok(!/[—–]/.test(html));
    assert.ok(!/(?<!un)official (site|wiki|tool|calculator)/i.test(html));
  });

  test(rel + ': loads nothing from another site', () => {
    const loads = [...html.matchAll(/<(?:script|img|link|iframe)[^>]+(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const u of loads) assert.ok(!/^(https?:)?\/\//.test(u), u);
    assert.ok(!/@import|url\(http/.test(html));
  });

  test(rel + ': every local link points to a file that exists', () => {
    const links = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
    for (const u of links) {
      let target = path.resolve(path.dirname(file), u);
      if (u.endsWith('/') || u === '.' || u === './') target = path.join(target, 'index.html');
      assert.ok(fs.existsSync(target), rel + ' -> ' + u);
    }
  });

  test(rel + ': player numbers cite a Steam review', () => {
    if (!/class="tag">(default )?reported by/.test(html)) return;
    assert.match(html, /https:\/\/steamcommunity\.com\/profiles\/\d{17}\/recommended\/1867240\//);
  });
}

for (const file of guides) {
  test(path.relative(DOCS, file) + ': leads to one of the tools', () => {
    const html = fs.readFileSync(file, 'utf8');
    const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
    assert.match(main, /href="\.\.\/\.\.\/(squad\/|wipe\/)?"/);
  });
}

test('the calculator page defaults match the cited reviews', () => {
  const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
  assert.match(html, /name="xpPerMatch"[^>]*value="5000"/);
  assert.match(html, /name="matchMinutes"[^>]*value="60"/);
  assert.match(html, /"Estimated at 5000xp per round"/);
  assert.match(html, /"an entire 1-hour match worth of money"/);
});

test('the scripts never write markup from user input', () => {
  for (const f of ['calc.js', 'board.js']) {
    const js = fs.readFileSync(path.join(DOCS, f), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(js), f);
    assert.ok(!/fetch\(|XMLHttpRequest|localStorage|document\.cookie|sendBeacon/.test(js), f);
  }
});
