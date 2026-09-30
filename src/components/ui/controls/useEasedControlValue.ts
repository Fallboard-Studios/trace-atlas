import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

/** How long a value change that did NOT come from the user's own live drag/keyboard step takes
 *  to visually settle (Crawford's own request, shared by all 3 slider primitives — SliderLinear/
 *  SliderLog/SliderCenteredZero). Dragging/arrow-keys stay perfectly 1:1 with the pointer/key
 *  regardless — see handleValueChange below — never eased. */
const EASE_DURATION = 0.25;

/**
 * Shared ease-on-external-change behavior, extracted out of SliderLinear/SliderLog/
 * SliderCenteredZero (code review follow-up — the ~25-line version of this was copy-pasted
 * three times, nearly verbatim). Returns `displayValue` (render this, never the raw `value`
 * prop) and `handleValueChange` (wire this to the slider's own onValueChange).
 *
 * Built on `gsap.quickTo`, not a fresh `gsap.timeline()` per external change (code review
 * finding: the original per-call timeline design meant an Audio Swell tick — which writes
 * through this exact same store-backed path a human dragging the slider would use, every 16th
 * note for the whole swell's duration — killed and rebuilt a brand-new Timeline/Tween object on
 * every single tick, for as long as any swell touched a currently-mounted control. `quickTo`
 * is GSAP's own tool for exactly this "retargeted very frequently" shape: one persisted Tween,
 * smoothly re-aimed at each new target from wherever it currently sits, no rebuild). Lazily
 * created (not at mount) so a control whose value is never externally changed pays nothing.
 *
 * Deliberately NOT registered in timelineMap (CLAUDE.md's usual "every GSAP timeline lives in
 * timelineMap" rule) — `quickTo` returns a plain retarget function, not a `gsap.timeline()`
 * result, so it doesn't fit that Map's type; and nothing outside this hook ever needs to reach
 * in and kill this specific ease by a string key the way timelineMap's cross-component lookup
 * exists for — this hook already owns and kills its own tween directly via `proxyRef`, on both
 * an interrupting drag and unmount. A narrow, documented exception, not a silent deviation.
 *
 * `swelling` (default false): true while an Audio Swell is actively riding this exact control
 * (audioSwells.ts's isGlobalTargetSwelling/isRobotAttributeSwelling) — an external value change is
 * applied instantly, the same as a live drag, instead of through the 250ms ease below. A swell
 * tick arrives every 16th note, which at any tempo at or above the default 60 BPM is <=250ms —
 * faster than this ease can resolve — so easing every tick the same way a one-shot external write
 * (a company broadcast, a session load) gets would make the displayed value chronically lag the
 * real, audible one for the swell's whole duration instead of tracking it (found live, 2026-09-30).
 * The swell's own rising/falling formula is already the smoothing; this hook doesn't need to add a
 * second one on top for that case.
 */
export function useEasedControlValue(value: number, swelling = false) {
  // A stable object identity for quickTo to animate `.v` on — recreated only if this
  // component instance itself is recreated, never per external value change.
  const proxyRef = useRef({ v: value });
  const prevValueRef = useRef(value);
  const displayValueRef = useRef(value);
  const [displayValue, setDisplayValueState] = useState(value);
  function setDisplayValue(v: number) {
    displayValueRef.current = v;
    setDisplayValueState(v);
  }

  const quickToRef = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
  function getQuickTo() {
    if (!quickToRef.current) {
      const prefersReducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      quickToRef.current = gsap.quickTo(proxyRef.current, 'v', {
        duration: prefersReducedMotion ? 0 : EASE_DURATION,
        ease: 'power2.out',
        onUpdate: () => setDisplayValue(proxyRef.current.v),
        // Guarantees the EXACT target value lands (not the tween's own last interpolated
        // float), and is what actually commits it in a test environment — the shared gsap mock
        // (vitest.setup.ts) never fires onUpdate, only onComplete.
        onComplete: () => setDisplayValue(proxyRef.current.v),
      });
    }
    return quickToRef.current;
  }

  // A live drag or keyboard step applies instantly and synchronously here — before the `value`
  // prop even round-trips back down from the caller — so the thumb/track never lags a real
  // pointer/key by even one frame. Any OTHER value change (the effect below) eases instead.
  // `gsap.killTweensOf` (not `quickTo` itself) stops an in-flight ease immediately if the user
  // grabs the thumb mid-transition, rather than letting it keep fighting the live drag.
  function handleValueChange(next: number, onChange: (v: number) => void) {
    gsap.killTweensOf(proxyRef.current);
    proxyRef.current.v = next;
    prevValueRef.current = next;
    setDisplayValue(next);
    onChange(next);
  }

  useGSAP(() => {
    if (value === prevValueRef.current) return; // already applied instantly above, or a genuine no-op
    prevValueRef.current = value;
    if (swelling) {
      // Snap, don't ease — see this hook's own doc comment above for why a swell tick can't use
      // the same 250ms ease a one-shot external write gets. Kills any ease already in flight (e.g.
      // one still resolving from just before the swell started) so it can't keep fighting this.
      gsap.killTweensOf(proxyRef.current);
      proxyRef.current.v = value;
      setDisplayValue(value);
      return;
    }
    getQuickTo()(value);
    // Intentionally NOT depending on displayValue: this must only re-run when the real
    // committed value changes, reading proxyRef for whatever's currently displayed/mid-ease.
  }, { dependencies: [value, swelling] });

  useEffect(() => () => { gsap.killTweensOf(proxyRef.current); }, []);

  return { displayValue, handleValueChange };
}
