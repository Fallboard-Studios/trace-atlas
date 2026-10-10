import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';

import { useShell } from './useShell';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { Toggle, CABINET_TOGGLE_BOX_SIZE } from '@/components/ui/controls/Toggle';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';
import { CABINET_BOX_HEIGHT, CABINET_VOXEL_GAP } from '@/utils/cabinetBreakpoints';
import { computeVoxelTrackLength, computeVoxelTrackTrailingReserve, VOXEL_TRACK_MIN_BOX_COUNT } from '@/utils/voxelTrackMath';
import type { ToggleSchema, SliderLinearSchema } from '@/types/controls';
import { labels } from '@/content';

import './Header.css';

/** The Mute toggle's human label (content header.mute) feeds the switch's accessible name (resolveAccessibleName).
 *  The Toggle usage below passes an icon facade (🔇/🔊, swapped on isMuted)
 *  instead of relying on the external DualLabel row — loreLabel added per
 *  Crawford's own request (2026-09-16) to resolve the flagged gap
 *  (docs/specs/HEADER_HUB_CONSOLIDATION.md §7 item #2), even though it
 *  renders alongside the facade icon rather than replacing it. */
const MUTE_SCHEMA: ToggleSchema = { id: 'headerMute', type: 'toggle', ...labels('header.mute') };

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
  orientation: 'horizontal',
  type: 'sliderLinear',
  ...labels('header.volume'),
};

/** The phone's volume box is named for what it opens. */
const VOLUME_NAME = MASTER_VOLUME_SCHEMA.humanLabel;

/** One width for the volume slider, in the desk row and in the phone's pop-out (Header.css reads it
 *  as --header-volume-width). The voxel boxes follow the cabinet tier and a track never draws fewer
 *  than three, so this is the shortest track at the largest tier (three 48 px boxes and their pop
 *  room, 184 px): no tier overflows it (a 176 px width overflowed the desk by 8 px, measured), and
 *  the pop-out still fits left of the power corner at 320 px. Derived, so it follows the tables. */
const HEADER_VOLUME_WIDTH =
  computeVoxelTrackLength(VOXEL_TRACK_MIN_BOX_COUNT, CABINET_BOX_HEIGHT.desktop, CABINET_VOXEL_GAP.desktop) +
  computeVoxelTrackTrailingReserve('horizontal');

const HEADER_STYLE = {
  ...getTraitColorStyle('header'),
  '--header-volume-width': `${HEADER_VOLUME_WIDTH}px`,
} as CSSProperties;

/**
 * Phone shell: the ▾ box beside mute and the pop-out it opens with the volume slider (Crawford,
 * 2026-10-09: "Volume box beside mute" — mute stays one press). A Radix Popover: Escape and a press
 * outside close it, and focus goes back to the box. No Popover.Portal, so the pop-out stays inside
 * the header, inside ScreenViewport (the UI Shell guardrail). Its own component so the open state
 * goes with it when the shell widens to the desk; narrowing again finds it shut.
 *
 * The box pops while open, as a Toggle's does while on. The pop-out wears the header's static popped
 * facade, as every panel does (spec §1.1).
 */
function VolumePopout({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="header__volume-trigger" aria-label={VOLUME_NAME} disabled={disabled}>
          <CabinetBox popped={open ? true : CABINET_REST_POP} timelineKey="cabinet-header-volume-trigger">
            <span className="header__volume-glyph" aria-hidden="true">
              ▾
            </span>
          </CabinetBox>
        </button>
      </Popover.Trigger>
      {/* End-aligned under the ▾ box, it grows left, away from the power corner beside it, and its
          width (HEADER_VOLUME_WIDTH) keeps it inside the screen: at 320 px it spans 25–225 px, the
          screen 16–304 and the corner from 233 (measured in Chrome). */}
      <Popover.Content className="header__volume-popover" side="bottom" align="end" sideOffset={8} collisionPadding={8}>
        <CabinetBox popped skipMountAnimation autoHeight timelineKey="cabinet-header-volume-popover-facade">
          {children}
        </CabinetBox>
      </Popover.Content>
    </Popover.Root>
  );
}

/**
 * The slim header (docs/specs/LAYOUT_REWORK.md §1.1; docs/tasks/LAYOUT_REWORK.md Task 6): one cabinet
 * row beside the power corner, in its static popped facade. On the desk shell, mute and the master
 * volume slider; on the phone shell, mute and the ▾ box that opens the slider in a pop-out. The slide
 * that once moved the row out of the nav panel's way is gone: the phone's nav is a sheet below the top
 * bar and the desk panel never reaches the header, so nothing here moves with the nav.
 *
 * The volume slider is also in Settings -> Volume (SettingsContent.tsx), the same audioStore value:
 * volume stays reachable beside mute, never gated behind a nav selection (Crawford, after
 * docs/specs/NAV_LAYOUT_REWRITE.md Task 11).
 */
function Header() {
  const headerRef = useRef<HTMLElement>(null);
  const shell = useShell();

  const isPoweredOn = useUIStore((s) => s.isPoweredOn);

  const isMuted = useAudioStore((s) => s.isMuted);
  const volume = useAudioStore((s) => s.volume);

  // The content's header clearance (ContentPane.css) and the top bar's lower edge (Header.css's
  // --top-bar-bottom, which the nav sheet reads) need Header's real rendered height
  // (docs/specs/HEADER_HUB_CONSOLIDATION.md §1.6). Written to document.documentElement, since those
  // are Header's siblings, not its descendants.
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

  const volumeSlider = (
    <SliderLinear schema={MASTER_VOLUME_SCHEMA} value={volume * 100} onChange={handleVolumeChange} disabled={!isPoweredOn} />
  );

  return (
    <header ref={headerRef} className="header" style={HEADER_STYLE}>
      {/* Oblique Cabinetry facade — decorative only, matching
         DirectionalPanel's own top-level facade (permanently popped,
         non-animating: `popped` + `skipMountAnimation` + `autoHeight`, no
         value/state tie-in). See DirectionalPanel.tsx's own comment and
         docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1. */}
      <CabinetBox popped skipMountAnimation autoHeight timelineKey="cabinet-header-facade">
        <div className="header__row">
          <Toggle
            schema={MUTE_SCHEMA}
            value={isMuted}
            onChange={(v) => useAudioStore.getState().setMuted(v)}
            disabled={!isPoweredOn}
            boxSize={CABINET_TOGGLE_BOX_SIZE}
          >
            {/* Single glyph, swapped on isMuted — unlike the old two-string
               text facade, both icons render at the same intrinsic width so
               there's no box-resize-on-toggle concern to guard against.
               aria-hidden: the switch's own aria-label (resolveAccessibleName
               above) already carries the accessible name. */}
            <span className="header__mute-icon" aria-hidden="true">{isMuted ? '🔇' : '🔊'}</span>
          </Toggle>
          {shell === 'desk' ? volumeSlider : <VolumePopout disabled={!isPoweredOn}>{volumeSlider}</VolumePopout>}
        </div>
      </CabinetBox>
    </header>
  );
}

export default Header;
