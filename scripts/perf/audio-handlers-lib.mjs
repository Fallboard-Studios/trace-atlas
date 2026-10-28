/**
 * The pure tally behind `npm run perf:audio-handlers` (scripts/perf/audio-handlers.mjs, backlog 27 T1): which
 * Web Audio handler classes carry the audio thread, read from a Chrome trace. Node built-ins only; no I/O.
 * Unit-tested in audio-handlers-lib.test.mjs; the Chrome/CDP plumbing lives in the runner.
 *
 * Chrome's shape (blink/renderer/modules/webaudio): every render quantum is one `webaudio`
 * `RealtimeAudioDestinationHandler::Render`, and inside it every node that renders traces one
 * `disabled-by-default-webaudio.audionode` `AudioHandler::ProcessIfNecessary`, with the node's pointer in
 * `args.this` and its class in `args['node type']`. Inside it some handlers trace their own step
 * (`GainHandler::Process`, mostly with no args), and a node pulls its inputs, and the sources driving its params,
 * from inside its own event, so the events nest. Each event's SELF time (its `dur` less the `dur` of the events
 * directly inside it) goes to the node event that encloses it: a node's cost is its own work, less the nodes it pulls.
 *
 * Tracing inflates the audio thread's load (~3x seen), so the tally reports shares of the same trace's Render
 * total, never absolute cost: the inflation cancels in the ratio.
 */

const RENDER = 'RealtimeAudioDestinationHandler::Render';

/** A per-node event: Chrome's `AudioHandler::ProcessIfNecessary`, or any `Xxx::Process` a handler may trace. */
const PROCESS_SHAPED = /::Process(IfNecessary)?$/;

/** The note when the trace holds no Render at all: nothing on the audio thread was recorded. */
export const NOTE_NO_RENDER =
  `No ${RENDER} events in the trace: the webaudio category recorded nothing (was the audio context running?).`;

/** The note when Render is there but no per-handler events are (plan Q1's fallback). */
export const NOTE_NO_HANDLERS =
  `${RENDER} events are present but no per-handler events: the disabled-by-default-webaudio.audionode ` +
  'category is not live on this Chrome, so the per-handler breakdown is unavailable (read the ablations and the census).';

const threadKey = (ev) => `${ev.pid}:${ev.tid}`;

/**
 * Which node an event's self time belongs to: `{ name, instance, typed }`, or null. A node event (one carrying
 * `node type`, Chrome's ProcessIfNecessary) owns itself. Anything inside a node event belongs to that node (its own
 * `XxxHandler::Process` step, an FFT inside that). Without a node event above it, a Process-shaped event owns itself
 * by its name (a Chrome that traces only the handler steps); anything else inside one belongs to it; the rest is not
 * a handler's.
 */
function ownerOf({ ev, depth }, parentOwner, key) {
  const nodeType = ev.args?.['node type'];
  if (nodeType !== undefined) return { name: nodeType, instance: ev.args.this ?? `${ev.name}|${key}|${depth}`, typed: true };
  if (parentOwner?.typed) return parentOwner;
  if (PROCESS_SHAPED.test(ev.name)) return { name: ev.name, instance: ev.args?.this ?? `${ev.name}|${key}|${depth}`, typed: false };
  return parentOwner;
}

/**
 * Tally raw trace events into handler classes. Returns
 * `{ renderTotalUs, renderCount, classes: [{ name, selfUs, share, instances, perInstanceShare }], note }`,
 * the classes sorted by share (largest first, ties by name). Only complete ('X') events count; only events inside
 * a Render, and owned by a node (`ownerOf`), are tallied. `note` is null when
 * the breakdown is there, else one of the two exported notes.
 */
export function tallyHandlers(events) {
  const complete = (Array.isArray(events) ? events : []).filter((ev) => ev && ev.ph === 'X' && typeof ev.ts === 'number');

  let renderTotalUs = 0;
  let renderCount = 0;
  for (const ev of complete) {
    if (ev.name !== RENDER) continue;
    renderTotalUs += ev.dur ?? 0;
    renderCount++;
  }

  // Per thread: walk the events in start order (the longer first on a tie, so a parent precedes its child) with a
  // stack of open events, so each event knows its direct parent, its depth and whether a Render holds it. Only a
  // handler inside a Render is tallied, which is what keeps every other thread out.
  const perThread = new Map();
  for (const ev of complete) {
    const key = threadKey(ev);
    if (!perThread.has(key)) perThread.set(key, []);
    perThread.get(key).push(ev);
  }

  const classes = new Map();
  for (const [key, list] of perThread) {
    list.sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
    const stack = [];
    const frames = [];
    for (const ev of list) {
      const end = ev.ts + (ev.dur ?? 0);
      while (stack.length && ev.ts >= stack[stack.length - 1].end) stack.pop();
      const parent = stack.length ? stack[stack.length - 1] : null;
      const frame = {
        ev,
        end,
        childUs: 0,
        depth: parent ? parent.depth + 1 : 0,
        inRender: ev.name === RENDER || Boolean(parent?.inRender),
        owner: null,
      };
      frame.owner = ownerOf(frame, parent?.owner ?? null, key);
      if (parent) parent.childUs += ev.dur ?? 0;
      stack.push(frame);
      frames.push(frame);
    }

    // Every event's self time goes to the node that owns it, so a node's cost is its own step and everything inside
    // it, less the nodes it pulls (which own their own time).
    for (const { ev, childUs, inRender, owner } of frames) {
      if (!inRender || !owner) continue;
      const entry = classes.get(owner.name) ?? { selfUs: 0, ids: new Set() };
      entry.selfUs += (ev.dur ?? 0) - childUs;
      entry.ids.add(owner.instance);
      classes.set(owner.name, entry);
    }
  }

  const rows = [...classes].map(([name, { selfUs, ids }]) => {
    const share = selfUs / renderTotalUs; // a row exists only inside a Render, so the total is positive
    return { name, selfUs, share, instances: ids.size, perInstanceShare: share / ids.size };
  });
  rows.sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));

  let note = null;
  if (renderCount === 0) note = NOTE_NO_RENDER;
  else if (rows.length === 0) note = NOTE_NO_HANDLERS;
  return { renderTotalUs, renderCount, classes: rows, note };
}

const percent = (fraction, digits) => `${(fraction * 100).toFixed(digits)}%`;

/** The table the runner prints: one row per class, the handler total under it, then the note when there is one. */
export function formatHandlerTable(tally) {
  const header = ['class', 'share', 'instances', 'per instance'];
  const body = tally.classes.map((c) => [c.name, percent(c.share, 1), String(c.instances), percent(c.perInstanceShare, 3)]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells) => cells
    .map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i])))
    .join('  ')
    .trimEnd();

  const out = [line(header)];
  if (body.length === 0) out.push('(no handler rows)');
  else out.push(...body.map(line));
  if (tally.renderTotalUs > 0) {
    const handlerShare = tally.classes.reduce((sum, c) => sum + c.share, 0);
    out.push(`all handlers ${percent(handlerShare, 1)} of Render (${tally.renderCount} Render events)`);
  }
  if (tally.note) out.push(tally.note);
  return out.join('\n');
}
