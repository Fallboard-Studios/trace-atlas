import { useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { SessionListItem } from './SessionListItem';
import { useShareStatus } from './useShareStatus';
import { TextInput } from '@/components/ui/controls/TextInput';
import { Button } from '@/components/ui/controls/Button';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { useSessionStore } from '@/stores/sessionStore';
import { buildSessionPayload } from '@/utils/sessionDiff';
import { saveNamedSession, listSessions } from '@/utils/sessionStorageEngine';
import { SESSION_NAME_INPUT_SCHEMA, SAVE_SESSION_SCHEMA, SHARE_LIVE_SCHEMA, CLEAR_STORAGE_SCHEMA } from '@/data/sessionConfig';
import { formatSessionTimestamp, getScreenViewportDomNode } from '@/utils/helpers';
import type { SessionEntry } from '@/types/session';

import { CONTENT, fill, labels } from '@/content';
import './SessionsPanel.css';

/** The two label rows over the list and the reset (the sketch's STORED TRACES and FACTORY RESET). */
const SAVED_LABELS = labels('session.saved');
const RESET_LABELS = labels('session.clearStorage');

/**
 * The "Load Sessions" panel (docs/specs/SESSION_AUTOSAVE_REMOVAL.md §4.5): a required Session Name
 * input (bound to sessionStore.currentSessionName, prefilled by that store with a generated
 * suggestion) and a Save Session button above the list of every saved entry. listSessions() is a
 * plain localStorage read, not a reactive store — this component keeps its own local copy and
 * re-reads it after any save/delete rather than subscribing to anything.
 */
export function SessionsPanel() {
  const currentSessionName = useSessionStore((s) => s.currentSessionName);
  const setCurrentSessionName = useSessionStore((s) => s.setCurrentSessionName);
  const [sessions, setSessions] = useState<SessionEntry[]>(() => listSessions());
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ name: string; success: true; savedAt: string } | { name: string; success: false } | null>(
    null,
  );
  const { shareStatus, share } = useShareStatus();

  // A modal Radix dialog gives focus back only to its own Trigger, and the reset button is not one, so
  // the button that opened it is kept and focused again on close (SessionListItem does the same).
  const openerRef = useRef<HTMLElement | null>(null);
  const openClearConfirm = () => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setClearConfirmOpen(true);
  };
  const returnFocus = () => openerRef.current?.focus();

  const refresh = () => {
    setSessions(listSessions());
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

  // Shares the CURRENT LIVE state (buildSessionPayload()), never listSessions()/local storage --
  // the inverse of SessionListItem.tsx's own per-row Share, which shares that row's stored
  // payload instead (docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md §4.5).
  const handleShare = () => share(buildSessionPayload());

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

  // Newest first — the row a user just saved stays at the top.
  const sorted = [...sessions].sort((a, b) => b.savedAt - a.savedAt);

  // Into the screen, never <body> (the UI Shell guardrail; HelpPopover's way, Task 12); in place when
  // there is no screen (a component test).
  const screenNode = clearConfirmOpen ? getScreenViewportDomNode() : null;
  const clearConfirm = (
    <>
      <AlertDialog.Overlay className="clear-storage-confirm__overlay" />
      <AlertDialog.Content className="clear-storage-confirm__content" onCloseAutoFocus={returnFocus}>
        <AlertDialog.Title className="clear-storage-confirm__title">
          {CONTENT['session.clearStorage.confirmTitle'].human}
        </AlertDialog.Title>
        <AlertDialog.Description className="clear-storage-confirm__description">
          {CONTENT['session.clearStorage.confirmBody'].human}
        </AlertDialog.Description>
        <div className="clear-storage-confirm__actions">
          <AlertDialog.Cancel className="clear-storage-confirm__cancel">{CONTENT['ui.cancel'].human}</AlertDialog.Cancel>
          <AlertDialog.Action className="clear-storage-confirm__confirm" onClick={handleConfirmClearStorage}>
            {CONTENT['session.clearStorage'].human}
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </>
  );

  // The sketch's Save & Share (docs/tasks/LAYOUT_REWORK.md Task 17 follow-up, Crawford 2026-10-10): the
  // name, Save Session and Share live in one row; a Saved Sessions label over the list; a Factory Reset
  // label over the full-width reset. Every button has the single-line face; the lore is on the label rows.
  return (
    <div className="sessions-panel">
      <div className="sessions-panel__save">
        <div className="sessions-panel__save-row">
          <TextInput schema={SESSION_NAME_INPUT_SCHEMA} value={currentSessionName} onChange={setCurrentSessionName} />
          <Button schema={SAVE_SESSION_SCHEMA} face="single" onClick={handleSave} disabled={nameIsBlank} />
          <Button schema={SHARE_LIVE_SCHEMA} face="single" onClick={handleShare} />
        </div>
        {saveStatus &&
          (saveStatus.success ? (
            <span className="sessions-panel__save-status" role="status">
              {fill('session.status.saved', { name: saveStatus.name, time: saveStatus.savedAt })}
            </span>
          ) : (
            <span className="sessions-panel__save-status sessions-panel__save-status--error" role="alert">
              {fill('session.status.saveFailed', { name: saveStatus.name })}
            </span>
          ))}
        {shareStatus === 'copied' && (
          <span className="sessions-panel__share-status" role="status">
            {CONTENT['session.status.linkCopied'].human}
          </span>
        )}
        {shareStatus === 'error' && (
          <span className="sessions-panel__share-status sessions-panel__share-status--error" role="alert">
            {CONTENT['session.status.copyFailed'].human}
          </span>
        )}
      </div>
      {sorted.length > 0 && (
        <div className="sessions-panel__group sessions-panel__saved">
          <DualLabel loreLabel={SAVED_LABELS.loreLabel} humanLabel={SAVED_LABELS.humanLabel} />
          <div className="sessions-panel__list">
            {sorted.map((entry) => (
              <SessionListItem key={entry.name} entry={entry} onChange={refresh} />
            ))}
          </div>
        </div>
      )}

      <div className="sessions-panel__group sessions-panel__reset">
        <DualLabel loreLabel={RESET_LABELS.loreLabel} humanLabel={RESET_LABELS.humanLabel} />
        <Button schema={CLEAR_STORAGE_SCHEMA} face="single" onClick={openClearConfirm} />
      </div>

      <AlertDialog.Root open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        {screenNode ? <AlertDialog.Portal container={screenNode}>{clearConfirm}</AlertDialog.Portal> : clearConfirm}
      </AlertDialog.Root>
    </div>
  );
}

export default SessionsPanel;
