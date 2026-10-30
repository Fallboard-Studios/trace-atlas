/**
 * The open-the-world sequence the two audio tools share, `perf:audio` (audio-load.mjs) and `perf:audio-handlers`
 * (audio-handlers.mjs), built on cdp-lib.mjs's general Chrome plumbing and audio-load-lib.mjs's pure world helpers
 * (backlog 27 T2). Kept out of cdp-lib.mjs, which every perf script uses and which knows nothing about worlds.
 *
 * Network and process plumbing, so it is verified by real runs rather than unit tests, as cdp-lib.mjs is
 * (docs/PERFORMANCE.md, "Measurement hygiene").
 */
import { buildPageUrl, chooseRealtimeContext, expectedCoordinates, parseCoordinatesFromHud } from './audio-load-lib.mjs';
import { sleep, withChrome } from './cdp-lib.mjs';

/**
 * Open one pinned world in a fresh Chrome and power it on: the sequence `perf:audio` and `perf:audio-handlers` share
 * (backlog 27 T2). `WebAudio` is enabled before navigation so the realtime context's creation is seen; then the page
 * loads `world` under `baseUrl` (with `?debug` unless `debug` is false), the Power button is clicked, `warmupSec`
 * passes, the overlay's rows are read as `carried`, and the pin check aborts if the overlay landed anywhere but the
 * spec's coordinates. `domains` are extra CDP domains enabled before navigation (e.g. `['Performance']`); `listen`
 * sees every CDP event from before navigation on. `run` gets the page's `{ send, evaluate, onEvent }` plus
 * `{ url, contextId, carried }`, and its return value is returned; Chrome is always shut down afterwards.
 */
export async function withPoweredWorld({ chromePath, port, baseUrl, world, debug = true, warmupSec, domains = [], listen }, run) {
  return withChrome({ chromePath, port }, async (cdp) => {
    const { send, evaluate, onEvent } = cdp;
    const created = [];
    const destroyed = [];
    onEvent((msg) => {
      if (msg.method === 'WebAudio.contextCreated') created.push(msg.params.context);
      if (msg.method === 'WebAudio.contextWillBeDestroyed') destroyed.push(msg.params.contextId);
    });
    if (listen) onEvent(listen);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('WebAudio.enable');
    for (const domain of domains) await send(`${domain}.enable`);

    const url = buildPageUrl(baseUrl, world, { debug });
    await send('Page.navigate', { url });
    for (let i = 0; i < 75; i++) {
      if (await evaluate(`!!document.querySelector('button[aria-label="Power on"]')`)) break;
      if (i === 74) throw new Error(`Power button never appeared at ${url} — is the server running and is the base path right?`);
      await sleep(200);
    }
    await sleep(1500);
    await evaluate(`document.querySelector('button[aria-label="Power on"]').click()`);
    await sleep(warmupSec * 1000);

    const contextId = chooseRealtimeContext(created, destroyed);
    if (contextId === null) throw new Error('No realtime AudioContext was created — did the page power on?');

    // What the world carries, as the overlay states it after the warm-up (one line per overlay row).
    const carried = await evaluate(`[...document.querySelectorAll('.audio-debug-hud > div')].map((d) => d.textContent)`);

    // The pin check: a world measured somewhere other than its label has misled this harness before
    // (docs/PERFORMANCE.md, "Pre-change baseline for roadmap 17.2.6", the retraction).
    const landed = parseCoordinatesFromHud(carried.join('\n'));
    const expected = expectedCoordinates(world);
    if (landed && (landed.x !== expected.x || landed.y !== expected.y)) {
      const hint = 'the page did not honour ?seed=&x=&y= (a build older than the world link, roadmap 56?)';
      throw new Error(`World not pinned: the page landed at (${landed.x}, ${landed.y}), expected (${expected.x}, ${expected.y}) — ${hint}.`);
    }

    return run({ ...cdp, url, contextId, carried });
  });
}
