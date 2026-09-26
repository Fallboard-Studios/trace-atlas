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
 * (1) switch views without popping open that view's own default accordion, (2) expand the actual
 * clicked target, (3) only THEN scroll to it — scrolling before the accordion's open-tween finishes
 * scrolls to the wrong (pre-expansion) position. Two mechanisms support this:
 * - `onSettled` on `openAccordionFromNav` fires once the target accordion has genuinely finished
 *   opening (immediately if it was already open, otherwise once its GSAP tween completes —
 *   AccordionContainer.tsx calls `notifyAccordionAnimationComplete` from that tween's onComplete).
 * - The "pending nav target" queue handles clicking into a view that hasn't mounted yet (so nothing
 *   is registered at click time): the request waits until the matching accordion registers, at
 *   which point it's fulfilled the same way. `useAccordionOpenState` also consults
 *   `hasPendingNavTargetFor` before computing its own mount-time default-open state, so the
 *   about-to-be-fulfilled pending target is the ONLY thing that opens — not both it and the view's
 *   usual default.
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

/** Walks `id` up its own dot-segment ancestry (dropping trailing `.segment`s) until it finds a
 *  registered entry, or returns undefined if nothing in the chain is registered. */
function findRegisteredAncestorOrSelf(id: string): { id: string; entry: AccordionEntry } | undefined {
  let candidate = id;
  while (candidate) {
    const entry = registry.get(candidate);
    if (entry) return { id: candidate, entry };
    const lastDot = candidate.lastIndexOf('.');
    if (lastDot === -1) return undefined;
    candidate = candidate.slice(0, lastDot);
  }
  return undefined;
}

/** Opens `entry` and, if `onSettled` is given, calls it once the open has genuinely taken visible
 *  effect — immediately if `entry` was already open (nothing will animate), otherwise once its
 *  open-tween's completion is reported via `notifyAccordionAnimationComplete`. */
function openAndSettle(id: string, entry: AccordionEntry, closeSiblings: boolean, onSettled?: () => void): void {
  const wasOpen = entry.isOpen;
  entry.open(closeSiblings);
  if (!onSettled) return;
  if (wasOpen) onSettled();
  else onceAccordionAnimationComplete(id, onSettled);
}

// ========================================
// EXPORTS
// ========================================

/** Store an id's accordion entry, replacing any stale entry under the same id — matches
 *  sectionRefs.ts's own setSectionRef contract exactly. Also fulfills a queued pending nav target
 *  (see module doc comment) if this newly-registered id is that target's own id or an ancestor of
 *  it — the view that was just navigated to has now mounted and registered its accordions. */
export function registerAccordion(id: string, entry: AccordionEntry): void {
  registry.set(id, entry);
  if (pendingNavTarget && isAncestorOrSelf(id, pendingNavTarget.id)) {
    const { closeSiblings, onSettled } = pendingNavTarget;
    pendingNavTarget = null;
    openAndSettle(id, entry, closeSiblings, onSettled);
  }
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
 *  pending target ends up the ONLY accordion that opens rather than opening alongside the default. */
export function hasPendingNavTargetFor(ids: string[]): boolean {
  return !!pendingNavTarget && ids.some((id) => isAncestorOrSelf(id, pendingNavTarget!.id));
}

/** Direction 1's entry point (nav click → open content accordion, spec §2.1) — opens `id`'s own
 *  accordion if registered; otherwise walks up its ancestor ids (dropping trailing `.segment`s)
 *  until it finds one that is, since some nav ids (e.g. Fleet Params' individual leaves — 3-Band
 *  EQ, High-Pass Filter — render as plain anchors with no accordion of their own, only their
 *  parent group does) should open their nearest ancestor's accordion instead of doing nothing.
 *
 * If nothing in `id`'s ancestry is registered yet — most commonly because the nav click is
 * switching into a view that hasn't mounted (and so hasn't registered any of its accordions) yet —
 * the request is queued as a pending nav target and fulfilled the moment a matching id registers
 * (see `registerAccordion`), rather than silently doing nothing.
 *
 * `opts.onSettled`, if given, fires once the eventual target has genuinely finished opening —
 * immediately if it was already open, otherwise once its GSAP open-tween completes. Used to defer
 * scrolling until the target's final (post-expansion) position is stable. */
export function openAccordionFromNav(id: string, opts: { closeSiblings: boolean; onSettled?: () => void }): void {
  const found = findRegisteredAncestorOrSelf(id);
  if (found) {
    pendingNavTarget = null;
    openAndSettle(found.id, found.entry, opts.closeSiblings, opts.onSettled);
    return;
  }
  pendingNavTarget = { id, closeSiblings: opts.closeSiblings, onSettled: opts.onSettled };
}

/** Clears any queued pending nav target without fulfilling it — for tests, and for a future caller
 *  that needs to cancel an in-flight cross-view navigation. */
export function clearPendingNavTarget(): void {
  pendingNavTarget = null;
}
