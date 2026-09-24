import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { CabinetBox } from './CabinetBox';
import { CABINET_TOGGLE_BOX_SIZE } from './Toggle';
import { DualLabel } from './DualLabel';
import { getAccordionDuration, getAccordionFadeDuration, FIRST_OPEN_MAX_SETTLE_TICKS } from './accordionAnimation';
import { withActiveClass } from './activeClass';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import type { AccordionSchema } from '@/types/controls';
import './AccordionContainer.css';

interface AccordionContainerProps {
  schema: AccordionSchema;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Optional inline style applied to the outer Accordion.Root — this phase's only consumer is
   *  trait-color scoping (getTraitColorStyle/getRobotColorStyle, src/utils/traitColors.ts,
   *  Roadmap Phase 14), but the prop itself is generic, matching CabinetBox's own precedent of
   *  small, purpose-documented optional additions rather than a theming-specific prop name. Every
   *  descendant CabinetBox inside this section inherits whatever custom properties this style sets
   *  via ordinary CSS cascade — no other wiring needed. See
   *  docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5.1. */
  style?: CSSProperties;
}

/** Row-natural facade height for the trigger's outer, permanently-popped
 *  CabinetBox (roadmap Phase 11.1.7) — not Button's breakpoint-driven
 *  32/40/48px tiles. Sized to fit DualLabel's own 2-line stack (every real
 *  AccordionContainer schema sets both loreLabel and humanLabel) plus the
 *  original trigger's own 8px top/bottom padding, now expressed as box
 *  height instead of literal padding. See
 *  docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.5. */
export const CABINET_ACCORDION_TRIGGER_HEIGHT = 56;

const cabinetTokens = {
  '--cabinet-accordion-toggle-size': `${CABINET_TOGGLE_BOX_SIZE}px`,
} as CSSProperties;

/**
 * A single independent collapsible section — wraps exactly one Radix
 * Accordion.Root (type="single" collapsible) + one Item, not a group
 * coordinator. A drawer wanting several independently-open sections renders
 * multiple AccordionContainer instances side by side. Open/closed is local
 * ephemeral UI state (spec §3) — presentational, not a domain value.
 * Expand/collapse animates via a GSAP timeline registered in timelineMap,
 * following PowerRockerSwitch.tsx's pattern, and respects
 * prefers-reduced-motion the same way PowerRockerSwitch.css does.
 *
 * Renders through 2 nested CabinetBoxes (roadmap Phase 11.1.7) — an outer,
 * permanently-popped facade wrapping the whole row (popped={true} +
 * skipMountAnimation, so it never actually tweens — see
 * docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.2) giving the
 * trigger the Oblique Cabinetry look, and an inner, genuinely-animated
 * CabinetBox in place of the old plain +/- text — state-keyed off `open`
 * exactly like Toggle (§1.3), reusing Toggle's own CABINET_TOGGLE_BOX_SIZE
 * constant rather than a new tuned size. This is the first Cabinetry item to
 * nest one CabinetBox inside another's front face; see §1.1/§1.4 for why
 * that's safe and how the two fronts stay independently styleable.
 */
function AccordionContainerInner({ schema, children, defaultOpen = false, style }: AccordionContainerProps) {
  const [open, setOpen] = useState(defaultOpen);
  // Whether this section has EVER been opened. Its children are only built once it has, and never torn down again —
  // collapsing just hides them — so a section that's been opened behaves exactly as every section did before this
  // existed. Never goes back to false. A section mounted already-open (defaultOpen) builds its content immediately.
  // See docs/specs/ACCORDION_LAZY_MOUNT.md §1.
  const [hasOpened, setHasOpened] = useState(defaultOpen);
  // Set by handleValueChange on a FIRST open, consumed by the layout effect below. A ref rather than state: it's a
  // one-shot handoff from an event handler to the next commit, never rendered.
  const pendingFirstOpenAnimation = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentInnerRef = useRef<HTMLDivElement>(null);
  const timelineKey = `accordion-${schema.id}`;
  // A first open waits, tick by tick on GSAP's own clock, for its new content to settle before building its tween (see the
  // layout effect below). Each wait is a tiny timeline registered under this key, so a toggle or unmount cancels it.
  const startKey = `${timelineKey}-start`;

  // GSAP's own context.revert() (from useGSAP/contextSafe below) only kills the underlying GSAP
  // tween it tracked — it has no knowledge of our separate timelineMap registry, so this manual
  // cleanup is still required to keep that registry itself tidy on unmount.
  useEffect(() => {
    return () => {
      killTimeline(timelineKey);
      killTimeline(startKey);
    };
  }, [timelineKey, startKey]);

  // No mount-time animation here — this hook call exists purely to get `contextSafe`, so
  // animateTo() below (called from handleValueChange, not from this callback) is tracked by
  // GSAP's own context and reverted on unmount, on top of the killTimeline dedup calls it
  // already makes.
  const { contextSafe } = useGSAP({ dependencies: [] });

  // If mounted already-open, the content still needs its height/overflow
  // (see animateTo()) freed from the CSS closed-state default (height: 0,
  // overflow-y: hidden), and the content-inner's own opacity raised off its
  // CSS closed-state default (0) — animateTo() only runs from user
  // interaction (handleValueChange), so without this the section renders
  // visually collapsed/invisible, and the oblique facades inside it clipped,
  // despite aria-expanded="true" on mount.
  useEffect(() => {
    if (defaultOpen && contentRef.current) {
      contentRef.current.style.height = 'auto';
      contentRef.current.style.overflowY = 'visible';
      if (contentInnerRef.current) contentInnerRef.current.style.opacity = '1';
    }
    // Intentionally mount-only: defaultOpen only describes the initial
    // state: post-mount opens/closes go through animateTo() instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The height the open tween should land on: the inner wrapper's own laid-out box, i.e. exactly what `height: auto` resolves
  // to once the tween completes. Not `scrollHeight` — that also counts the last CabinetBox's popped-out front face
  // overhanging the wrapper (a transform, so it isn't layout), which `auto` drops, so every open used to end by snapping
  // ~2-3 px shorter and pulling every section below it up with it (measured in real Chrome, docs/PERFORMANCE.md).
  // Falls back to scrollHeight only if the inner ref is somehow missing.
  const measureContentHeight = () => contentInnerRef.current?.getBoundingClientRect().height ?? contentRef.current?.scrollHeight ?? 0;

  const animateTo = contextSafe((nextOpen: boolean) => {
    const el = contentRef.current;
    const innerEl = contentInnerRef.current;
    if (!el) return;
    killTimeline(timelineKey);
    // Any toggle supersedes a first-open start that has not fired yet, so a stale one can never reopen a closed section.
    killTimeline(startKey);

    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = getAccordionDuration(prefersReducedMotion);
    const fadeDuration = getAccordionFadeDuration(prefersReducedMotion);
    const targetHeight = nextOpen ? measureContentHeight() : 0;

    // Two sequential steps, deliberately never simultaneous, so the content
    // is never visible while a sibling section is still mid-reposition:
    // open makes room (height) before the content fades in; close fades the
    // content out before collapsing (and pushing the next section up).
    const tl = gsap.timeline();
    if (nextOpen) {
      // Overflow must go visible before height starts growing, or the
      // oblique CabinetBox facades in the content get clipped on their
      // right edge for the first frame(s) of the expand.
      tl.set(el, { overflowY: 'visible' });
      tl.to(el, {
        height: targetHeight,
        duration,
        ease: 'power2.out',
        onComplete: () => {
          el.style.height = 'auto';
        },
      });
      if (innerEl) {
        tl.to(innerEl, { opacity: 1, duration: fadeDuration, ease: 'power1.out' });
      }
    } else {
      if (innerEl) {
        tl.to(innerEl, { opacity: 0, duration: fadeDuration, ease: 'power1.in' });
      }
      tl.to(el, {
        height: 0,
        duration,
        ease: 'power2.in',
        onComplete: () => {
          // Only clip back once fully collapsed, so the right-edge clipping
          // fixed above never appears mid-collapse either.
          el.style.overflowY = 'hidden';
        },
      });
    }
    setTimeline(timelineKey, tl);
  });

  // First open only: the content wasn't in the DOM when the click happened, and animateTo() reads el.scrollHeight —
  // calling it now would measure an empty wrapper (height 0), tween to nothing, and snap open at the end. So the
  // animation waits until React has committed the content. A layout effect (not useEffect, not a timer) runs after the
  // DOM update but before paint, so the tween still starts in the frame the user clicked, with no flash of an
  // open-but-empty section. Deps are [hasOpened] only: animateTo is a fresh closure every render, and this must fire
  // exactly once per first open.
  useLayoutEffect(() => {
    if (!pendingFirstOpenAnimation.current) return;
    pendingFirstOpenAnimation.current = false;
    // Don't build the tween now — wait for the section to settle first. Measured in real Chrome
    // (docs/PERFORMANCE.md): a freshly-mounted section's controls do a heavy mount, then a second wave of work once their
    // ResizeObservers fire and their box counts re-fit, all while a tween created here would already be running. GSAP
    // stamps a new timeline with its *last tick's* time, so that heavy work ate most of the 250 ms before the first
    // rendered frame — the two heaviest sections opened in 3 frames instead of ~12, then snapped by however much the
    // content had grown since it was measured. So poll on GSAP's own ticks (no timers) until two consecutive ticks read
    // the same height, then build the real tween from "now" against that settled height. A cap keeps it bounded.
    let lastHeight = -1;
    let ticks = 0;
    const startWhenSettled = () => {
      const height = measureContentHeight();
      ticks += 1;
      if (height === lastHeight || ticks >= FIRST_OPEN_MAX_SETTLE_TICKS) {
        animateTo(true);
        return;
      }
      lastHeight = height;
      const next = gsap.timeline();
      next.call(startWhenSettled);
      setTimeline(startKey, next);
    };
    const start = gsap.timeline();
    start.call(startWhenSettled);
    setTimeline(startKey, start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOpened]);

  function handleValueChange(value: string) {
    const nextOpen = value === schema.id;
    setOpen(nextOpen);
    if (nextOpen && !hasOpened) {
      // Content not built yet — build it now (batched with setOpen into one render), animate after that commit.
      pendingFirstOpenAnimation.current = true;
      setHasOpened(true);
      return;
    }
    animateTo(nextOpen); // content already built: the original synchronous path, unchanged
  }

  return (
    <Accordion.Root
      type="single"
      collapsible
      className={withActiveClass('sc-accordion', open)}
      value={open ? schema.id : ''}
      onValueChange={handleValueChange}
      style={style}
    >
      <Accordion.Item value={schema.id} className="sc-accordion__item">
        <Accordion.Header className="sc-accordion__header">
          <Accordion.Trigger className="sc-accordion__trigger" style={cabinetTokens}>
            <CabinetBox
              popped
              skipMountAnimation
              boxHeight={CABINET_ACCORDION_TRIGGER_HEIGHT}
              timelineKey={`cabinet-accordion-facade-${schema.id}`}
            >
              <span className="sc-accordion__row">
                <CabinetBox
                  popped={open}
                  boxHeight={CABINET_TOGGLE_BOX_SIZE}
                  timelineKey={`cabinet-accordion-toggle-${schema.id}`}
                >
                  {/* Decorative — the open/closed affordance itself.
                      aria-expanded already carries the real state
                      accessibly; this (plus the box's own pop/flat) is
                      purely so a sighted user can tell at a glance the
                      section can be opened. Driven directly by the same
                      `open` state as everything else here, not a separate
                      Radix data-state hook. */}
                  <span className="sc-accordion__indicator" aria-hidden="true">{open ? '−' : '+'}</span>
                </CabinetBox>
                <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
              </span>
            </CabinetBox>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content ref={contentRef} className="sc-accordion__content" forceMount>
          <div className="sc-accordion__content-inner" ref={contentInnerRef}>{hasOpened ? children : null}</div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 10) — takes caller-supplied
// `children`; a caller constructing it inline as an element (not a bare string) defeats this
// bail-out regardless of memoization here (spec §1.3's conditional-benefit case, same shape
// Toggle's own facade `children` documents).
export const AccordionContainer = memo(AccordionContainerInner);
