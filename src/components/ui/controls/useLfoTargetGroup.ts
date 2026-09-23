import { useEffect, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import { LFO_RATE_MIN, LFO_DEPTH_MIN } from '@/types/lfo';
import type { LfoValue } from '@/types/controls';

/**
 * Neutral placeholder shown while a target-swap transition is in flight — never the outgoing
 * or incoming field's real value. Same shape lfoConfig.ts's own private makeDefaultLfoSettings()
 * and CompanyOptionsSection.tsx's DISABLED_AUDIO_SETTING.volumeLfo already use for
 * "unconfigured/placeholder" LFO values — no new convention invented.
 */
export const NEUTRAL_LFO_VALUE: LfoValue = { shape: 'sine', rate: LFO_RATE_MIN, depth: LFO_DEPTH_MIN };

export interface LfoTargetGroupField<F extends string = string> {
  field: F;
  /** Shown as the shared display's own label when this field is targeted — reuses each
   *  param's existing schema.humanLabel (e.g. 'Mid', 'Coaxial Gain'). */
  label: string;
  lfoValue: LfoValue;
}

export interface UseLfoTargetGroupOptions<F extends string = string> {
  /** Unique per group unit — becomes the timelineMap key (`lfo-target-group-${groupId}`),
   *  e.g. 'audioRig.eq3', 'robotOptions.layer1', 'robotOptions.volume'. */
  groupId: string;
  fields: LfoTargetGroupField<F>[];
}

export interface UseLfoTargetGroupResult<F extends string = string> {
  /** The committed target — persists across a transition, updated only once it completes. */
  selected: F;
  transitioning: boolean;
  select: (next: F) => void;
  isTargeted: (field: F) => boolean;
  /** NEUTRAL_LFO_VALUE while transitioning, else the selected field's own lfoValue. */
  displayValue: LfoValue;
  /** Always the committed (still-`selected`) field's own label, transitioning or not — the
   *  display never goes unlabeled mid-transition, only its values blank out. */
  displayLabel: string;
}

/**
 * Owns the shared-LFO-display selection/transition state machine (docs/specs/
 * LFO_CONSOLIDATED_DISPLAY.md §1.3) — which field is targeted, and the explicit transition
 * state a target swap goes through before committing. Selection is local ephemeral state,
 * never Zustand (the same "selection is local, ephemeral state" precedent this repo uses
 * elsewhere). The transition
 * itself is a timelineMap-registered GSAP timeline, not a raw timer (CLAUDE.md forbids
 * setTimeout/setInterval/requestAnimationFrame for musical/UI timing here) — today a
 * 0-duration scaffold; a future pass adds real crossfade timing without changing this state
 * machine's shape.
 */
export function useLfoTargetGroup<F extends string = string>({
  groupId,
  fields,
}: UseLfoTargetGroupOptions<F>): UseLfoTargetGroupResult<F> {
  const [selected, setSelected] = useState<F>(fields[0].field);
  const [transitioning, setTransitioning] = useState(false);
  const timelineKey = `lfo-target-group-${groupId}`;

  useEffect(() => () => killTimeline(timelineKey), [timelineKey]);

  // No DOM ref here — this hook only ever builds a bookkeeping timeline for the transition
  // delay, never queries elements — so no scope is needed. This call exists purely to get
  // `contextSafe`, so select()'s gsap.timeline() below is tracked by GSAP's own context and
  // reverted on unmount too, on top of the killTimeline dedup/cleanup calls above.
  const { contextSafe } = useGSAP({ dependencies: [] });

  // Falls back if the currently-selected field disappears from a new `fields` array (e.g.
  // Signature Array's pulseWidth row hiding when a layer's type leaves 'pulse').
  useEffect(() => {
    if (!fields.some((f) => f.field === selected)) {
      killTimeline(timelineKey);
      setSelected(fields[0].field);
      setTransitioning(false);
    }
    // Intentionally reacts only to `fields` — re-running on every `selected`/`timelineKey`
    // change would fight the transition's own commit inside select() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  const select = contextSafe((next: F) => {
    if (next === selected) return;
    killTimeline(timelineKey);
    setTransitioning(true);
    const tl = gsap.timeline({
      onComplete: () => {
        setSelected(next);
        setTransitioning(false);
      },
    });
    tl.to({}, { duration: 0 }); // scaffold — real crossfade timing lands later
    setTimeline(timelineKey, tl);
  });

  const activeField = fields.find((f) => f.field === selected) ?? fields[0];
  const displayValue = transitioning ? NEUTRAL_LFO_VALUE : activeField.lfoValue;
  // Label stays visible through the transition (avoids the display flickering blank/unlabeled
  // between renders) — only the values reset to neutral while transitioning.
  const displayLabel = activeField.label;

  return {
    selected,
    transitioning,
    select,
    isTargeted: (field: F) => field === selected,
    displayValue,
    displayLabel,
  };
}
