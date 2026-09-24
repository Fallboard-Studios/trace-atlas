import { useCallback, useState } from 'react';

export interface UseAccordionOpenStateResult {
  isOpen: (id: string) => boolean;
  setOpen: (id: string, open: boolean) => void;
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
 * `defaultOpenId` opens exactly one accordion on mount (so the view isn't all-collapsed on first
 * render); after that, `setOpen` is the only thing that changes state, and closing every open
 * accordion is a legal end state.
 *
 * `resetKey`, when provided, resets back to `defaultOpenId` alone whenever it changes — for a
 * component instance that gets reused across different entities without remounting (e.g.
 * `RobotOptionsTab`'s `RobotOptionsPanel`, `CompanyOptionsSection`'s own `prefix`), so switching
 * to a different robot/company doesn't carry over which accordions were left open on the last one.
 */
export function useAccordionOpenState(defaultOpenId: string | null, resetKey?: string): UseAccordionOpenStateResult {
  const makeDefault = useCallback(
    (): Record<string, boolean> => (defaultOpenId ? { [defaultOpenId]: true } : {}),
    [defaultOpenId],
  );
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(makeDefault);

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
  const setOpen = useCallback((id: string, open: boolean) => {
    setOpenIds((prev) => ({ ...prev, [id]: open }));
  }, []);

  return { isOpen, setOpen };
}
