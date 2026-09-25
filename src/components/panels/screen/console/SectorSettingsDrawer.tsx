import { useState } from 'react';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { retransmitWorld, type RetransmitInput } from '@/systems/worldTransition';
import { generateRandomAttenuationStyleName, randomCoordinate } from '@/utils/seedUtils';
import { TextInput } from '@/components/ui/controls/TextInput';
import { CoordsInput } from '@/components/ui/controls/CoordsInput';
import { Button } from '@/components/ui/controls/Button';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import {
  ATTENUATION_STYLE_SCHEMA,
  COORDS_SCHEMA,
  RETRANSMIT_SCHEMA,
  STATUS_HEADER_SCHEMA,
  ATTENUATION_STYLE_PRESETS,
  COORDINATE_PRESETS,
} from '@/data/sectorSettingsConfig';
import { getTraitColorStyle } from '@/utils/traitColors';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import type { ButtonSchema } from '@/types/controls';
import './SectorSettingsDrawer.css';

/** Ref callback registering/clearing a nav scroll anchor (src/utils/sectionRefs.ts) — matches
 *  navTreeConfig.ts's own settings.sectorSettings.attenuationStyle/coordinates tree node ids
 *  (Settings -> Presets' own 3rd tree level). */
function sectionAnchorRef(id: string) {
  return (el: HTMLDivElement | null) => {
    if (el) setSectionRef(id, el);
    else clearSectionRef(id);
  };
}

const RANDOM_ATTENUATION_STYLE_SCHEMA: ButtonSchema = { id: 'sectorSettings.randomPlanet', type: 'button', loreLabel: 'STOCHASTIC SEED [c]', humanLabel: 'Random' };
const RANDOM_COORDS_SCHEMA: ButtonSchema = { id: 'sectorSettings.randomCoords', type: 'button', loreLabel: 'STOCHASTIC VECTOR [c]', humanLabel: 'Random' };

function presetSchema(idSuffix: string, humanLabel: string, loreLabel: string): ButtonSchema {
  return { id: `sectorSettings.preset.${idSuffix}`, type: 'button', loreLabel, humanLabel };
}

/**
 * Sector Settings console panel — Attenuation Style (reseed the Attenuation
 * Style) and Plot Tuning (jump to new locale coordinates), sharing one
 * Retransmit action. Preset buttons only populate their own field(s); they
 * never submit on their own — the user still presses Retransmit separately,
 * per docs/specs/SECTOR_SETTINGS.md §5.
 */
export function SectorSettingsDrawer() {
  const currentAttenuationStyle = useAttenuationStyleStore(selectCurrentAttenuationStyle);
  const currentLocaleId = currentAttenuationStyle?.currentLocaleId;
  // .coordinates specifically, not the whole locale object (bugfix, found live — same class as
  // isRobotAudible.ts's own fix): coordinates is the only field this component ever reads off the
  // locale, but selecting the whole object meant a fresh reference — and a re-render here — on
  // every unrelated robot write anywhere in the locale (audioSwells.ts's 16n ticks included),
  // since updateRobot (localeStore.ts) rebuilds the locale object every time it changes `robots`.
  // .coordinates itself keeps its own reference across those writes (updateRobot only ever spreads
  // it through, untouched), so narrowing to it directly lets this component skip re-rendering for
  // all of that ambient churn and re-render only when coordinates actually change.
  const coordinates = useLocaleStore((s) => (currentLocaleId ? s.locales[currentLocaleId]?.coordinates : undefined));

  const [attenuationStyleNameDraft, setAttenuationStyleNameDraft] = useState(currentAttenuationStyle?.name ?? '');
  const [coordsDraft, setCoordsDraft] = useState(coordinates ?? { x: 0, y: 0 });

  // Reset the drafts when the store's "current" values actually change (e.g.
  // right after a retransmit resolves) — done during render, comparing
  // against the last-seen value, rather than via a useEffect (React's
  // recommended pattern for "adjust state when a prop/store value changes";
  // an effect here would cause an extra, avoidable render pass).
  const [lastSeenAttenuationStyleName, setLastSeenAttenuationStyleName] = useState(currentAttenuationStyle?.name);
  if (currentAttenuationStyle?.name !== lastSeenAttenuationStyleName) {
    setLastSeenAttenuationStyleName(currentAttenuationStyle?.name);
    setAttenuationStyleNameDraft(currentAttenuationStyle?.name ?? '');
  }

  const [lastSeenCoords, setLastSeenCoords] = useState(coordinates);
  if (coordinates && coordinates !== lastSeenCoords) {
    setLastSeenCoords(coordinates);
    setCoordsDraft(coordinates);
  }

  function handleRetransmit() {
    const input: RetransmitInput = {};
    if (attenuationStyleNameDraft !== (currentAttenuationStyle?.name ?? '')) {
      input.attenuationStyleName = attenuationStyleNameDraft;
    }
    if (coordinates && (coordsDraft.x !== coordinates.x || coordsDraft.y !== coordinates.y)) {
      input.coordinates = coordsDraft;
    }
    retransmitWorld(input);
  }

  return (
    <div className="sector-settings-drawer" style={getTraitColorStyle('seed')}>
      <div className="sector-settings-drawer__status">
        <DualLabel loreLabel={STATUS_HEADER_SCHEMA.loreLabel} humanLabel={STATUS_HEADER_SCHEMA.humanLabel} />
        <div className="sector-settings-drawer__status-line">
          {currentAttenuationStyle?.name ?? '—'} · ({coordinates?.x ?? '—'}, {coordinates?.y ?? '—'})
        </div>
      </div>

      <div className="sector-settings-drawer__section" ref={sectionAnchorRef('settings.sectorSettings.attenuationStyle')}>
        <TextInput schema={ATTENUATION_STYLE_SCHEMA} value={attenuationStyleNameDraft} onChange={setAttenuationStyleNameDraft} />
        <div className="sector-settings-drawer__presets">
          {ATTENUATION_STYLE_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              schema={presetSchema(`planet.${preset.label}`, preset.label, 'ATTENUATION PRESET [c]')}
              onClick={() => setAttenuationStyleNameDraft(preset.value)}
            />
          ))}
          <Button schema={RANDOM_ATTENUATION_STYLE_SCHEMA} onClick={() => setAttenuationStyleNameDraft(generateRandomAttenuationStyleName())} />
        </div>
      </div>

      <div className="sector-settings-drawer__section" ref={sectionAnchorRef('settings.sectorSettings.coordinates')}>
        <CoordsInput schema={COORDS_SCHEMA} value={coordsDraft} onChange={setCoordsDraft} />
        <div className="sector-settings-drawer__presets">
          {COORDINATE_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              schema={presetSchema(`coords.${preset.label}`, preset.label, 'PLOT PRESET [c]')}
              onClick={() => setCoordsDraft(preset.value)}
            />
          ))}
          <Button
            schema={RANDOM_COORDS_SCHEMA}
            onClick={() => setCoordsDraft({ x: randomCoordinate(), y: randomCoordinate() })}
          />
        </div>
      </div>

      <div className="sector-settings-drawer__retransmit">
        <Button schema={RETRANSMIT_SCHEMA} onClick={handleRetransmit} />
      </div>
    </div>
  );
}

export default SectorSettingsDrawer;
