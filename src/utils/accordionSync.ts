/**
 * Live mirror of accordion open/closed state, keyed by the same ids sectionRefs.ts uses for scroll
 * anchors and useNavTree.ts uses for nav-tree nodes (they're the same id space, docs/specs/
 * NAV_ACCORDION_SYNC.md §1.1). Each useAccordionOpenState instance registers the ids it owns on
 * mount and pushes every state change here; NavCabinetRow subscribes to read "is this id open"
 * without owning that state itself. This registry is a mirror, never the source of truth — the
 * owning useAccordionOpenState instance's own React state remains authoritative (§5 of the spec).
 * Mirrors sectionRefs.ts's own module-level-Map shape and silent-replace-on-collision contract.
 *
 * Also sequences nav-click navigation (found live, after the first pass shipped): a nav click must
 * (1) switch views without popping open that view's own default accordion, (2) expand every real
 * accordion between the clicked target and the top of its own nesting — e.g. clicking "Baseline
 * Oscillator" (nested inside the "Source" accordion) must open Source, THEN Baseline Oscillator, not
 * just the one exact id match — and (3) only THEN scroll to it, once the whole chain has actually
 * finished opening (scrolling before an open-tween finishes lands on the pre-expansion position).
 * Mechanisms:
 * - `getRegisteredChain` walks `id`'s own dot-segments from the top down and collects every
 *   registered ancestor-or-self accordion, in outer-to-inner order — the same lookup covers both
 *   "no accordion of its own, only an ancestor has one" (Fleet Params' leaves) and "nested inside
 *   another accordion" (Source's own children) as one mechanism.
 * - `openAccordionFromNav`'s `onSettled` fires only once every accordion in that chain has opened
 *   and settled, each waiting for the previous one's GSAP tween to complete (or immediately if it
 *   was already open) before the next one opens — never simultaneously, so Source is visibly open
 *   before Baseline Oscillator starts expanding inside it.
 * - The "pending nav target" queue handles clicking into a view that hasn't mounted yet (nothing is
 *   registered at click time): the request waits until `useAccordionOpenState`'s own mount-time
 *   registration batch finishes (`attemptFulfillPendingNavTarget`, called once per batch, never per
 *   individual id — a chain's outer members can register after its inner ones within the same
 *   batch, so fulfilling on the very first match would risk opening only the inner one). It also
 *   consults `hasPendingNavTargetFor` before computing its own mount-time default-open state, so
 *   the about-to-be-fulfilled pending target is the ONLY thing that opens, not it and the default.
 */

export interface AccordionEntry {
  isOpen: boolean;
  /** Opens this id in its owning view; closeSiblings closes every other id that same view
   *  instance currently has open first (mobile nav-click path only, spec §2.1/§2.2). */
  open: (closeSiblings: boolean) => void;
}

interface PendingNavTarget {
  id: string;
  closeSiblings: boolean;
  onSettled?: () => void;
}

interface ChainLink {
  id: string;
  entry: AccordionEntry;
}

// ========================================
// STATE
// ========================================
const registry = new Map<string, AccordionEntry>();
const listeners = new Map<string, Set<() => void>>();
const animationCompleteListeners = new Map<string, Set<() => void>>();
let pendingNavTarget: PendingNavTarget | null = null;

// ========================================
// INTERNAL HELPERS
// ========================================

/** True when `ancestorOrSelfId` is `id` itself, or a dot-segment-prefix ancestor of it — e.g.
 *  'fleetParams.eqFilters' is an ancestor-or-self of 'fleetParams.eqFilters.eq'. */
function isAncestorOrSelf(ancestorOrSelfId: string, id: string): boolean {
  return id === ancestorOrSelfId || id.startsWith(`${ancestorOrSelfId}.`);
}

/** For an id with no accordion of its own anywhere in its ancestry, and no accordion at its exact
 *  id either — Probes/Companies' Volume/Melody/Envelope section nodes (`probes.<id>.<section>`)
 *  are exactly this: real nav-tree nodes with no accordion of their own, only their one subsection
 *  leaf (`probes.<id>.<section>.<subsection>`) has one. Resolves to that single immediate child if
 *  there is exactly one registered one level deeper; returns undefined if there are zero (nothing
 *  to resolve to) or more than one (ambiguous — guessing which one the user meant would be wrong).
 *
 *  Scoped to ids with 3+ dot-segments (`branch.entity.section[...]`) — a 2-segment entity id (a
 *  whole robot/company, `probes.<id>`) almost always has several equally-valid deeper accordions,
 *  and silently picking one instead of the view's own intentional default-open accordion would be
 *  a real regression on the single most common nav action (selecting a robot/company at all). A
 *  1-segment branch id (`probes`) is excluded for the same reason. */
function resolveSoleImmediateAccordionChild(id: string): string | undefined {
  if (id.split('.').length < 3) return undefined;
  const prefix = `${id}.`;
  const expectedSegmentCount = id.split('.').length + 1;
  let candidate: string | undefined;
  for (const key of registry.keys()) {
    if (!key.startsWith(prefix) || key.split('.').length !== expectedSegmentCount) continue;
    if (candidate !== undefined) return undefined;
    candidate = key;
  }
  return candidate;
}

/** Every registered accordion along `id`'s own dot-segment path, outermost first — e.g. for
 *  'probes.r1.source.baselineOscillator' with both 'probes.r1.source' (the Source group) and the
 *  full id itself registered, returns both, Source first. An id with no accordion of its own but a
 *  registered ancestor (Fleet Params' leaves) returns just that ancestor. An id with no accordion
 *  anywhere in its own ancestry falls back to its sole immediate registered child, if any
 *  (`resolveSoleImmediateAccordionChild` — Probes/Companies' Volume/Melody/Envelope section nodes).
 *  Returns an empty array only if neither resolves anything. */
function getRegisteredChain(id: string): ChainLink[] {
  const segments = id.split('.');
  const chain: ChainLink[] = [];
  let prefix = '';
  for (const segment of segments) {
    prefix = prefix ? `${prefix}.${segment}` : segment;
    const entry = registry.get(prefix);
    if (entry) chain.push({ id: prefix, entry });
  }
  if (chain.length > 0) return chain;
  const child = resolveSoleImmediateAccordionChild(id);
  return child ? getRegisteredChain(child) : chain;
}

/** Opens every link in `chain` in order, each waiting for the previous one to genuinely finish
 *  opening before the next one starts — immediately if a link was already open (nothing will
 *  animate), otherwise once its GSAP tween's completion is reported via
 *  `notifyAccordionAnimationComplete`. `closeSiblings` applies only to the first (outermost) link —
 *  applying it again at an inner link would immediately re-close the outer one it shares a
 *  `useAccordionOpenState` instance with. Calls `onSettled` once every link has settled, or
 *  immediately if `chain` is empty. */
function openChainSequentially(chain: ChainLink[], closeSiblings: boolean, onSettled?: () => void, index = 0): void {
  if (index >= chain.length) {
    onSettled?.();
    return;
  }
  const { id, entry } = chain[index];
  const wasOpen = entry.isOpen;
  entry.open(index === 0 ? closeSiblings : false);
  const openNext = () => openChainSequentially(chain, closeSiblings, onSettled, index + 1);
  if (wasOpen) openNext();
  else onceAccordionAnimationComplete(id, openNext);
}

// ========================================
// EXPORTS
// ========================================

/** Store an id's accordion entry, replacing any stale entry under the same id — matches
 *  sectionRefs.ts's own setSectionRef contract exactly. Does not itself attempt to fulfill a
 *  pending nav target — see `attemptFulfillPendingNavTarget`, called once per registration batch. */
export function registerAccordion(id: string, entry: AccordionEntry): void {
  registry.set(id, entry);
}

/** Remove an id's own entry. Safe to call for an id that was never registered. */
export function unregisterAccordion(id: string): void {
  registry.delete(id);
}

/** Update a registered id's open/closed value and notify its subscribers. A no-op for an id with
 *  no registered entry — never a throw. */
export function updateAccordionOpen(id: string, isOpen: boolean): void {
  const entry = registry.get(id);
  if (entry) entry.isOpen = isOpen;
  for (const cb of listeners.get(id) ?? []) cb();
}

/** Current open/closed value for an id. Returns false, not undefined, for an id with no
 *  registered entry. */
export function isAccordionOpen(id: string): boolean {
  return registry.get(id)?.isOpen ?? false;
}

/** Subscribe to open/closed changes for one id — for useSyncExternalStore in NavCabinetRow.
 *  Returns an unsubscribe function. */
export function subscribeAccordionOpen(id: string, cb: () => void): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(cb);
  return () => set!.delete(cb);
}

/** Called by AccordionContainer.tsx once an id's open-direction GSAP tween completes — fires (and
 *  clears) every one-shot listener `onceAccordionAnimationComplete` registered for that id. A
 *  no-op if nothing is listening. */
export function notifyAccordionAnimationComplete(id: string): void {
  const set = animationCompleteListeners.get(id);
  if (!set) return;
  animationCompleteListeners.delete(id);
  for (const cb of set) cb();
}

/** One-shot: `cb` fires the next time `notifyAccordionAnimationComplete(id)` is called, then is
 *  automatically removed. */
export function onceAccordionAnimationComplete(id: string, cb: () => void): void {
  let set = animationCompleteListeners.get(id);
  if (!set) {
    set = new Set();
    animationCompleteListeners.set(id, set);
  }
  set.add(cb);
}

/** True when a queued pending nav target (see module doc comment) would resolve to one of `ids` —
 *  used by `useAccordionOpenState` to suppress its own mount-time default-open when a nav click
 *  that hasn't been fulfilled yet is about to be, by one of the ids it's about to register, so the
 *  pending target ends up the ONLY accordion (or accordion chain) that opens rather than opening
 *  alongside the default. */
export function hasPendingNavTargetFor(ids: string[]): boolean {
  return !!pendingNavTarget && ids.some((id) => isAncestorOrSelf(id, pendingNavTarget!.id));
}

/** Called by `useAccordionOpenState` once per registration batch (mount, or an `ids`/`resetKey`
 *  change), after every id in that batch has been registered — never per individual
 *  `registerAccordion` call, since a chain's outer accordion can register after its inner one
 *  within the same batch (e.g. Source's own children are registered before Source itself), and
 *  fulfilling on the first match found would risk opening only the inner accordion. A no-op if
 *  nothing is queued, or if the queued target still doesn't resolve to anything registered yet
 *  (some other, not-yet-mounted view is still the real destination). */
export function attemptFulfillPendingNavTarget(): void {
  if (!pendingNavTarget) return;
  const chain = getRegisteredChain(pendingNavTarget.id);
  if (chain.length === 0) return;
  const { closeSiblings, onSettled } = pendingNavTarget;
  pendingNavTarget = null;
  openChainSequentially(chain, closeSiblings, onSettled);
}

/** Direction 1's entry point (nav click → open content accordion, spec §2.1) — opens every real
 *  accordion along `id`'s own nesting, outermost first (see `getRegisteredChain`/
 *  `openChainSequentially`): this covers both an id with no accordion of its own but a registered
 *  ancestor (Fleet Params' individual leaves — 3-Band EQ, High-Pass Filter — render as plain
 *  anchors, only their parent group has an accordion) and an id nested inside another accordion
 *  (Source's own oscillator/drift children) as the same mechanism.
 *
 * If nothing in `id`'s own path is registered yet — most commonly because the nav click is
 * switching into a view that hasn't mounted (and so hasn't registered any of its accordions) yet —
 * the request is queued as a pending nav target and fulfilled once `useAccordionOpenState`'s own
 * mount-time registration batch completes (`attemptFulfillPendingNavTarget`), rather than silently
 * doing nothing.
 *
 * `opts.onSettled`, if given, fires once every accordion in the resolved chain has genuinely
 * finished opening, each waiting for the previous one's tween before the next starts. Used to defer
 * scrolling until the target's final (post-expansion) position is stable. */
export function openAccordionFromNav(id: string, opts: { closeSiblings: boolean; onSettled?: () => void }): void {
  const chain = getRegisteredChain(id);
  if (chain.length > 0) {
    pendingNavTarget = null;
    openChainSequentially(chain, opts.closeSiblings, opts.onSettled);
    return;
  }
  pendingNavTarget = { id, closeSiblings: opts.closeSiblings, onSettled: opts.onSettled };
}

/** Clears any queued pending nav target without fulfilling it — for tests, and for a future caller
 *  that needs to cancel an in-flight cross-view navigation. */
export function clearPendingNavTarget(): void {
  pendingNavTarget = null;
}
