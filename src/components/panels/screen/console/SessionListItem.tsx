import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from '@/components/ui/controls/Button';
import { applySessionPayload, buildSessionPayload } from '@/utils/sessionDiff';
import { deleteNamedSession, saveNamedSession } from '@/utils/sessionStorageEngine';
import { useSessionStore } from '@/stores/sessionStore';
import { isAutosaveSlotName } from '@/types/session';
import type { SessionEntry } from '@/types/session';
import { LOAD_SESSION_SCHEMA, DELETE_SESSION_SCHEMA, UPDATE_SESSION_SCHEMA } from '@/data/sessionConfig';

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
 * pattern CompanyCrudControls.tsx's own delete confirmation already establishes. Once a named
 * entry becomes the currently-loaded session (sessionStore.currentLoadedSessionName), its Load
 * button turns into Update, which overwrites that same entry with the live state instead of
 * reloading it. An autosave-slot entry (any of the 6 ids isAutosaveSlotName recognizes) shows its
 * own world identity ("AttenuationStyle @ (x, y)", suffixed "(Autosaved Session)") and Load
 * only — never Update or Delete: loading an autosave slot never sets currentLoadedSessionName,
 * and deleting one isn't a supported action (spec's out-of-scope list: the 6 slots are
 * self-managing by construction).
 */
export function SessionListItem({ entry, onChange }: SessionListItemProps) {
  const currentLoadedSessionName = useSessionStore((s) => s.currentLoadedSessionName);
  const isAutosave = isAutosaveSlotName(entry.name);
  // Loading an autosave slot always clears currentLoadedSessionName to null (handleLoad below),
  // so it can never equal an autosave slot's own raw id — !isAutosave here is belt-and-suspenders
  // documentation of that invariant, not load-bearing on its own.
  const isCurrentlyLoaded = !isAutosave && entry.name === currentLoadedSessionName;
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Autosave slots have no user-given name to distinguish them by, and a generic "Unsaved
  // Session" label repeated across all 6 slots made them indistinguishable in the list — the
  // payload's own attenuationStyleName/coordinates identify which world each one is from instead.
  const label = isAutosave
    ? `${entry.payload.attenuationStyleName} @ (${entry.payload.coordinates.x}, ${entry.payload.coordinates.y})`
    : entry.name;

  const handleLoad = () => {
    applySessionPayload(entry.payload);
    useSessionStore.getState().setCurrentLoadedSessionName(isAutosave ? null : entry.name);
  };

  // Overwrites this same named entry with the current live state, rather than reloading it —
  // shown instead of Load once this row is the currently-loaded session (Crawford's request,
  // 2026-09-28), so a user who's kept tweaking after loading a save can persist those tweaks back
  // into it without retyping its name in the Save Session input above.
  const handleUpdate = () => {
    saveNamedSession(entry.name, buildSessionPayload());
    onChange?.();
  };

  const handleConfirmDelete = () => {
    deleteNamedSession(entry.name);
    setConfirmOpen(false);
    onChange?.();
  };

  const loadSchema = { ...LOAD_SESSION_SCHEMA, humanLabel: `${LOAD_SESSION_SCHEMA.humanLabel} ${label}` };
  const updateSchema = { ...UPDATE_SESSION_SCHEMA, humanLabel: `${UPDATE_SESSION_SCHEMA.humanLabel} ${label}` };
  const deleteSchema = { ...DELETE_SESSION_SCHEMA, humanLabel: `${DELETE_SESSION_SCHEMA.humanLabel} ${label}` };

  return (
    <div className="session-list-item">
      <span className="session-list-item__label">{label}{isAutosave && ' (Autosaved Session)'}</span>
      {isCurrentlyLoaded ? (
        <Button schema={updateSchema} onClick={handleUpdate} />
      ) : (
        <Button schema={loadSchema} onClick={handleLoad} />
      )}

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
