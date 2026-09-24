import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { NAV_PANEL_DOCK_MIN_WIDTH } from './nav/useNavPanelSlideAway';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { Toggle } from '@/components/ui/controls/Toggle';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import type { ToggleSchema, SliderLinearSchema } from '@/types/controls';

import './Header.css';

const NAV_CLEARANCE_TIMELINE_KEY = 'header-cabinet-nav-clearance';
// Same duration NavPanel.tsx's own slide-away tween uses — no dedicated shared constant (single
// consumer each), but kept numerically identical so the two read as one synchronized motion.
const NAV_CLEARANCE_SLIDE_DURATION = 0.25;
// Below this, NavPanel is slid fully off-canvas when closed rather than partially — this clearance
// behavior only applies in the band where a NOW-open NavPanel would otherwise sit directly under
// Header's own volume slider. Deliberately independent of NAV_PANEL_DOCK_MIN_WIDTH's own lower
// bound (there isn't one — NavPanel slides away for any width below it); this is Header's own
// range, min-width query to match this codebase's mobile-first CSS convention.
const HEADER_NAV_CLEARANCE_MIN_WIDTH = 400;
// How much of .header>.sc-cabinet-box (Mute's own box) stays visible to the left of the power
// rocker once shifted — just enough for Mute; Volume scrolls out from under it. Two tiers within
// the clearance range itself (Crawford's spec) — HEADER_NAV_CLEARANCE_WIDE_MIN_WIDTH is its own
// breakpoint, independent of both HEADER_NAV_CLEARANCE_MIN_WIDTH and NAV_PANEL_DOCK_MIN_WIDTH.
const HEADER_NAV_CLEARANCE_VISIBLE_WIDTH_NARROW = 154;
const HEADER_NAV_CLEARANCE_VISIBLE_WIDTH_WIDE = 188;
const HEADER_NAV_CLEARANCE_WIDE_MIN_WIDTH = 640;

/** Live match for an arbitrary media query — local to Header since it's the only consumer of a
 *  min-width query outside the shared Cabinet tier / NavPanel dock breakpoint (useCabinetTier,
 *  useNavPanelSlideAway.ts); split out if a second call site needs the same thing. */
function useMatchesMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window.matchMedia !== 'function') return () => { };
      const mql = window.matchMedia(query);
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
  );
}

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

  const isNavPanelOpen = useUIStore((s) => s.isNavPanelOpen);
  // In range: at least HEADER_NAV_CLEARANCE_MIN_WIDTH wide, but still below NavPanel's own dock
  // breakpoint (NAV_PANEL_DOCK_MIN_WIDTH, useNavPanelSlideAway.ts) — once NavPanel is permanently
  // docked, it no longer overlaps Header's own volume slider at all, so there's nothing to clear.
  const isAtLeastClearanceWidth = useMatchesMediaQuery(`(min-width: ${HEADER_NAV_CLEARANCE_MIN_WIDTH}px)`);
  const isNavPanelDocked = useMatchesMediaQuery(`(min-width: ${NAV_PANEL_DOCK_MIN_WIDTH}px)`);
  const isAtLeastClearanceWideWidth = useMatchesMediaQuery(`(min-width: ${HEADER_NAV_CLEARANCE_WIDE_MIN_WIDTH}px)`);
  const inNavClearanceRange = isAtLeastClearanceWidth && !isNavPanelDocked;
  const shiftForNavPanel = inNavClearanceRange && isNavPanelOpen;
  const clearanceVisibleWidth = isAtLeastClearanceWideWidth ? HEADER_NAV_CLEARANCE_VISIBLE_WIDTH_WIDE : HEADER_NAV_CLEARANCE_VISIBLE_WIDTH_NARROW;

  const { contextSafe } = useGSAP({ dependencies: [] });

  useEffect(() => () => killTimeline(NAV_CLEARANCE_TIMELINE_KEY), []);

  const animateNavClearance = contextSafe((shift: boolean, visibleWidth: number) => {
    // .sc-cabinet-box is CabinetBox's own DOM root (CabinetBox.tsx) — it renders no forwarded
    // ref, so this reads it straight off the DOM the same way NavTree.tsx's own roving-tabindex
    // focus effect already does (rootRef.current?.querySelector(...)), rather than adding ref
    // plumbing to a component with many other unrelated consumers.
    const el = headerRef.current?.querySelector<HTMLElement>('.sc-cabinet-box');
    if (!el) return;
    killTimeline(NAV_CLEARANCE_TIMELINE_KEY);
    const prefersReducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 0 : NAV_CLEARANCE_SLIDE_DURATION;
    const tl = gsap.timeline();
    // xPercent (relative to the box's OWN rendered width) combined with a fixed x nudge, GSAP's
    // usual way to compose "100% of my own size, plus a fixed pixel offset" into one transform —
    // this reads as "slide right by my own width, then back left by visibleWidth".
    // .header__row--volume's own padding-right already reserves clearance up to the power rocker
    // (calc(var(--power-corner-width) + var(--spacing-md)), Header.css) — the box's real right
    // edge already sits flush against the rocker's left edge regardless of breakpoint/slider
    // width, so this shift always leaves exactly visibleWidth px of the box's left edge (Mute)
    // visible before the rocker, with no separate need to read --power-corner-width here directly.
    tl.to(el, { xPercent: shift ? 100 : 0, x: shift ? -visibleWidth : 0, duration, ease: 'power2.out' });
    setTimeline(NAV_CLEARANCE_TIMELINE_KEY, tl);
  });

  useEffect(() => {
    animateNavClearance(shiftForNavPanel, clearanceVisibleWidth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftForNavPanel, clearanceVisibleWidth]);

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
