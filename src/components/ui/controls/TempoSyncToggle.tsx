import { memo, useMemo } from 'react';

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

const TOGGLE_LABELS = labels('ui.tempoSync');
const MODE_OPTIONS = optionsRecord('ui.tempoSync');

/** The word the facade shows for a mode: the lore word where there is one, else the human word. */
const modeWord = (mode: 'free' | 'sync'): string => MODE_OPTIONS[mode].loreLabel ?? MODE_OPTIONS[mode].humanLabel;
const FREE_WORD = modeWord('free');
const SYNC_WORD = modeWord('sync');

/**
 * The Free | Sync (Float | Anchored) switch for a tempo-syncable control (docs/specs/FREE_SYNC_TOGGLE.md
 * §1.4). Stateless and tempo-free: a `Toggle` whose facade is the current mode's lore word, held at the
 * size of the larger word (ToggleFacade) so flipping it never resizes it. The accessible name is the
 * stable "Tempo Sync" in both modes — the state is aria-checked.
 *
 * Its own file so a caller can place it anywhere: TempoSyncSlider puts it beside the slider by default,
 * and the LFO lane panel puts it in the Mutation Type row (TempoSyncSlider's `hideToggle`). The wrapper
 * sizes it to its content, whatever flex row it lands in (TempoSyncToggle.css).
 */
function TempoSyncToggleInner({ schemaId, synced, onChange, disabled }: TempoSyncToggleProps) {
  const schema: ToggleSchema = useMemo(() => ({ id: `${schemaId}.mode`, type: 'toggle', ...TOGGLE_LABELS }), [schemaId]);
  return (
    <div className="sc-tempo-sync-toggle">
      <Toggle schema={schema} value={synced} onChange={onChange} disabled={disabled}>
        <ToggleFacade value={synced} off={FREE_WORD} on={SYNC_WORD} />
      </Toggle>
    </div>
  );
}

export const TempoSyncToggle = memo(TempoSyncToggleInner);
