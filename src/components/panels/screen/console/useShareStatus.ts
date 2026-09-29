import { useState, useRef, useEffect } from 'react';
import { copySessionLink } from '@/utils/sessionShareUtils';
import type { SessionPayload } from '@/types/session';

const SHARE_STATUS_DISMISS_MS = 5000;

export type ShareStatus = 'copied' | 'error' | null;

/** The "click Share -> copy a link -> show a 5-second auto-dismissing status note" behavior
 *  shared by SessionListItem.tsx's per-row Share button and SessionsPanel.tsx's panel-level one
 *  (docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md). Extracted after code review found the two
 *  components had copy-pasted this logic verbatim. */
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
