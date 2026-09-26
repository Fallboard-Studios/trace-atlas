import { useCallback, useEffect, useRef, useState } from 'react';
import { expandNavAncestorsForId } from './useNavTree';
import { registerAccordion, unregisterAccordion, updateAccordionOpen, hasPendingNavTargetFor } from '@/utils/accordionSync';

export interface UseAccordionOpenStateResult {
  isOpen: (id: string) => boolean;
  setOpen: (id: string, open: boolean) => void;
  /** Opens `id`; when closeSiblings is true, closes every other id this hook instance currently
   *  manages first, in the same state update (docs/specs/NAV_ACCORDION_SYNC.md §2.1/§2.2 — the
   *  mobile nav-click path, scoped to this view instance's own ids only, never cross-view). */
  openExclusive: (id: string, closeSiblings: boolean) => void;
}

/**
 * Manual, independent per-accordion open/closed state for a stacked view (Settings/Fleet
 * Params/a robot/a company) — each accordion tracks its own state; opening one never closes
 * another, and nothing here is driven by nav clicks or scrollspy (Crawford's own follow-up call,
 * 2026-09-24, reversing this pass's original derived-single-open-accordion design). A nav click
 * still scrolls to a section (`scrollToSection`, `NavTreeNode.tsx`) and scrollspy still updates
 * `selectedSection`/`selectedSubsection` for tree highlighting and the lazy-mount gate
 * (`useSectionObserver`) — neither touches this hook's own state.
 *
 * Every id this instance manages is also mirrored into `accordionSync`'s registry (docs/specs/
 * NAV_ACCORDION_SYNC.md §1.3/§6.2) — registered on mount (`defaultOpenId`) and on every
 * `setOpen`/`openExclusive` call, unregistered on unmount or when a `resetKey` change resets this
 * instance back to its default. The registry is a mirror, never the source of truth — this hook's
 * own React state remains authoritative. Opening an id (from either `setOpen` or `openExclusive`)
 * also calls `expandNavAncestorsForId` so the corresponding nav row's branch/entity ancestors are
 * expanded even if the accordion was opened by clicking its own header rather than a nav link;
 * closing never does this — nav-tree state must never collapse as a side effect of closing an
 * accordion (spec §3.1/§3.2).
 *
 * `defaultOpenId` opens exactly one accordion on mount (so the view isn't all-collapsed on first
 * render); after that, `setOpen` is the only thing that changes state, and closing every open
 * accordion is a legal end state.
 *
 * `resetKey`, when provided, resets back to `defaultOpenId` alone whenever it changes — for a
 * component instance that gets reused across different entities without remounting (e.g.
 * `RobotOptionsTab`'s `RobotOptionsPanel`, `CompanyOptionsSection`'s own `prefix`), so switching
 * to a different robot/company doesn't carry over which accordions were left open on the last one.
 *
 * `ids` is the full list of accordion ids this instance manages — every one of them is registered
 * with `accordionSync` up front, on mount and whenever `ids`/`resetKey` change (bug fix: previously
 * only `defaultOpenId` was ever registered eagerly, so a nav click on an accordion nobody had
 * manually toggled yet found no registry entry and silently did nothing — the only accordion a nav
 * click could ever open was whichever one happened to already be open).
 *
 * If a nav click is already mid-flight targeting one of `ids` when this instance first mounts (a
 * cross-view click — the target view didn't exist yet at click time, so `accordionSync` queued it
 * as a pending nav target instead of finding it registered), the usual `defaultOpenId` open is
 * skipped for that mount: `accordionSync`'s own pending-target fulfillment (triggered by this
 * instance's own mount-time registration below) becomes the only thing that opens, rather than
 * opening alongside — and immediately fighting the layout of — the view's usual default (found
 * live: switching into a fresh view showed both the clicked target AND the default-open accordion
 * expanded at once).
 */
export function useAccordionOpenState(ids: string[], defaultOpenId: string | null, resetKey?: string): UseAccordionOpenStateResult {
  const idsKey = ids.join('|');

  const makeDefault = useCallback(
    (): Record<string, boolean> => (defaultOpenId && !hasPendingNavTargetFor(ids) ? { [defaultOpenId]: true } : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ids` intentionally compared by content (idsKey), not object identity
    [defaultOpenId, idsKey],
  );
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(makeDefault);
  const registeredIdsRef = useRef<Set<string>>(new Set());

  // React's own "adjusting state during render" pattern for resetting state when a prop changes,
  // without needing the caller to remount via `key` — avoids an extra render-then-effect flash.
  // Uses useState (not a ref) to track the previous key: this repo's react-hooks/refs lint rule
  // forbids reading/writing a ref's `.current` during render, even for this otherwise-documented
  // React pattern.
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== undefined && resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setOpenIds(makeDefault());
  }

  const isOpen = useCallback((id: string) => !!openIds[id], [openIds]);

  // Ref-to-latest-callback (not a circular useCallback dependency) — syncRegistry's own registered
  // `open` entry needs to invoke openExclusive, which is itself defined below in terms of
  // syncRegistry; a ref sidesteps the ordering entirely and is always current by call time.
  const openExclusiveRef = useRef<(id: string, closeSiblings: boolean) => void>(() => {});

  const syncRegistry = useCallback((id: string, isOpenValue: boolean) => {
    registerAccordion(id, {
      isOpen: isOpenValue,
      open: (closeSiblings: boolean) => openExclusiveRef.current(id, closeSiblings),
    });
    registeredIdsRef.current.add(id);
    updateAccordionOpen(id, isOpenValue);
  }, []);

  const setOpen = useCallback((id: string, open: boolean) => {
    setOpenIds((prev) => ({ ...prev, [id]: open }));
    syncRegistry(id, open);
    if (open) expandNavAncestorsForId(id);
  }, [syncRegistry]);

  const openExclusive = useCallback((id: string, closeSiblings: boolean) => {
    setOpenIds((prev) => {
      if (!closeSiblings) return { ...prev, [id]: true };
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) next[key] = false;
      next[id] = true;
      return next;
    });
    if (closeSiblings) {
      for (const key of registeredIdsRef.current) {
        if (key !== id) syncRegistry(key, false);
      }
    }
    syncRegistry(id, true);
    expandNavAncestorsForId(id);
  }, [syncRegistry]);

  useEffect(() => {
    openExclusiveRef.current = openExclusive;
  }, [openExclusive]);

  // Registers every id this instance manages on mount and whenever `ids`/`resetKey` change,
  // unregistering everything this instance had registered first — so a resetKey change never
  // leaves accordionSync reflecting a stale mix of the previous and current entity's ids. Reads
  // `openIds` only at the moment this effect (re-)runs, intentionally excluded from the dependency
  // array: subsequent open/close changes are already kept in sync precisely, per id, by
  // setOpen/openExclusive's own syncRegistry calls above — re-running this whole-list effect on
  // every single open/close would just be redundant churn.
  useEffect(() => {
    for (const id of ids) {
      registerAccordion(id, {
        isOpen: !!openIds[id],
        open: (closeSiblings: boolean) => openExclusiveRef.current(id, closeSiblings),
      });
      registeredIdsRef.current.add(id);
    }
    return () => {
      for (const id of registeredIdsRef.current) unregisterAccordion(id);
      registeredIdsRef.current = new Set();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, resetKey]);

  return { isOpen, setOpen, openExclusive };
}
