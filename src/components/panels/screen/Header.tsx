import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useEffect, useRef } from 'react';

import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { Toggle } from '@/components/ui/controls/Toggle';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { ToggleSchema } from '@/types/controls';

import './Header.css';

/** humanLabel: 'Mute' feeds the switch's accessible name (resolveAccessibleName).
 *  The Toggle usage below still passes text facade content instead of relying
 *  on the external DualLabel row — loreLabel added per Crawford's own request
 *  (2026-09-16) to resolve the flagged gap (docs/specs/HEADER_HUB_CONSOLIDATION.md
 *  §7 item #2), even though it renders alongside the facade text rather than
 *  replacing it. */
const MUTE_SCHEMA: ToggleSchema = { id: 'headerMute', type: 'toggle', loreLabel: 'SIGNAL SUPPRESSION [c]', humanLabel: 'Mute' };

/**
 * The header docked to the top of ScreenViewport (roadmap-adjacent,
 * docs/specs/HEADER_HUB_CONSOLIDATION.md), replacing TransportBar (Task 9
 * retired that file) and absorbing HubNav's tile-grid navigation into an
 * always-visible nav group. Responsive layout is now a fixed set of
 * hand-authored breakpoints in Header.css (430/480/880/1220px) rather than
 * the original spec's ResizeObserver-driven row merge — see
 * docs/tasks/HEADER_HUB_CONSOLIDATION.md's "Post-implementation follow-up".
 *
 * Navigation moved out entirely to NavTree (docs/specs/NAV_LAYOUT_REWRITE.md
 * Task 10) — Header keeps only the power rocker (rendered by SleeveContainer,
 * unaffected), the Mute toggle, and the status readout row. The volume
 * slider relocated to Settings -> Volume (Task 11, SettingsContent.tsx) —
 * Mute stays here since it's independent of which Settings leaf is open.
 */
function Header() {
  const headerRef = useRef<HTMLElement>(null);

  const isPoweredOn = useUIStore((s) => s.isPoweredOn);
  const activeLocaleLocalTime = useUIStore((s) => s.activeLocaleLocalTime);
  const activeLocaleTemperature = useUIStore((s) => s.activeLocaleTemperature);

  const isMuted = useAudioStore((s) => s.isMuted);

  // Console.css's vertical deadzone clearance (margin-top) needs Header's
  // real rendered height, which varies by breakpoint/content — no longer
  // safely assumable from the old fixed --power-corner-height constant
  // alone (docs/specs/HEADER_HUB_CONSOLIDATION.md §1.6). Written to
  // document.documentElement rather than a local ref/context, since Console
  // is a sibling of Header (not a descendant) — a plain inline custom
  // property on this element's own subtree wouldn't reach it.
  useEffect(() => {
    if (!headerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      document.documentElement.style.setProperty('--header-height', `${entries[0].contentRect.height}px`);
    });
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  const _localTime = activeLocaleLocalTime ?? 0;
  const localHour = Math.floor(_localTime);
  const localMinute = Math.floor((_localTime % 1) * 60);
  const hh = String(Math.max(0, Math.min(23, localHour))).padStart(2, '0');
  const mm = String(Math.max(0, Math.min(59, localMinute))).padStart(2, '0');
  const currentAttenuationStyle = useAttenuationStyleStore(selectCurrentAttenuationStyle);
  const currentLocaleId = currentAttenuationStyle?.currentLocaleId;
  // .coordinates specifically, not the whole locale object (bugfix, found live — same class as
  // SectorSettingsDrawer.tsx's own fix): coordinates is the only field this component ever reads
  // off the locale, but selecting the whole object meant a fresh reference — and a re-render here,
  // on Header, which is always mounted — on every unrelated robot write anywhere in the locale
  // (audioSwells.ts's 16n ticks included), since updateRobot (localeStore.ts) rebuilds the locale
  // object every time it changes `robots`. .coordinates itself keeps its own reference across
  // those writes (updateRobot only ever spreads it through, untouched), so narrowing to it
  // directly lets Header skip re-rendering for all of that ambient churn.
  const coordinates = useLocaleStore((s) => (currentLocaleId ? s.locales[currentLocaleId]?.coordinates : undefined));

  return (
    <header ref={headerRef} className="header" style={getTraitColorStyle('header')}>
      <div className="rocker-spacer">
        <div className="header__row header__row--volume">
          <Toggle
            schema={MUTE_SCHEMA}
            value={isMuted}
            onChange={(v) => useAudioStore.getState().setMuted(v)}
            disabled={!isPoweredOn}
          >
            {/* Both possible strings render stacked in the same grid cell
             (Header.css) — the box's content-sized width always reflects
             whichever is wider, so it never resizes as isMuted flips; only
             the one matching the current state stays visible. */}
            <span className="header__mute-facade">
              <span className="header__mute-facade-text" data-visible={!isMuted ? 'true' : undefined}>Volume/Mute</span>
              <span className="header__mute-facade-text" data-visible={isMuted ? 'true' : undefined}>Volume Muted</span>
            </span>
          </Toggle>
        </div>
        <div className="header__row header__row--status">
          <div className="header__status__row">
            <span className="header__coordinates">
              <VisuallyHidden>Coordinates: </VisuallyHidden>
              @ {coordinates?.x ?? 'CORRUPT X'}, {coordinates?.y ?? 'CORRUPT Y'}
            </span>
          </div>
          <div className="header__status__row">
            <span className="header__time">
              <VisuallyHidden>Local time: </VisuallyHidden>
              {hh}:{mm}
            </span>
            <span className="header__temp">
              <VisuallyHidden>Temperature: </VisuallyHidden>
              {activeLocaleTemperature !== null ? `${activeLocaleTemperature}°C` : 'CORRUPT TEMPERATURE'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
