/**
 * Live mirror of accordion open/closed state, keyed by the same ids sectionRefs.ts uses for scroll
 * anchors and useNavTree.ts uses for nav-tree nodes (they're the same id space, docs/specs/
 * NAV_ACCORDION_SYNC.md §1.1). Each useAccordionOpenState instance registers the ids it owns on
 * mount and pushes every state change here; NavCabinetRow subscribes to read "is this id open"
 * without owning that state itself. This registry is a mirror, never the source of truth — the
 * owning useAccordionOpenState instance's own React state remains authoritative (§5 of the spec).
 * Mirrors sectionRefs.ts's own module-level-Map shape and silent-replace-on-collision contract.
 */

export interface AccordionEntry {
  isOpen: boolean;
  /** Opens this id in its owning view; closeSiblings closes every other id that same view
   *  instance currently has open first (mobile nav-click path only, spec §2.1/§2.2). */
  open: (closeSiblings: boolean) => void;
}

// ========================================
// STATE
// ========================================
const registry = new Map<string, AccordionEntry>();
const listeners = new Map<string, Set<() => void>>();

// ========================================
// EXPORTS
// ========================================

/** Store an id's accordion entry, replacing any stale entry under the same id — matches
 *  sectionRefs.ts's own setSectionRef contract exactly. */
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

/** Direction 1's entry point (nav click → open content accordion, spec §2.1) — a safe no-op if
 *  `id` isn't registered, matching scrollToSection's own no-op-on-unregistered-id contract (an id
 *  like the merged-away "Pitches" leaf has no accordion to open). */
export function openAccordionFromNav(id: string, opts: { closeSiblings: boolean }): void {
  registry.get(id)?.open(opts.closeSiblings);
}
