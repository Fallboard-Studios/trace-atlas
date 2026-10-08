// ========================================
// CHARGING STATION (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.6, Phase 43 Task 20)
// ========================================
// One fragment of a station, drawn in the robots layer. The station is three fragments
// interleaved with the robots, back to front: L4 · exiting robots · L3 · everyone else · L2 ·
// halo + ripple · L1 — so a robot entering passes between L2 and L3, and an exiting robot
// appears behind L3 (OceanScene renders the fragments around the robot group). Until J4's back
// row lands, exits use this front-layer seam.
//
// Static: no timeline, no ticker. The slot lights re-render only when this station's charging set
// changes (stationOccupancy.ts); the geometry only when the world rig's four dials move
// (stationGem.ts). The work loop drives the ripple circle (stationRipple.ts, Task 23) through the
// front fragment's `station-front-${id}` ref; nothing here animates.

// ========================================
// IMPORTS
// ========================================
import { memo, useLayoutEffect, useMemo, useRef } from 'react';

import { getStationRoll, stationDials, stationGeometry } from './stationGem';
import { STATION_HALO_PEAK, stationPaint, type StationShape } from './stationPaint';
import { chargingColorsKey, parseColorsKey } from './stationOccupancy';
import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { STATION_HALO_RADIUS } from '@/constants';
import type { Station } from '@/systems/stations';
import { deleteRef, setRef } from '@/utils/refs';

// ========================================
// TYPES
// ========================================
/** Which slice of the interleave this element draws. */
export type StationFragment = 'l4' | 'l3' | 'front';

interface ChargingStationProps {
  localeId: string;
  station: Station;
  fragment: StationFragment;
}

// ========================================
// HELPERS
// ========================================
/** Halo gradient stops (offset, share of the peak), sketch values: clear in the middle, a soft ring. */
const HALO_STOPS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [0.18, 0],
  [0.55, 1],
  [1, 0],
];
/** The ripple gradient's stop count — Phase 41's ring; all clear until stationRipple.ts plays it. */
const RIPPLE_STOPS = 5;

function Shape({ shape }: { shape: StationShape }) {
  return (
    <path
      d={shape.d}
      fill={shape.fill}
      fillOpacity={shape.fillOpacity}
      stroke={shape.stroke}
      strokeWidth={shape.strokeWidth}
      strokeOpacity={shape.strokeOpacity}
      strokeLinecap={shape.role === 'lines' ? 'round' : undefined}
      strokeLinejoin={shape.stroke ? 'round' : undefined}
    />
  );
}

// ========================================
// COMPONENT
// ========================================
function ChargingStationFragment({ localeId, station, fragment }: ChargingStationProps) {
  const litKey = useLocaleStore((s) => chargingColorsKey(s.locales[localeId]?.robots, station.id));
  const hpfHz = useAudioStore((s) => s.globalAudio.filterHPF.frequency);
  const lpfHz = useAudioStore((s) => s.globalAudio.filterLPF.frequency);
  const eqLow = useAudioStore((s) => s.globalAudio.eq3.low);
  const eqMid = useAudioStore((s) => s.globalAudio.eq3.mid);
  const eqHigh = useAudioStore((s) => s.globalAudio.eq3.high);

  const roll = getStationRoll(station.gemSeed);
  const { gap, band, spread, falloff } = stationDials({ hpfHz, lpfHz, eqLow, eqMid, eqHigh });
  const geometry = useMemo(
    () => stationGeometry(roll, { gap, band, spread, falloff }),
    [roll, gap, band, spread, falloff],
  );
  const paint = useMemo(() => stationPaint(geometry, roll.accent, parseColorsKey(litKey)), [geometry, roll.accent, litKey]);

  // The front fragment holds the ripple, which the work loop drives (stationRipple.ts). A layout
  // effect, so it's registered before the robots' own mount effects reach the loop.
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    if (fragment !== 'front' || !ref.current) return;
    const key = `station-front-${station.id}`;
    setRef(key, ref.current);
    return () => deleteRef(key);
  }, [fragment, station.id]);

  const haloId = `station-halo-${station.id}`;
  const rippleId = `station-ripple-${station.id}`;
  const shapes = (list: StationShape[]) => list.map((s) => <Shape key={s.key} shape={s} />);

  return (
    <g
      ref={ref}
      className={`station station--${fragment}`}
      data-station-id={station.id}
      data-station-fragment={fragment}
      transform={`translate(${station.center.x} ${station.center.y})`}
      pointerEvents="none"
      aria-hidden="true"
    >
      {fragment === 'l4' && shapes(paint.l4)}
      {fragment === 'l3' && shapes(paint.l3)}
      {fragment === 'front' && (
        <>
          {shapes(paint.l2)}
          <defs>
            <radialGradient id={haloId}>
              {HALO_STOPS.map(([offset, share]) => (
                <stop key={offset} offset={offset} stopColor={roll.accent} stopOpacity={share * STATION_HALO_PEAK} />
              ))}
            </radialGradient>
            <radialGradient id={rippleId}>
              {Array.from({ length: RIPPLE_STOPS }, (_, i) => (
                <stop key={i} offset={i / (RIPPLE_STOPS - 1)} stopColor={roll.accent} stopOpacity={0} />
              ))}
            </radialGradient>
          </defs>
          <circle className="station__halo" r={STATION_HALO_RADIUS} fill={`url(#${haloId})`} opacity={paint.haloOpacity} />
          <circle className="station__ripple" r={STATION_HALO_RADIUS} fill={`url(#${rippleId})`} opacity={0} />
          {shapes(paint.l1)}
        </>
      )}
    </g>
  );
}

/** One fragment of a charging station; memoised so a scene re-render passes it by. */
export const ChargingStation = memo(ChargingStationFragment);
