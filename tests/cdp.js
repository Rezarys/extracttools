// Minimal Chrome DevTools Protocol client: launches a local headless Chrome and talks to it
// over the built-in WebSocket of Node 22+. No browser automation library is needed. Used by the tests only.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

function findChrome() {
  for (const p of CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chrome or Chromium found; set CHROME_PATH');
}

class Browser {
  constructor(proc, ws, profileDir) {
    this.proc = proc;
    this.ws = ws;
    this.profileDir = profileDir;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, method } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }

  static async launch() {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wipeclock-'));
    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--mute-audio',
      '--hide-scrollbars',
      '--window-size=1280,900',
    ];
    // GitHub-hosted Ubuntu runners block the Chrome sandbox (no unprivileged user namespaces).
    if (process.platform === 'linux') args.push('--no-sandbox');
    const proc = spawn(findChrome(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const wsUrl = await new Promise((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error('Chrome did not start in 20 s')), 20000);
      proc.stderr.on('data', (d) => {
        buf += d.toString();
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(timer); resolve(m[1]); }
      });
      proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited (${code})`)); });
    });
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('cannot connect to Chrome')), { once: true });
    });
    return new Browser(proc, ws, profileDir);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(msg));
    });
  }

  async newPage() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, sessionId, targetId);
    await page.send('Page.enable');
    await page.send('Network.enable');
    return page;
  }

  async close() {
    try { await this.send('Browser.close'); } catch { /* already gone */ }
    try { this.ws.close(); } catch { /* ignore */ }
    await new Promise((r) => {
      if (this.proc.exitCode !== null) return r();
      const t = setTimeout(() => { this.proc.kill('SIGKILL'); r(); }, 3000);
      this.proc.on('exit', () => { clearTimeout(t); r(); });
    });
    fs.rmSync(this.profileDir, { recursive: true, force: true });
  }
}

class Page {
  constructor(browser, sessionId, targetId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.targetId = targetId;
  }

  send(method, params) {
    return this.browser.send(method, params, this.sessionId);
  }

  waitFor(eventName, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.browser.listeners.delete(fn); resolve(false); }, timeoutMs);
      const fn = (msg) => {
        if (msg.sessionId === this.sessionId && msg.method === eventName) {
          clearTimeout(timer);
          this.browser.listeners.delete(fn);
          resolve(true);
        }
      };
      this.browser.listeners.add(fn);
    });
  }

  // Navigates and waits for the load event (or the timeout, then scans whatever has loaded).
  // Returns the HTTP status of the main document (0 when unknown, for example file:// pages).
  async goto(url, timeoutMs = 20000) {
    const loaded = this.waitFor('Page.loadEventFired', timeoutMs);
    const docs = [];
    const onResponse = (msg) => {
      if (msg.sessionId === this.sessionId && msg.method === 'Network.responseReceived' && msg.params.type === 'Document') docs.push(msg.params);
    };
    this.browser.listeners.add(onResponse);
    try {
      const res = await Promise.race([
        this.send('Page.navigate', { url }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`the page did not answer in ${Math.round(timeoutMs / 1000)} s`)), timeoutMs)),
      ]).catch(async (e) => {
        try { await this.send('Page.stopLoading'); } catch { /* ignore */ }
        throw e;
      });
      if (res.errorText) throw new Error(`cannot load ${url}: ${res.errorText}`);
      await loaded;
      await new Promise((r) => setTimeout(r, 800));
      const main = docs.filter((d) => d.frameId === res.frameId).pop();
      return main ? main.response.status : 0;
    } finally {
      this.browser.listeners.delete(onResponse);
    }
  }

  async setContent(html) {
    const { frameTree } = await this.send('Page.getFrameTree');
    await this.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
  }

  async evaluate(expression, { awaitPromise = false } = {}) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(`page script failed: ${(d.exception && d.exception.description) || d.text}`);
    }
    return res.result.value;
  }

  async close() {
    try { await this.browser.send('Target.closeTarget', { targetId: this.targetId }); } catch { /* ignore */ }
  }
}

module.exports = { Browser, findChrome };
