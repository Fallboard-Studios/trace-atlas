import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useShareStatus } from './useShareStatus';
import { Button } from '@/components/ui/controls/Button';
import { applySessionPayload } from '@/utils/sessionDiff';
import { deleteNamedSession } from '@/utils/sessionStorageEngine';
import { useSessionStore } from '@/stores/sessionStore';
import type { SessionEntry } from '@/types/session';
import { formatSessionTimestamp } from '@/utils/helpers';
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

  const handleConfirmDelete = () => {
    deleteNamedSession(entry.name);
    setConfirmOpen(false);
    onChange?.();
  };

  const loadSchema = { ...LOAD_SESSION_SCHEMA, humanLabel: fill('session.load', { session: label }) };
  const shareSchema = { ...SHARE_SESSION_SCHEMA, humanLabel: fill('session.share', { session: label }) };
  const deleteSchema = { ...DELETE_SESSION_SCHEMA, humanLabel: fill('session.delete', { session: label }) };

  return (
    <div className="session-list-item">
      <span className="session-list-item__label">{label}</span>
      <span className="session-list-item__saved-at">{formatSessionTimestamp(entry.savedAt)}</span>
      <Button schema={loadSchema} onClick={handleLoad} />
      <Button schema={shareSchema} onClick={handleShare} />
      <Button schema={deleteSchema} onClick={() => setConfirmOpen(true)} />
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

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="session-delete-confirm__overlay" />
          <AlertDialog.Content className="session-delete-confirm__content">
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
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

export default SessionListItem;
