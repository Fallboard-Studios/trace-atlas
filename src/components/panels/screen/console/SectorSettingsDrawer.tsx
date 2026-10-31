import { useState } from 'react';
import { useShareStatus } from './useShareStatus';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useLoadingStore } from '@/stores/loadingStore';
import { retransmitWorld, type RetransmitInput } from '@/systems/worldTransition';
import { requestWorldChange } from '@/systems/worldChange';
import { describeWorld } from '@/utils/describeWorld';
import { generateRandomAttenuationStyleName, randomCoordinate } from '@/utils/seedUtils';
import { TextInput } from '@/components/ui/controls/TextInput';
import { CoordsInput } from '@/components/ui/controls/CoordsInput';
import { Button } from '@/components/ui/controls/Button';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import {
  ATTENUATION_STYLE_SCHEMA,
  COORDS_SCHEMA,
  RETRANSMIT_SCHEMA,
  COPY_LINK_SCHEMA,
  STATUS_HEADER_SCHEMA,
} from '@/data/sectorSettingsConfig';
import { getTraitColorStyle } from '@/utils/traitColors';
import { buildSessionPayload } from '@/utils/sessionDiff';
import type { ButtonSchema } from '@/types/controls';
import { CONTENT, labels } from '@/content';
import './SectorSettingsDrawer.css';

const RANDOM_ATTENUATION_STYLE_SCHEMA: ButtonSchema = { id: 'sectorSettings.randomPlanet', type: 'button', ...labels('sector.random.attenuationStyle') };
const RANDOM_COORDS_SCHEMA: ButtonSchema = { id: 'sectorSettings.randomCoords', type: 'button', ...labels('sector.random.coords') };

/**
 * Sector Settings console panel — Attenuation Style (reseed the Attenuation
 * Style) and Plot Tuning (jump to new locale coordinates), sharing one
 * Retransmit action. The Random buttons only populate their own field; they
 * never submit on their own — the user still presses Retransmit separately,
 * per docs/specs/archive/SECTOR_SETTINGS.md §5. The curated shortcut rows that
 * sat beside them are gone (docs/specs/OFF_SCREEN.md assumption 13): a curated
 * world is a Transmission preset on the off screen now. The status line is
 * describeWorld(identity) (assumption 19; docs/tasks/OFF_SCREEN.md Task 33) —
 * the seed and the plot, then the theme and the picks when they are not
 * Classic — so it reads byte for byte as the off screen's Current row and
 * readout do.
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
  // The loaded world's loading, two narrow reads, for the status line (Task 33).
  const theme = useLoadingStore((s) => s.theme);
  const aspects = useLoadingStore((s) => s.aspects);
  const { shareStatus, share } = useShareStatus();

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
    // Nothing edited - an emptied name reads as none, as retransmitWorld reads it - is no world change: nothing waits,
    // and no wash fades over an unchanged world (found at the revisions plan's Checkpoint D).
    if (!input.attenuationStyleName && !input.coordinates) return;
    // A user-gesture world change: it waits under the scene wash (docs/tasks/OFF_SCREEN_REVISIONS.md Task 13).
    requestWorldChange(() => retransmitWorld(input));
  }

  return (
    <div className="sector-settings-drawer" style={getTraitColorStyle('seed')}>
      <div className="sector-settings-drawer__status">
        <DualLabel loreLabel={STATUS_HEADER_SCHEMA.loreLabel} humanLabel={STATUS_HEADER_SCHEMA.humanLabel} />
        <div className="sector-settings-drawer__status-line">
          {/* The stores hold a current world from module load on, so the dashes never show in the app. */}
          {currentAttenuationStyle && coordinates
            ? describeWorld({ attenuationStyleName: currentAttenuationStyle.name, coordinates, theme, aspects })
            : '— · (—, —)'}
        </div>
        {/* Copy link shares the LIVE world, like the Sessions panel's Share live, which stays
            (docs/specs/SHORT_WORLD_LINK.md assumption 9): one encoder behind both buttons. */}
        <div className="sector-settings-drawer__copy-link">
          <Button schema={COPY_LINK_SCHEMA} face="single" onClick={() => share(buildSessionPayload())} />
          {shareStatus === 'copied' && (
            <span className="sector-settings-drawer__share-status" role="status">
              {CONTENT['session.status.linkCopied'].human}
            </span>
          )}
          {shareStatus === 'error' && (
            <span className="sector-settings-drawer__share-status sector-settings-drawer__share-status--error" role="alert">
              {CONTENT['session.status.copyFailed'].human}
            </span>
          )}
        </div>
      </div>

      <div className="sector-settings-drawer__section">
        <TextInput schema={ATTENUATION_STYLE_SCHEMA} value={attenuationStyleNameDraft} onChange={setAttenuationStyleNameDraft} />
        <div className="sector-settings-drawer__presets">
          <Button schema={RANDOM_ATTENUATION_STYLE_SCHEMA} onClick={() => setAttenuationStyleNameDraft(generateRandomAttenuationStyleName())} />
        </div>
      </div>

      <div className="sector-settings-drawer__section">
        <CoordsInput schema={COORDS_SCHEMA} value={coordsDraft} onChange={setCoordsDraft} />
        <div className="sector-settings-drawer__presets">
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
