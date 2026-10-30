/**
 * The Chrome plumbing every perf script shares (backlog 30): find an installed Chrome/Edge, launch it headless on a
 * throwaway profile, drive its page over the DevTools Protocol with Node's built-in WebSocket (Node 22+/24, no new
 * dependency), and close it and every process it spawned afterwards, Ctrl+C included.
 *
 * Network and process plumbing, so it is verified by real runs rather than unit tests, with the orphaned-Chrome check
 * before and after (docs/PERFORMANCE.md, "Measurement hygiene"). The temp profile's `trace-atlas-perf-` prefix is what
 * that check filters on.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome(chromePath) {
  const platformDefaults = process.platform === 'win32'
    ? [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = [chromePath, process.env.CHROME_PATH, ...platformDefaults].filter(Boolean).find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found — pass --chrome <path> or set CHROME_PATH.');
  return found;
}

async function connect(port) {
  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      wsUrl = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* browser not listening yet */ }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error(`Chrome did not expose a debugging target on port ${port}.`);

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method) {
      for (const listener of listeners) listener(msg);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return {
    send,
    /** Runs `expression` in the page, awaiting a promise, and returns its value; a page-side exception throws here. */
    evaluate: async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
      return r.result.value;
    },
    onEvent: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    close: () => ws.close(),
  };
}

/** Closes Chrome and every child process it spawned, so nothing is left behind (verify with the orphan check). */
async function shutdown(chrome, cdp) {
  try { await Promise.race([cdp?.send('Browser.close'), sleep(2000)]); } catch { /* the socket drops as Chrome exits */ }
  try { cdp?.close(); } catch { /* already closed */ }
  for (let i = 0; i < 25 && chrome.exitCode === null && chrome.signalCode === null; i++) await sleep(200);
  if (chrome.exitCode === null && chrome.signalCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill('SIGKILL');
    await sleep(500);
  }
}

/**
 * One fresh headless Chrome on a temp profile, open at about:blank: connects, hands `run` the page's
 * `{ send, evaluate, onEvent }`, returns what `run` returns, and always shuts Chrome down and removes the profile —
 * on Ctrl+C too, which then exits 130. `chromePath` may be undefined (then $CHROME_PATH, then a platform default);
 * `flags` are extra Chrome switches, e.g. `--mute-audio`.
 */
export async function withChrome({ chromePath, port, flags = [] }, run) {
  const profileDir = mkdtempSync(join(tmpdir(), 'trace-atlas-perf-'));
  const chrome = spawn(findChrome(chromePath), [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--autoplay-policy=no-user-gesture-required',
    ...flags,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });
  const removeProfile = () => {
    try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* Chrome may still hold the profile briefly on Windows — harmless in tmp */ }
  };

  let cdp;
  const onInterrupt = () => { shutdown(chrome, cdp).then(removeProfile).finally(() => process.exit(130)); };
  process.once('SIGINT', onInterrupt);
  try {
    cdp = await connect(port);
    return await run(cdp);
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    await shutdown(chrome, cdp);
    removeProfile();
  }
}
