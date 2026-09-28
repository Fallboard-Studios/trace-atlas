import { useState } from 'react';
import { SessionListItem } from './SessionListItem';
import { TextInput } from '@/components/ui/controls/TextInput';
import { Button } from '@/components/ui/controls/Button';
import { useSessionStore } from '@/stores/sessionStore';
import { buildSessionPayload } from '@/utils/sessionDiff';
import { saveNamedSession, listSessions } from '@/utils/sessionStorageEngine';
import { SESSION_NAME_INPUT_SCHEMA, SAVE_SESSION_SCHEMA } from '@/data/sessionConfig';
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

  const refresh = () => setSessions(listSessions());

  const nameIsBlank = currentSessionName.trim().length === 0;

  const handleSave = () => {
    saveNamedSession(currentSessionName.trim(), buildSessionPayload());
    refresh();
  };

  // Newest first — the row a user just saved (or the most recent autosave) stays at the top.
  const sorted = [...sessions].sort((a, b) => b.savedAt - a.savedAt);

  return (
    <div className="sessions-panel">
      <div className="sessions-panel__save">
        <TextInput schema={SESSION_NAME_INPUT_SCHEMA} value={currentSessionName} onChange={setCurrentSessionName} />
        <Button schema={SAVE_SESSION_SCHEMA} onClick={handleSave} disabled={nameIsBlank} />
      </div>
      <div className="sessions-panel__list">
        {sorted.map((entry) => (
          <SessionListItem key={entry.name} entry={entry} onChange={refresh} />
        ))}
      </div>
    </div>
  );
}

export default SessionsPanel;
