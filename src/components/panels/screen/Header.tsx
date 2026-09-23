import { useEffect, useRef } from 'react';

import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { Toggle } from '@/components/ui/controls/Toggle';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { ToggleSchema, SliderLinearSchema } from '@/types/controls';

import './Header.css';

/** humanLabel: 'Mute' feeds the switch's accessible name (resolveAccessibleName).
 *  The Toggle usage below passes an icon facade (🔇/🔊, swapped on isMuted)
 *  instead of relying on the external DualLabel row — loreLabel added per
 *  Crawford's own request (2026-09-16) to resolve the flagged gap
 *  (docs/specs/HEADER_HUB_CONSOLIDATION.md §7 item #2), even though it
 *  renders alongside the facade icon rather than replacing it. */
const MUTE_SCHEMA: ToggleSchema = { id: 'headerMute', type: 'toggle', loreLabel: 'SIGNAL SUPPRESSION [c]', humanLabel: 'Mute' };

/** Distinct id from SettingsContent.tsx's own VOLUME_SCHEMA ('headerVolume')
 *  — Header is always mounted, so if Settings -> Volume is open at the same
 *  time both SliderLinears are live simultaneously; sharing an id would
 *  collide in timelineMap (same bug class Toggle's own timelineKey comment
 *  describes for RadioButton). Same range/step/unit, same audioStore.volume
 *  binding — just a second, always-visible control on the same value. */
const MASTER_VOLUME_SCHEMA: SliderLinearSchema = {
  id: 'masterVolume',
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
  orientation: 'horizontal',
  type: 'sliderLinear',
  humanLabel: 'Volume'
};

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
 * Task 10) — Header keeps the power rocker (rendered by SleeveContainer,
 * unaffected), a master volume slider, the Mute toggle, and the status
 * readout row. The volume slider briefly relocated to Settings -> Volume
 * only (Task 11) and was moved back here (still also in
 * SettingsContent.tsx) per Crawford's own follow-up call — volume should
 * always be reachable alongside Mute, not gated behind a nav selection.
 */
function Header() {
  const headerRef = useRef<HTMLElement>(null);

  const isPoweredOn = useUIStore((s) => s.isPoweredOn);

  const isMuted = useAudioStore((s) => s.isMuted);
  const volume = useAudioStore((s) => s.volume);

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

  const handleVolumeChange = (pct: number) => {
    if (!isPoweredOn) return;
    useAudioStore.getState().setVolume(pct / 100);
  };

  // .coordinates specifically, not the whole locale object (bugfix, found live — same class as
  // SectorSettingsDrawer.tsx's own fix): coordinates is the only field this component ever reads
  // off the locale, but selecting the whole object meant a fresh reference — and a re-render here,
  // on Header, which is always mounted — on every unrelated robot write anywhere in the locale
  // (audioSwells.ts's 16n ticks included), since updateRobot (localeStore.ts) rebuilds the locale
  // object every time it changes `robots`. .coordinates itself keeps its own reference across
  // those writes (updateRobot only ever spreads it through, untouched), so narrowing to it
  // directly lets Header skip re-rendering for all of that ambient churn.

  return (
    <header ref={headerRef} className="header" style={getTraitColorStyle('header')}>
      {/* Oblique Cabinetry facade — decorative only, matching
         DirectionalPanel's own top-level facade (permanently popped,
         non-animating: `popped` + `skipMountAnimation` + `autoHeight`, no
         value/state tie-in). See DirectionalPanel.tsx's own comment and
         docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1. */}
      <CabinetBox popped skipMountAnimation autoHeight timelineKey="cabinet-header-facade">
        <div className="header__row header__row--volume">
          <Toggle
            schema={MUTE_SCHEMA}
            value={isMuted}
            onChange={(v) => useAudioStore.getState().setMuted(v)}
            disabled={!isPoweredOn}
          >
            {/* Single glyph, swapped on isMuted — unlike the old two-string
               text facade, both icons render at the same intrinsic width so
               there's no box-resize-on-toggle concern to guard against.
               aria-hidden: the switch's own aria-label (resolveAccessibleName
               above) already carries the accessible name. */}
            <span className="header__mute-icon" aria-hidden="true">{isMuted ? '🔇' : '🔊'}</span>
          </Toggle>
          <SliderLinear
            schema={MASTER_VOLUME_SCHEMA}
            value={volume * 100}
            onChange={handleVolumeChange}
            disabled={!isPoweredOn}
          />
        </div>
      </CabinetBox>
    </header>
  );
}

export default Header;
