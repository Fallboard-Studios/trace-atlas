import { useCallback, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { ATTENUATION_STYLE_SCHEMA, COORDS_SCHEMA } from './transmissionEditorSchemas';
import { TextInput } from '@/components/ui/controls/TextInput';
import { CoordsInput, type CoordsValue } from '@/components/ui/controls/CoordsInput';
import { Button } from '@/components/ui/controls/Button';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { deepEqual } from '@/utils/math';
import { randomCoordinate } from '@/utils/seedUtils';
import { labels } from '@/content';
import type { ButtonSchema } from '@/types/controls';

/** Scan, muted — flat, like the theme row and the list; only the aspect rows pop (Crawford's note 5). In the editor's
 *  title row since docs/specs/OFF_SCREEN_CONSOLE.md §1.2, where it rode on New Transmission's row before. */
const SCAN_SCHEMA: ButtonSchema = { id: 'offScan', type: 'button', ...labels('home.off.scan'), appearance: 'muted' };
const TITLE = labels('home.off.newTransmission').humanLabel;

/** A world's seed and plot: what the editor holds a draft of. */
export interface EditorIdentity {
  attenuationStyleName: string;
  coordinates: { x: number; y: number };
}

/** What the inputs hold: an identity whose coordinate fields may be blank (null). */
type Draft = Omit<EditorIdentity, 'coordinates'> & { coordinates: CoordsValue };

interface TransmissionEditorProps {
  /** The live world's seed and plot, or the waiting change's while one waits. */
  identity: EditorIdentity;
  /** Is New Transmission the shown pick? The group then wears the list row's selected state. */
  selected: boolean;
  /** A draft that differs from the identity it was synced to, committed: the caller picks it as New Transmission. */
  onCommit: (identity: EditorIdentity) => void;
  onScan: () => void;
}

/**
 * The New Transmission editor (docs/specs/OFF_SCREEN_CONSOLE.md §1.2): a group titled New Transmission with Scan in its
 * title row, then the style name and the coordinates. The inputs hold a draft of `identity`, synced Foundry's way
 * (the last-seen value compared during render, no effect), so a world landing from elsewhere — a
 * pick, a restore, a Scan — shows in them, unless the listener is mid-edit: a draft that differs from the last synced
 * identity is never overwritten. The identity is compared by value: the screen builds it afresh each render.
 *
 * A commit is Enter in any input, or a blur out of the group (caught on the group: TextInput takes no key or blur
 * props, and both events bubble). One whose draft equals the last synced identity is dropped here; any other is handed
 * to `onCommit`, and the draft becomes the baseline, so the next identity lands. A coordinate field left blank is drawn
 * with `randomCoordinate()` on the commit, and the drawn value shows in its field (found at the plan's "editor"
 * checkpoint: a field may be emptied, so a sign flip is easy). Scan is the caller's draw; it drops a mid-edit draft
 * first, so the drawn world lands in the inputs.
 */
export function TransmissionEditor({ identity, selected, onCommit, onScan }: TransmissionEditorProps) {
  const [draft, setDraft] = useState<Draft>(identity);
  const [synced, setSynced] = useState(identity);
  if (!deepEqual(identity, synced)) {
    setSynced(identity);
    if (deepEqual(draft, synced)) setDraft(identity);
  }

  // Stable, so the memoized inputs re-render only on their own value.
  const onName = useCallback((attenuationStyleName: string) => setDraft((d) => ({ ...d, attenuationStyleName })), []);
  const onCoords = useCallback((coordinates: CoordsValue) => setDraft((d) => ({ ...d, coordinates })), []);

  const commit = () => {
    if (deepEqual(draft, synced)) return;
    const { x, y } = draft.coordinates;
    const committed = { ...draft, coordinates: { x: x ?? randomCoordinate(), y: y ?? randomCoordinate() } };
    setDraft(committed);
    // A draw that lands back on the identity is no change.
    if (deepEqual(committed, synced)) return;
    setSynced(committed);
    onCommit(committed);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) commit();
  };
  // Focus moving between the group's own inputs, or onto Scan, is no commit.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) commit();
  };
  const scan = () => {
    setDraft(synced);
    onScan();
  };

  return (
    <div
      className="transmission-editor"
      role="group"
      aria-label={TITLE}
      data-selected={selected || undefined}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <div className="transmission-editor__title">
        <DualLabel humanLabel={TITLE} />
        <Button schema={SCAN_SCHEMA} face="single" onClick={scan} />
      </div>
      {/* The three fields in one panel (Crawford, docs/tasks/OFF_SCREEN_CONSOLE.md Checkpoint A): one static facade, the
          kind TextInput draws for itself, around the style name and the coordinates, which draw none of their own. One
          row where the panel has room for all three, else the coordinates under the name (OffScreen.css). */}
      <div className="transmission-editor__panel">
        <CabinetBox popped skipMountAnimation autoHeight timelineKey="cabinet-transmission-editor-panel">
          <div className="transmission-editor__fields">
            <TextInput schema={ATTENUATION_STYLE_SCHEMA} value={draft.attenuationStyleName} onChange={onName} facade={false} />
            <CoordsInput schema={COORDS_SCHEMA} value={draft.coordinates} onChange={onCoords} facade={false} />
          </div>
        </CabinetBox>
      </div>
    </div>
  );
}
