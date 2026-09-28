import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from '@/components/ui/controls/Button';
import { applySessionPayload } from '@/utils/sessionDiff';
import { deleteNamedSession } from '@/utils/sessionStorageEngine';
import { useSessionStore } from '@/stores/sessionStore';
import { isAutosaveSlotName } from '@/types/session';
import type { SessionEntry } from '@/types/session';
import { LOAD_SESSION_SCHEMA, DELETE_SESSION_SCHEMA } from '@/data/sessionConfig';

import './SessionListItem.css';

interface SessionListItemProps {
  entry: SessionEntry;
  /** Called after a confirmed delete, so the parent (SessionsPanel) can refresh its own list —
   *  listSessions() is a plain localStorage read, not a reactive store subscription. */
  onChange?: () => void;
}

/**
 * One row in the "Load Sessions" list (docs/specs/SESSION_STORAGE.md §4.5). A named entry shows
 * its own name, a Load button, and a Delete button behind an AlertDialog confirm — the exact
 * pattern CompanyCrudControls.tsx's own delete confirmation already establishes. An autosave-slot
 * entry (any of the 6 ids isAutosaveSlotName recognizes) shows a fixed "Unsaved Session" label
 * and Load only — deleting an autosave slot isn't a supported action (spec's out-of-scope list:
 * the 6 slots are self-managing by construction).
 */
export function SessionListItem({ entry, onChange }: SessionListItemProps) {
  const isAutosave = isAutosaveSlotName(entry.name);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const label = isAutosave ? 'Unsaved Session' : entry.name;

  const handleLoad = () => {
    applySessionPayload(entry.payload);
    useSessionStore.getState().setCurrentLoadedSessionName(isAutosave ? null : entry.name);
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

      {!isAutosave && (
        <>
          <Button schema={deleteSchema} onClick={() => setConfirmOpen(true)} />

          <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="session-delete-confirm__overlay" />
              <AlertDialog.Content className="session-delete-confirm__content">
                <AlertDialog.Title className="session-delete-confirm__title">
                  Delete {label}?
                </AlertDialog.Title>
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
        </>
      )}
    </div>
  );
}

export default SessionListItem;
