import { useCallback, useMemo, useState } from 'react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { TRANSMISSION_PRESETS } from '@/data/transmissionPresets';
import { applySessionPayload } from '@/utils/sessionDiff';
import { listSessions, loadSession } from '@/utils/sessionStorageEngine';
import { fill, labels } from '@/content';
import type { RadioButtonSchema } from '@/types/controls';
import type { SessionPayload } from '@/types/session';
import './OffScreen.css';

// ========================================
// CONSTANTS
// ========================================

// Option values carry their source, so a save named like a preset's id (or like its name) never
// collides with the preset.
const PRESET_PREFIX = 'preset:';
const SAVE_PREFIX = 'save:';

const LABEL = labels('home.off.label');
const POWER_HINT = labels('home.off.powerHint').humanLabel;
const TRANSMISSION = labels('home.off.transmission');
const READOUT_LABEL = labels('home.off.readout').humanLabel;

/** What the well names: the pick's display name and its Attenuation Style code. */
interface Pick {
  value: string;
  name: string;
  code: string;
}

/**
 * The powered-off screen (docs/specs/LAYOUT_REWORK.md §1.9; docs/tasks/LAYOUT_REWORK.md Task 27): the
 * etched label and the power hint over the dimmed, still world (WorldView stays mounted behind it —
 * ScreenViewport), and the Transmission row: the three presets, a divider, then the user's saves, as a
 * muted RadioButton (nothing comes off the plate while the power is off), with a well naming the pick.
 *
 * Picking retransmits the faint world through applySessionPayload, the same path a Load does, and never
 * touches AudioEngine: only the power switch starts sound (powerController). The saves are read once on
 * mount — nothing can add one while the power is off — and a save that has since vanished from storage
 * applies nothing and is not claimed as the pick. The Theme row is not built (the themes phase).
 */
export function OffScreen() {
  // Newest first, as SessionsPanel lists them.
  const [saves] = useState(() => listSessions().sort((a, b) => b.savedAt - a.savedAt));
  const [pick, setPick] = useState<Pick | null>(null);

  const schema = useMemo<RadioButtonSchema>(
    () => ({
      id: 'offTransmission',
      type: 'radio',
      ...TRANSMISSION,
      appearance: 'muted',
      options: [
        ...TRANSMISSION_PRESETS.map((preset) => ({
          value: PRESET_PREFIX + preset.id,
          humanLabel: labels(preset.nameKey).humanLabel,
        })),
        ...saves.map((save, i) => ({
          value: SAVE_PREFIX + save.name,
          humanLabel: save.name,
          dividerBefore: i === 0,
        })),
      ],
    }),
    [saves],
  );

  const onChange = useCallback((value: string) => {
    let name: string;
    let payload: SessionPayload | undefined;
    if (value.startsWith(PRESET_PREFIX)) {
      const preset = TRANSMISSION_PRESETS.find((p) => PRESET_PREFIX + p.id === value);
      name = preset ? labels(preset.nameKey).humanLabel : '';
      payload = preset?.payload;
    } else {
      name = value.slice(SAVE_PREFIX.length);
      payload = loadSession(name);
    }
    if (!payload) return;
    applySessionPayload(payload);
    setPick({ value, name, code: payload.attenuationStyleName });
  }, []);

  return (
    <div className="off-screen">
      <div className="off-screen__etch">
        <h2 className="off-screen__label">{LABEL.humanLabel}</h2>
        {LABEL.loreLabel && <p className="off-screen__lore">{LABEL.loreLabel}</p>}
        <p className="off-screen__hint">{POWER_HINT}</p>
      </div>
      <div className="off-screen__picker">
        <RadioButton schema={schema} value={pick?.value ?? ''} onChange={onChange} />
        <p className="off-screen__readout" role="status" aria-label={READOUT_LABEL} data-testid="off-screen-readout">
          {pick ? fill('home.off.readout', { name: pick.name, code: pick.code }) : ''}
        </p>
      </div>
    </div>
  );
}
