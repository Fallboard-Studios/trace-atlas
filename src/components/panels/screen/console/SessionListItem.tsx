import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from '@/components/ui/controls/Button';
import { applySessionPayload } from '@/utils/sessionDiff';
import { deleteNamedSession, deleteUnsavedHistory, listNamedSessionAutosaves, listUnsavedLastAutosaves } from '@/utils/sessionStorageEngine';
import { useSessionStore } from '@/stores/sessionStore';
import { LAST_UNSAVED_SESSION_KEY } from '@/types/session';
import type { SessionEntry } from '@/types/session';
import { formatSessionTimestamp } from '@/utils/helpers';
import { LOAD_SESSION_SCHEMA, DELETE_SESSION_SCHEMA } from '@/data/sessionConfig';

import './SessionListItem.css';

interface SessionListItemProps {
  entry: SessionEntry;
  /** Renders the indented-row CSS modifier and skips the Delete affordance/own subrow drill-down —
   *  a subrow's own lifecycle is entirely FIFO-managed (docs/specs/SESSION_AUTOSAVE_HISTORY.md §3
   *  "never exceed 3", §7 item 2 "no per-subrow delete"), not individually deletable, and never
   *  nests a further level of history under itself. */
  indented?: boolean;
  /** Called after a confirmed delete, so the parent (SessionsPanel) can refresh its own list —
   *  listSessions()/listNamedSessionAutosaves()/listUnsavedLastAutosaves() are plain localStorage
   *  reads, not reactive store subscriptions. */
  onChange?: () => void;
}

/**
 * One row in the "Load Sessions" list (docs/specs/SESSION_AUTOSAVE_HISTORY.md §4.5). Reused
 * recursively for indented autosave subrows rather than a separate component. `entry.name` is
 * either a real named session's own name, or the LAST_UNSAVED_SESSION_KEY sentinel for the single
 * visible unsaved-history row -- both a named session's own autosave subrows and the
 * unsaved-history row's own subrows carry their parent's identity in this same `name` field
 * (sessionStorageEngine.ts's saveNamedSessionAutosave/saveUnsavedAutosave), so "which session does
 * Load keep current" never needs a separate prop.
 *
 * Every row always shows Load -- the "Update" button that used to appear for the currently-loaded
 * named session was reverted (docs/specs/SESSION_AUTOSAVE_HISTORY.md §1): Load always reapplies
 * exactly what was last saved, never silently overwrites it. The currently-loaded named session's
 * label instead gains a "Primary Save" suffix, and -- only while currently loaded -- renders its
 * own up-to-3 autosave subrows beneath it. Loading a subrow keeps its parent "current" (a
 * deliberate reversal of this component's own prior behavior, where loading any autosave slot
 * unconditionally cleared currentLoadedSessionName).
 */
export function SessionListItem({ entry, indented = false, onChange }: SessionListItemProps) {
  const currentLoadedSessionName = useSessionStore((s) => s.currentLoadedSessionName);
  const viewingUnsavedHistory = useSessionStore((s) => s.viewingUnsavedHistory);
  const setCurrentLoadedSessionName = useSessionStore((s) => s.setCurrentLoadedSessionName);
  const setViewingUnsavedHistory = useSessionStore((s) => s.setViewingUnsavedHistory);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isUnsavedRow = entry.name === LAST_UNSAVED_SESSION_KEY;
  const isCurrentlyLoaded = isUnsavedRow ? viewingUnsavedHistory : entry.name === currentLoadedSessionName;

  // An indented subrow always shows its own timestamp, regardless of whether its parent is a
  // named session or the unsaved-history row. A top-level unsaved-history row shows the world
  // identity its newest entry carries (unchanged from the pre-restructure autosave-slot label) --
  // not a timestamp, since it's a summary of its own bucket, not one specific entry. A top-level
  // named row shows its own name, with "Primary Save" appended only while currently loaded.
  const label = indented
    ? `Autosave from ${formatSessionTimestamp(entry.savedAt)}`
    : isUnsavedRow
      ? `${entry.payload.attenuationStyleName} @ (${entry.payload.coordinates.x}, ${entry.payload.coordinates.y}) (Autosaved Session)`
      : isCurrentlyLoaded
        ? `${entry.name} Primary Save`
        : entry.name;

  const handleLoad = () => {
    applySessionPayload(entry.payload);
    if (isUnsavedRow) {
      setViewingUnsavedHistory(true);
    } else {
      setCurrentLoadedSessionName(entry.name);
    }
  };

  const handleConfirmDelete = () => {
    if (isUnsavedRow) {
      deleteUnsavedHistory();
    } else {
      deleteNamedSession(entry.name);
    }
    setConfirmOpen(false);
    onChange?.();
  };

  const loadSchema = { ...LOAD_SESSION_SCHEMA, humanLabel: `${LOAD_SESSION_SCHEMA.humanLabel} ${label}` };
  const deleteSchema = { ...DELETE_SESSION_SCHEMA, humanLabel: `${DELETE_SESSION_SCHEMA.humanLabel} ${label}` };

  const subrows = !indented && isCurrentlyLoaded ? (isUnsavedRow ? listUnsavedLastAutosaves() : listNamedSessionAutosaves(entry.name)) : [];

  return (
    <>
      <div className={indented ? 'session-list-item session-list-item--indented' : 'session-list-item'}>
        <span className="session-list-item__label">{label}</span>
        <Button schema={loadSchema} onClick={handleLoad} />

        {!indented && (
          <>
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
          </>
        )}
      </div>

      {subrows.map((subEntry, index) => (
        // index breaks ties when two autosaves land in the exact same millisecond (name+savedAt
        // alone can collide) — subrows is a fresh array on every render, so index stays stable
        // for a given entry across re-renders as long as its own storage-order position doesn't
        // change, which matches every other list in this codebase keyed off array position.
        <SessionListItem key={`${subEntry.name}-${subEntry.savedAt}-${index}`} entry={subEntry} indented />
      ))}
    </>
  );
}

export default SessionListItem;
