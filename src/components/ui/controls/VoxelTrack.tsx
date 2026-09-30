import { memo, useState, type CSSProperties } from 'react';
import { CabinetBox } from './CabinetBox';
import {
  computeVoxelFillBackground,
  computeVoxelStraddleSizeFraction,
  computeVoxelBoxPopDistance,
  computeVoxelBoxZIndex,
  computeVoxelPopStaggerDelays,
  type VoxelBoxState,
} from '@/utils/voxelTrackMath';
import './VoxelTrack.css';

interface VoxelTrackProps {
  states: VoxelBoxState[];
  boxSize: number;
  gap: number;
  axis: 'horizontal' | 'vertical';
  /** Unique per-slider-instance prefix; each box gets `${timelineKeyPrefix}-${i}`. */
  timelineKeyPrefix: string;
}

/**
 * Shared voxel-track rendering (roadmap Phase 11.1.3) — a row (or, vertical,
 * a bottom-to-top column) of uniform CabinetBox facades standing in for a
 * slider's traditional track+handle. Purely a pointer-events: none visual
 * overlay; SliderLinear.tsx (and, unchanged, SliderLog/SliderCenteredZero in
 * 11.1.4/11.1.5) keeps Radix's own Slider.Root/Track/Thumb fully in charge
 * of interaction — see docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.10.
 *
 * Every CabinetBox instance below gets skipMountAnimation (2026-09-09 fix).
 * The box at the ordinary/straddling role boundary — a plain CabinetBox vs.
 * the straddling slot's two-piece glow+flat wrapper below — changes element
 * type at the same React key every time the straddling index moves, which
 * forces a remount even though the box was already visible a frame earlier.
 * Without this flag, CabinetBox's own "animate in from the opposite state on
 * first mount" behavior (correct for Button/Toggle, where a first mount is a
 * genuinely new element) replayed a full flat↔popped tween on that remount —
 * a spurious wall flash with no real transition behind it. See
 * CabinetBox.tsx's own CabinetBoxProps.skipMountAnimation comment.
 */
function VoxelTrackInner({ states, boxSize, gap, axis, timelineKeyPrefix }: VoxelTrackProps) {
  const tokens = {
    '--voxel-box-size': `${boxSize}px`,
    '--voxel-gap': `${gap}px`,
  } as CSSProperties;

  // Staggered pop-out (Crawford's own request, 2026-09-30): a non-smooth value change (a swell
  // tick's instant snap, a keyboard Home/End jump, a session load) can flip several ordinary
  // boxes' filled/flat state in the same render — without this, every one of them starts its own
  // pop tween the same frame, reading as one simultaneous block rather than a sweep across the
  // track. `popStaggerSnapshot` holds the LAST render's own (states, filled, straddleIndex) plus
  // the delays computed from comparing it against the one before — "storing information from
  // previous renders" via a conditional setState call during render (react.dev's own sanctioned
  // pattern for this), never a ref: `react-hooks/refs` forbids reading ref.current during render
  // (only from an effect/event handler), which a naive prevFilledRef/prevStraddleIndexRef version
  // of this violated. Calling setState here when `states` changed re-renders synchronously before
  // paint — no extra visible frame, and no risk of a StrictMode double-render desyncing "previous"
  // from what actually got committed, the way a render-time ref mutation would.
  const currFilled = states.map((state) => !state.isStraddling && state.popT === 1);
  const rawStraddleIndex = states.findIndex((state) => state.isStraddling);
  const currStraddleIndex = rawStraddleIndex === -1 ? null : rawStraddleIndex;

  const [popStaggerSnapshot, setPopStaggerSnapshot] = useState<{
    states: VoxelBoxState[];
    filled: boolean[];
    straddleIndex: number | null;
    delays: number[];
  } | null>(null);

  let popStaggerDelays: number[];
  if (popStaggerSnapshot === null || popStaggerSnapshot.states !== states) {
    popStaggerDelays = popStaggerSnapshot
      ? computeVoxelPopStaggerDelays(popStaggerSnapshot.filled, currFilled, popStaggerSnapshot.straddleIndex)
      : currFilled.map(() => 0);
    setPopStaggerSnapshot({ states, filled: currFilled, straddleIndex: currStraddleIndex, delays: popStaggerDelays });
  } else {
    popStaggerDelays = popStaggerSnapshot.delays;
  }

  return (
    <div className="sc-voxel-track" data-axis={axis} style={tokens} aria-hidden="true">
      {states.map((state, i) => {
        // Each box's own pop distance ceiling is fixed by its row position
        // (index i of states.length total) by default, never by the
        // slider's current value — a box near the minimum end tops out
        // shallow even while it's the one currently popped. SliderCenteredZero
        // (roadmap 11.1.5) overrides this with a LOCAL index/count pair —
        // distance from its own side's zero seam, not the box's raw row
        // position — via VoxelBoxState's own optional popDistanceLocalIndex/
        // popDistanceLocalCount fields; SliderLinear/SliderLog never set
        // either, so their own falloff is unaffected. See
        // computeVoxelBoxPopDistance and docs/specs/
        // OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md §1.3.
        const popDistance = computeVoxelBoxPopDistance(
          state.popDistanceLocalIndex ?? i,
          state.popDistanceLocalCount ?? states.length,
        );
        // A box's walls bleed toward its down-right neighbor along the
        // fixed oblique vector — this slot's z-index makes sure it paints
        // over that neighbor rather than under it. See
        // computeVoxelBoxZIndex.
        const zIndex = computeVoxelBoxZIndex(i, states.length, axis);

        // The straddling box (the one representing the slider's exact
        // current value) is identified by isStraddling, never popT — every
        // filled box is ALSO popT: 1, not just the straddling one (found
        // live, 2026-09-09: branching on `popT !== 1` here previously made
        // EVERY filled box take the 2-piece straddle path below, each
        // carrying a hidden, always-0-width "flat" CabinetBox along with
        // it). Every non-straddling box renders as a single, ordinary,
        // full-size CabinetBox.
        if (!state.isStraddling) {
          return (
            <CabinetBox
              key={i}
              popped={state.popT}
              boxHeight={boxSize}
              popDistance={popDistance}
              zIndex={zIndex}
              skipMountAnimation
              delay={popStaggerDelays[i]}
              timelineKey={`${timelineKeyPrefix}-${i}`}
            >
              <div
                className="sc-voxel-track__fill"
                style={{ background: computeVoxelFillBackground(state.fillPercent, axis) }}
              />
            </CabinetBox>
          );
        }

        // The straddling slot never changes its own footprint or position —
        // it's always exactly boxSize, same as every other box. Internally
        // it's two adjacent CabinetBox instances, flush against each other,
        // that always sum to exactly boxSize: a fully-popped glowing piece
        // (min side by default) and a fully-flat dark piece (max side),
        // matching how a normal fully-filled/fully-empty box already renders
        // elsewhere in the row — replaces the old internal fill gradient
        // with a real geometric split instead of a color transition.
        // data-flip (state.flipStraddleFill, roadmap 11.1.5 bugfix) swaps
        // which side is which via CSS `order` — SliderCenteredZero's
        // negative side needs its filled portion on the MAX (seam) side, not
        // the min side; DOM order (and the z-index rule below, which targets
        // :last-child structurally) is unaffected either way. The glow piece's
        // own size floors above zero (computeVoxelStraddleSizeFraction) so
        // it never fully disappears at value === min; the flat piece is the
        // exact remainder (boxSize - glowSize, never independently derived)
        // so the two can never drift apart from summing to boxSize, and
        // legitimately reaches zero at value === max — a fully-popped box
        // at the maximum is correct, not a bug.
        const glowSize = boxSize * computeVoxelStraddleSizeFraction(state.fillPercent);
        const flatSize = boxSize - glowSize;
        const isHorizontal = axis === 'horizontal';

        return (
          <div
            key={i}
            className="sc-voxel-track__straddle"
            data-axis={axis}
            data-flip={state.flipStraddleFill ? 'true' : undefined}
            style={{ zIndex }}
          >
            <CabinetBox
              popped={1}
              boxHeight={boxSize}
              popDistance={popDistance}
              frontWidth={isHorizontal ? glowSize : undefined}
              frontHeight={isHorizontal ? undefined : glowSize}
              skipMountAnimation
              timelineKey={`${timelineKeyPrefix}-${i}-glow`}
            >
              <div
                className="sc-voxel-track__fill"
                style={{ background: computeVoxelFillBackground(100, axis) }}
              />
            </CabinetBox>
            <CabinetBox
              popped={0}
              boxHeight={boxSize}
              popDistance={popDistance}
              frontWidth={isHorizontal ? flatSize : undefined}
              frontHeight={isHorizontal ? undefined : flatSize}
              skipMountAnimation
              timelineKey={`${timelineKeyPrefix}-${i}-flat`}
            >
              <div
                className="sc-voxel-track__fill"
                style={{ background: computeVoxelFillBackground(0, axis) }}
              />
            </CabinetBox>
          </div>
        );
      })}
    </div>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 5) — every prop here is a
// primitive or `states` (an array), so the default shallow compare is correct; no custom
// comparator. This bail-out is only effective once `states` is itself a referentially stable
// array across unrelated re-renders — see SliderLinear/SliderLog/SliderCenteredZero's own
// useMemo wrap (Tasks 1-3) — a fresh (even deep-equal) array reference still re-executes this
// component's render body every time, by design (shallow compare, not deep).
export const VoxelTrack = memo(VoxelTrackInner);
