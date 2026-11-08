import { useCallback, useState } from 'react';
import { ATTENUATION_STYLE_SCHEMA, COORDS_SCHEMA } from './transmissionEditorSchemas';
import { TextInput } from '@/components/ui/controls/TextInput';
import { CoordsInput } from '@/components/ui/controls/CoordsInput';
import { Button } from '@/components/ui/controls/Button';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { deepEqual } from '@/utils/math';
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

interface TransmissionEditorProps {
  /** The live world's seed and plot, or the waiting change's while one waits. */
  identity: EditorIdentity;
  /** Is New Transmission the shown pick? The group then wears the list row's selected state. */
  selected: boolean;
  onScan: () => void;
}

/**
 * The New Transmission editor (docs/specs/OFF_SCREEN_CONSOLE.md §1.2): a group titled New Transmission with Scan in its
 * title row, then the style name and the coordinates. The inputs hold a draft of `identity`, synced Foundry's way
 * (SectorSettingsDrawer: the last-seen value compared during render, no effect), so a world landing from elsewhere — a
 * pick, a restore, a Scan — shows in them. The identity is compared by value: the screen builds it afresh each render.
 * Scan is the caller's: it draws and picks the drawn world, which then arrives here as `identity`.
 */
export function TransmissionEditor({ identity, selected, onScan }: TransmissionEditorProps) {
  const [draft, setDraft] = useState(identity);
  const [synced, setSynced] = useState(identity);
  if (!deepEqual(identity, synced)) {
    setSynced(identity);
    setDraft(identity);
  }

  // Stable, so the memoized inputs re-render only on their own value.
  const onName = useCallback((attenuationStyleName: string) => setDraft((d) => ({ ...d, attenuationStyleName })), []);
  const onCoords = useCallback((coordinates: { x: number; y: number }) => setDraft((d) => ({ ...d, coordinates })), []);

  return (
    <div className="transmission-editor" role="group" aria-label={TITLE} data-selected={selected || undefined}>
      <div className="transmission-editor__title">
        <DualLabel humanLabel={TITLE} />
        <Button schema={SCAN_SCHEMA} face="single" onClick={onScan} />
      </div>
      <TextInput schema={ATTENUATION_STYLE_SCHEMA} value={draft.attenuationStyleName} onChange={onName} />
      <CoordsInput schema={COORDS_SCHEMA} value={draft.coordinates} onChange={onCoords} />
    </div>
  );
}
