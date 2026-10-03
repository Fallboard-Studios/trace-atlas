import { memo, useMemo } from 'react';

import { DualLabel } from './DualLabel';
import { Toggle } from './Toggle';
import { ToggleFacade } from './ToggleFacade';
import type { ToggleSchema } from '@/types/controls';
import { labels, optionsRecord } from '@/content';
import './TempoSyncToggle.css';

interface TempoSyncToggleProps {
  /** The id of the slider this toggle belongs to (e.g. `lfoBank.a.rate`); the toggle's own id derives from it. */
  schemaId: string;
  /** True when anchored (Sync). The caller validates a stored `sync` before passing this. */
  synced: boolean;
  /** The caller's store action performs the Free <-> Sync conversion (spec §1.5). */
  onChange: (synced: boolean) => void;
  disabled?: boolean;
}

/** The toggle's OWN label — what the control is: { Anchoring over Tempo Sync }. */
const TOGGLE_LABELS = labels('ui.tempoSync');
/** The two modes' label pairs — the toggle's CONTENT: { Float over Free } and { Anchored over Sync }. */
const MODE_OPTIONS = optionsRecord('ui.tempoSync');

const FREE_CONTENT = <DualLabel loreLabel={MODE_OPTIONS.free.loreLabel} humanLabel={MODE_OPTIONS.free.humanLabel} />;
const SYNC_CONTENT = <DualLabel loreLabel={MODE_OPTIONS.sync.loreLabel} humanLabel={MODE_OPTIONS.sync.humanLabel} />;

/**
 * The Free | Sync (Float | Anchored) switch for a tempo-syncable control (docs/specs/FREE_SYNC_TOGGLE.md
 * §1.4). Stateless and tempo-free. It carries two different label pairs:
 *  - its own label, { human: 'Tempo Sync', lore: 'Anchoring' }, shown beside the box (and, as the human
 *    word, the switch's accessible name — the same in both states, which is aria-checked's job);
 *  - its content, the CURRENT MODE's pair: { 'Free', 'Float' } when Free, { 'Sync', 'Anchored' } when
 *    synced. ToggleFacade holds both at the larger's size, so flipping never resizes the box.
 *
 * Its own file so the slider (and any future tempo-syncable control) can place it; TempoSyncSlider puts
 * it in a row under the slider. The wrapper sizes it to its content, whatever flex row it lands in
 * (TempoSyncToggle.css).
 */
function TempoSyncToggleInner({ schemaId, synced, onChange, disabled }: TempoSyncToggleProps) {
  const schema: ToggleSchema = useMemo(() => ({ id: `${schemaId}.mode`, type: 'toggle', ...TOGGLE_LABELS }), [schemaId]);
  return (
    <div className="sc-tempo-sync-toggle">
      {/* Toggle suppresses its own label when it has facade content (the facade carries it), so the
          toggle's label is rendered here: the box's content is the mode, this is what the box IS. */}
      <DualLabel loreLabel={TOGGLE_LABELS.loreLabel} humanLabel={TOGGLE_LABELS.humanLabel} />
      <Toggle schema={schema} value={synced} onChange={onChange} disabled={disabled}>
        <ToggleFacade value={synced} off={FREE_CONTENT} on={SYNC_CONTENT} />
      </Toggle>
    </div>
  );
}

export const TempoSyncToggle = memo(TempoSyncToggleInner);
