import { useState, useEffect, startTransition } from 'react';
import LocaleView from './LocaleView';
import { computeLocaleHour } from '@/constants/time';
import { computeLocaleTemperature } from '@/utils/localeTemperature';
import { stepLocaleTemperature } from '@/utils/localeTemperatureStep';

import { useAttenuationStyleStore } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';

import './AttenuationStyleView.css';

interface AttenuationStyleViewProps {
  attenuationStyleId: string;
}

function AttenuationStyleView({ attenuationStyleId }: AttenuationStyleViewProps) {
  const attenuationStyle = useAttenuationStyleStore((s) => s.attenuationStyles.find((p) => p.id === attenuationStyleId));
  const localeId = attenuationStyle?.currentLocaleId ?? '';

  const [currentHour, setCurrentHour] = useState(() => {
    const locale = useLocaleStore.getState().locales[localeId];
    return locale ? computeLocaleHour(locale.dayStartTimestamp) : 0;
  });

  useEffect(() => {
    // Temperature rides this same 1s interval (no second timer — see
    // docs/specs/HEADER_HUB_CONSOLIDATION.md §1.3) but only steps when the
    // in-world clock crosses a half-hour boundary (top or bottom of the
    // hour), not on a fixed wall-clock cadence — a slower, small-random-walk
    // step keyed to game time rather than local time's own per-second
    // update. Reset on locale change so a switch starts fresh from a
    // freshly-computed seed value instead of an old locale's walk.
    let temperature: number | null = null;
    let halfHourSlot: number | null = null;

    const tick = () => {
      const locale = useLocaleStore.getState().locales[localeId];
      if (!locale) return;
      const hour = computeLocaleHour(locale.dayStartTimestamp);
      const slot = Math.floor(hour * 2); // 0-47, one per half-hour of the 24h in-world day
      // Wrapped in startTransition (docs/todo/backlog.md item 25): this one tick fans out
      // into a re-render of every FactoryInner/RobotBody (and anything else) subscribed to
      // activeLocaleLocalTime — every one of them in a single synchronized React commit, by
      // design (avoids visual tearing between buildings). Live-profiling items 21/23/24's
      // fixes found that commit still costs real main-thread time even with no wasted work
      // left inside it, simply because ~36+ components update together. startTransition
      // doesn't reduce that work — it marks it low-priority so React can interrupt it for
      // anything more urgent, or spread it across frames, instead of blocking synchronously.
      // Purely a scheduling hint: the store values themselves (read via `.getState()`) update
      // synchronously as always: this only affects how React-subscribed consumers re-render.
      startTransition(() => {
        setCurrentHour(hour);
        // No second computeLocalTime pass — hour already IS this locale's own
        // local time, computed directly from its own dayStartTimestamp. One
        // computation, two consumers (local state below, uiStore here).
        useUIStore.getState().setActiveLocaleLocalTime(hour);

        if (temperature === null) {
          // First tick after mount/locale-change: seed from the pure noise
          // function, same as before.
          temperature = computeLocaleTemperature(localeId, locale.coordinates.x, locale.coordinates.y, hour);
          halfHourSlot = slot;
          useUIStore.getState().setActiveLocaleTemperature(temperature);
        } else if (slot !== halfHourSlot) {
          // Crossed the top or bottom of the in-world hour: one small
          // walk step (seeded off this locale's own coordinates, not a
          // fresh noise sample).
          temperature = stepLocaleTemperature(localeId, locale.coordinates.x, locale.coordinates.y, slot, temperature);
          halfHourSlot = slot;
          useUIStore.getState().setActiveLocaleTemperature(temperature);
        }
      });
    };

    tick();
    const id = setInterval(tick, 1000); // wall-clock UI display tick, not musical timing
    return () => clearInterval(id);
  }, [localeId]);

  if (!attenuationStyle) return null;

  return (
    <div className="attenuation-style-view">
      <LocaleView localeId={localeId} localTime={currentHour} />
    </div>
  );
}

export default AttenuationStyleView;
