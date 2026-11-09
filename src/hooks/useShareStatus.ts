import { useState, useRef, useEffect } from 'react';
import { copySessionLink } from '@/utils/sessionShareUtils';
import type { SessionPayload } from '@/types/session';

const SHARE_STATUS_DISMISS_MS = 5000;

export type ShareStatus = 'copied' | 'error' | null;

/** The "click Share -> copy a link -> show a 5-second auto-dismissing status note" behavior
 *  behind the off screen's Share (OffScreen.tsx). Extracted after code review found the Save & Share tab's two
 *  Share buttons had copy-pasted this logic verbatim (docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md); moved here from
 *  the console folder when that tab went (docs/tasks/OFF_SCREEN_CONSOLE.md Task 15). */
export function useShareStatus() {
  const [shareStatus, setShareStatus] = useState<ShareStatus>(null);
  const dismissTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(dismissTimeoutRef.current), []);

  const share = async (payload: SessionPayload) => {
    const ok = await copySessionLink(payload);
    setShareStatus(ok ? 'copied' : 'error');
    window.clearTimeout(dismissTimeoutRef.current);
    dismissTimeoutRef.current = window.setTimeout(() => setShareStatus(null), SHARE_STATUS_DISMISS_MS);
  };

  return { shareStatus, share };
}
