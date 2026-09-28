import { DEV_TUNING } from '../constants';

export function swallow(err: unknown, ctx?: string) {
  // Only log when DEV_TUNING is enabled in callers (keeps runtime cost minimal).
  // Callers should import DEV_TUNING if they want to gate logs locally.
  try {
    console.warn(`[swallow] ${ctx ?? 'ignored error'}`, err);
  } catch {
    // fall through
  }
}

/** Warn (e.g. on a caught/swallowed error) only when DEV_TUNING is enabled. */
export function devWarn(...args: unknown[]): void {
  if (DEV_TUNING) console.warn(...args);
}

/** "Sep 28, 2:14 PM" -- no year (autosave history is bounded to a handful of entries per
 *  bucket, so a multi-year-old entry surviving isn't a realistic case worth designing around).
 *  Shared by SessionsPanel.tsx's save-confirmation banner and every autosave-subrow label. */
export function formatSessionTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const SCREEN_VIEWPORT_ID = 'screen-viewport';

export function getScreenViewportDomNode(): HTMLElement | null {
  return document.getElementById(SCREEN_VIEWPORT_ID);
}