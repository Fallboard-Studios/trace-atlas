import { useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useShareStatus } from './useShareStatus';
import { Button } from '@/components/ui/controls/Button';
import { applySessionPayload } from '@/utils/sessionDiff';
import { deleteNamedSession } from '@/utils/sessionStorageEngine';
import { useSessionStore } from '@/stores/sessionStore';
import type { SessionEntry } from '@/types/session';
import { formatSessionTimestamp, getScreenViewportDomNode } from '@/utils/helpers';
import { LOAD_SESSION_SCHEMA, SHARE_SESSION_SCHEMA, DELETE_SESSION_SCHEMA } from '@/data/sessionConfig';

import { CONTENT, fill } from '@/content';
import './SessionListItem.css';

interface SessionListItemProps {
  entry: SessionEntry;
  /** Called after a confirmed delete, so the parent (SessionsPanel) can refresh its own list --
   *  listSessions() is a plain localStorage read, not a reactive store subscription. */
  onChange?: () => void;
}

/**
 * One row in the "Load Sessions" list (docs/specs/SESSION_AUTOSAVE_REMOVAL.md §4.5). Every row
 * always shows Load, never "Update" -- Load always reapplies exactly what was last saved, never
 * silently overwrites it (overwrite-by-name is covered by SessionsPanel.tsx's Save Session box
 * instead). Plain manual CRUD only: no autosave history, no "Primary Save" label, no subrows.
 * Loading a row also updates the Session Name input (sessionStore.currentSessionName) to this
 * entry's name, so a re-save without retyping the name overwrites the just-loaded session rather
 * than creating a new entry under the input's previous (possibly unrelated) suggestion.
 */
export function SessionListItem({ entry, onChange }: SessionListItemProps) {
  const setCurrentLoadedSessionName = useSessionStore((s) => s.setCurrentLoadedSessionName);
  const setCurrentSessionName = useSessionStore((s) => s.setCurrentSessionName);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { shareStatus, share } = useShareStatus();

  const label = entry.name;

  const handleLoad = () => {
    applySessionPayload(entry.payload);
    setCurrentLoadedSessionName(entry.name);
    setCurrentSessionName(entry.name);
  };

  const handleShare = () => share(entry.payload);
  // A modal Radix dialog gives focus back only to its own Trigger, and the Delete button is not one, so
  // the button that opened it is kept and focused again on close (Task 5's nav sheet does the same).
  const openerRef = useRef<HTMLElement | null>(null);
  const openConfirm = () => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmOpen(true);
  };
  const returnFocus = () => openerRef.current?.focus();

  const handleConfirmDelete = () => {
    deleteNamedSession(entry.name);
    setConfirmOpen(false);
    onChange?.();
  };

  // Each button's face is its short name ("Load"); its accessible name carries the session, so the rows'
  // buttons stay apart for a screen reader (docs/tasks/LAYOUT_REWORK.md Task 17 follow-up — the name used
  // to be the face too, so every row repeated its session three times).
  const screenNode = confirmOpen ? getScreenViewportDomNode() : null;
  const confirm = (
    <>
      <AlertDialog.Overlay className="session-delete-confirm__overlay" />
      <AlertDialog.Content className="session-delete-confirm__content" onCloseAutoFocus={returnFocus}>
        <AlertDialog.Title className="session-delete-confirm__title">{fill('session.delete.confirmTitle', { session: label })}</AlertDialog.Title>
        <AlertDialog.Description className="session-delete-confirm__description">
          {CONTENT['session.delete.confirmBody'].human}
        </AlertDialog.Description>
        <div className="session-delete-confirm__actions">
          <AlertDialog.Cancel className="session-delete-confirm__cancel">{CONTENT['ui.cancel'].human}</AlertDialog.Cancel>
          <AlertDialog.Action className="session-delete-confirm__confirm" onClick={handleConfirmDelete}>
            {CONTENT['session.delete'].human}
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </>
  );

  return (
    <div className="session-list-item">
      {/* Name + timestamp form one title group that takes the row's flex share, so the timestamp sits
          beside the name rather than being pushed to the far end next to the buttons
          (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.6). */}
      <span className="session-list-item__title">
        <span className="session-list-item__label">{label}</span>
        <span className="session-list-item__saved-at">{formatSessionTimestamp(entry.savedAt)}</span>
      </span>
      {/* One group, so a narrow row wraps the three buttons under the title together. */}
      <span className="session-list-item__actions">
        <Button schema={LOAD_SESSION_SCHEMA} face="single" accessibleName={fill('session.load', { session: label })} onClick={handleLoad} />
        <Button schema={SHARE_SESSION_SCHEMA} face="single" accessibleName={fill('session.share', { session: label })} onClick={handleShare} />
        <Button schema={DELETE_SESSION_SCHEMA} face="single" accessibleName={fill('session.delete', { session: label })} onClick={openConfirm} />
      </span>
      {shareStatus === 'copied' && (
        <span className="session-list-item__share-status" role="status">
          {CONTENT['session.status.linkCopied'].human}
        </span>
      )}
      {shareStatus === 'error' && (
        <span className="session-list-item__share-status session-list-item__share-status--error" role="alert">
          {CONTENT['session.status.copyFailed'].human}
        </span>
      )}

      {/* Into the screen, never <body> (the UI Shell guardrail; HelpPopover's way, Task 12); in place
          when there is no screen (a component test). */}
      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        {screenNode ? <AlertDialog.Portal container={screenNode}>{confirm}</AlertDialog.Portal> : confirm}
      </AlertDialog.Root>
    </div>
  );
}

export default SessionListItem;
