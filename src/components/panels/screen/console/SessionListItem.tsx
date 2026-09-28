import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from '@/components/ui/controls/Button';
import { applySessionPayload } from '@/utils/sessionDiff';
import { deleteNamedSession } from '@/utils/sessionStorageEngine';
import { useSessionStore } from '@/stores/sessionStore';
import type { SessionEntry } from '@/types/session';
import { LOAD_SESSION_SCHEMA, DELETE_SESSION_SCHEMA } from '@/data/sessionConfig';

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
 */
export function SessionListItem({ entry, onChange }: SessionListItemProps) {
  const setCurrentLoadedSessionName = useSessionStore((s) => s.setCurrentLoadedSessionName);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const label = entry.name;

  const handleLoad = () => {
    applySessionPayload(entry.payload);
    setCurrentLoadedSessionName(entry.name);
  };

  const handleConfirmDelete = () => {
    deleteNamedSession(entry.name);
    setConfirmOpen(false);
    onChange?.();
  };

  const loadSchema = { ...LOAD_SESSION_SCHEMA, humanLabel: `${LOAD_SESSION_SCHEMA.humanLabel} ${label}` };
  const deleteSchema = { ...DELETE_SESSION_SCHEMA, humanLabel: `${DELETE_SESSION_SCHEMA.humanLabel} ${label}` };

  return (
    <div className="session-list-item">
      <span className="session-list-item__label">{label}</span>
      <Button schema={loadSchema} onClick={handleLoad} />
      <Button schema={deleteSchema} onClick={() => setConfirmOpen(true)} />

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="session-delete-confirm__overlay" />
          <AlertDialog.Content className="session-delete-confirm__content">
            <AlertDialog.Title className="session-delete-confirm__title">Delete {label}?</AlertDialog.Title>
            <AlertDialog.Description className="session-delete-confirm__description">
              This can&apos;t be undone.
            </AlertDialog.Description>
            <div className="session-delete-confirm__actions">
              <AlertDialog.Cancel className="session-delete-confirm__cancel">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action className="session-delete-confirm__confirm" onClick={handleConfirmDelete}>
                Delete
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

export default SessionListItem;
