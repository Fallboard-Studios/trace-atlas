import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { SessionListItem } from './SessionListItem';
import { TextInput } from '@/components/ui/controls/TextInput';
import { Button } from '@/components/ui/controls/Button';
import { useSessionStore } from '@/stores/sessionStore';
import { buildSessionPayload } from '@/utils/sessionDiff';
import { saveNamedSession, listSessions, listUnsavedLastAutosaves } from '@/utils/sessionStorageEngine';
import { SESSION_NAME_INPUT_SCHEMA, SAVE_SESSION_SCHEMA, CLEAR_STORAGE_SCHEMA } from '@/data/sessionConfig';
import { LAST_UNSAVED_SESSION_KEY } from '@/types/session';
import { formatSessionTimestamp } from '@/utils/helpers';
import type { SessionEntry } from '@/types/session';

import './SessionsPanel.css';

/**
 * The "Load Sessions" panel (docs/specs/SESSION_STORAGE.md §4.5): a required Session Name input
 * (bound to sessionStore.currentSessionName, prefilled by that store with a generated
 * suggestion) and a Save Session button above the list of every saved/autosaved entry.
 * listSessions() is a plain localStorage read, not a reactive store — this component keeps its
 * own local copy and re-reads it after any save/delete rather than subscribing to anything.
 */
export function SessionsPanel() {
  const currentSessionName = useSessionStore((s) => s.currentSessionName);
  const setCurrentSessionName = useSessionStore((s) => s.setCurrentSessionName);
  const [sessions, setSessions] = useState<SessionEntry[]>(() => listSessions());
  const [unsavedHistory, setUnsavedHistory] = useState<SessionEntry[]>(() => listUnsavedLastAutosaves());
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ name: string; success: true; savedAt: string } | { name: string; success: false } | null>(
    null,
  );

  const refresh = () => {
    setSessions(listSessions());
    setUnsavedHistory(listUnsavedLastAutosaves());
  };

  const nameIsBlank = currentSessionName.trim().length === 0;

  const handleSave = () => {
    const name = currentSessionName.trim();
    try {
      saveNamedSession(name, buildSessionPayload());
      refresh();
      setSaveStatus({ name, success: true, savedAt: formatSessionTimestamp(Date.now()) });
    } catch (err) {
      console.error('[SessionsPanel] saveNamedSession failed', err);
      setSaveStatus({ name, success: false });
    }
  };

  // Wipes ALL of localStorage (Crawford's request, 2026-09-28) — not just the sessions key —
  // behind an AlertDialog confirm, the same pattern CompanyCrudControls.tsx's own delete
  // confirmation already establishes. Also drops currentLoadedSessionName back to null: once
  // storage is wiped, there's no longer a saved entry backing whatever it pointed at.
  const handleConfirmClearStorage = () => {
    localStorage.clear();
    useSessionStore.getState().setCurrentLoadedSessionName(null);
    setClearConfirmOpen(false);
    refresh();
  };

  // The single visible unsaved-history row is a summary of its own bucket, not one specific
  // entry -- its label/payload come from the newest of its up-to-3 autosaves (listUnsavedLastAutosaves
  // sorts newest-first already), while its own subrows (rendered by SessionListItem once loaded)
  // show all of them, including that same newest one again (docs/specs/SESSION_AUTOSAVE_HISTORY.md §7 item 4).
  const unsavedHistoryRow: SessionEntry | null = unsavedHistory.length > 0 ? { ...unsavedHistory[0], name: LAST_UNSAVED_SESSION_KEY } : null;

  // Newest first — the row a user just saved (or the most recent autosave) stays at the top.
  const sorted = [...sessions, ...(unsavedHistoryRow ? [unsavedHistoryRow] : [])].sort((a, b) => b.savedAt - a.savedAt);

  return (
    <div className="sessions-panel">
      <div className="sessions-panel__save">
        <TextInput schema={SESSION_NAME_INPUT_SCHEMA} value={currentSessionName} onChange={setCurrentSessionName} />
        <Button schema={SAVE_SESSION_SCHEMA} onClick={handleSave} disabled={nameIsBlank} />
        {saveStatus &&
          (saveStatus.success ? (
            <span className="sessions-panel__save-status" role="status">
              {`Saved ${saveStatus.name} at ${saveStatus.savedAt}`}
            </span>
          ) : (
            <span className="sessions-panel__save-status sessions-panel__save-status--error" role="alert">
              {`${saveStatus.name} failed to save.`}
            </span>
          ))}
      </div>
      <div className="sessions-panel__list">
        {sorted.map((entry) => (
          <SessionListItem key={entry.name} entry={entry} onChange={refresh} />
        ))}
      </div>

      <Button schema={CLEAR_STORAGE_SCHEMA} onClick={() => setClearConfirmOpen(true)} />

      <AlertDialog.Root open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="clear-storage-confirm__overlay" />
          <AlertDialog.Content className="clear-storage-confirm__content">
            <AlertDialog.Title className="clear-storage-confirm__title">
              Clear Local Storage?
            </AlertDialog.Title>
            <AlertDialog.Description className="clear-storage-confirm__description">
              Every saved and autosaved session is deleted. This can&apos;t be undone.
            </AlertDialog.Description>
            <div className="clear-storage-confirm__actions">
              <AlertDialog.Cancel className="clear-storage-confirm__cancel">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action className="clear-storage-confirm__confirm" onClick={handleConfirmClearStorage}>
                Clear Local Storage
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

export default SessionsPanel;
