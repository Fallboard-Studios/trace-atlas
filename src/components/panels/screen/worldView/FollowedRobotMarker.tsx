// ========================================
// IMPORTS
// ========================================
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import gsap from 'gsap';
import { useShallow } from 'zustand/react/shallow';

import { getFollowedRobotId, subscribeFollowedRobot } from '@/animation/deckCamera';
import { getRobotGem, gemWidth, GEM_CANVAS_H } from '@/components/robot/gem/polygon';
import { BACK_LAYER_SCALE } from '@/constants';
import { fill } from '@/content';
import { JOB_TYPE_LABELS, UNASSIGNED_JOB_LABEL } from '@/data/robotSelectionConfig';
import { useLocaleStore } from '@/stores/localeStore';
import { getRef } from '@/utils/refs';

// ========================================
// CONSTANTS
// ========================================
/** Side of the square drawn around a front-row robot, in scene units; a back-row robot's smaller
 *  drawing (`BACK_LAYER_SCALE`) gets a proportionally smaller square. */
const MARKER_SIDE = 90;
/** The frame wears IntroPanel's border (`4px double` plus `inset 0 0 8px` of the same colour), drawn in
 *  scene units: a 4-wide band split in thirds (line, gap, line), and the inset glow inside it. */
const BORDER_WIDTH = 4;
const BORDER_LINE = BORDER_WIDTH / 3;
const BORDER_RADIUS = 4;
const GLOW_BLUR = 4; // stdDeviation of a CSS 8px blur
const GLOW_REACH = 24; // how far past the inner edge the glow's source ring runs, so the blur stays full to the edge
/** The ids of the glow's clip and blur. Only one marker ever exists, so they are fixed. */
const GLOW_CLIP_ID = 'followed-marker-glow-clip';
const GLOW_BLUR_ID = 'followed-marker-glow-blur';
/** Gap between the square's top line and the caption's baseline. */
const CAPTION_GAP = 6;
const CAPTION_FONT_SIZE = 18.6;
/** The caption's dark outline, so it reads over any water or building behind it. */
const CAPTION_OUTLINE = '#0c1c4f';

// ========================================
// COMPONENT
// ========================================

interface MarkerProps {
  robotId: string;
  localeId: string;
}

/** What the marker reads of a robot: strings and a number, so another write to the robot (a battery
 *  tick) leaves it, and the scene around it, alone. */
function useMarkerRobot(robotId: string, localeId: string) {
  return useLocaleStore(useShallow((s) => {
    const robot = s.locales[localeId]?.robots.find((r) => r.id === robotId);
    return robot
      ? { name: robot.name ?? robot.id, job: robot.job, color: robot.identityColor, gemSeed: robot.gemSeed, back: robot.layer === 'background' }
      : null;
  }));
}

function Marker({ robotId, localeId }: MarkerProps) {
  const robot = useMarkerRobot(robotId, localeId);
  const ref = useRef<SVGGElement>(null);
  const gemSeed = robot?.gemSeed;

  // Rides the robot: each frame the marker takes the centre of the robot's gem canvas from its
  // `.robot` group's live x/y (the swim and the job moves write them with GSAP), and hides while the
  // robot has no group. Placed once before paint too, so it never shows a frame at the origin.
  useLayoutEffect(() => {
    if (gemSeed === undefined) return undefined;
    const gem = getRobotGem(gemSeed);
    const half = { x: gemWidth(gem) / 2, y: GEM_CANVAS_H / 2 };
    const place = () => {
      const g = ref.current;
      if (!g) return;
      const body = getRef(`robot-${robotId}`);
      if (!body) {
        g.setAttribute('visibility', 'hidden');
        return;
      }
      gsap.set(g, { x: Number(gsap.getProperty(body, 'x')) + half.x, y: Number(gsap.getProperty(body, 'y')) + half.y });
      g.setAttribute('visibility', 'visible');
    };
    place();
    gsap.ticker.add(place);
    return () => gsap.ticker.remove(place);
  }, [robotId, gemSeed]);

  if (!robot) return null;
  const side = robot.back ? MARKER_SIDE * BACK_LAYER_SCALE : MARKER_SIDE;
  const job = (robot.job ? JOB_TYPE_LABELS[robot.job] : UNASSIGNED_JOB_LABEL).humanLabel;

  // The inner (padding) edge, where the border ends and the glow begins; the glow is a ring from there
  // outwards, blurred and clipped to the inside, which is what an inset box-shadow is.
  const inner = side / 2 - BORDER_WIDTH;
  const reach = inner + GLOW_REACH;
  const glowRing = `M ${-reach} ${-reach} H ${reach} V ${reach} H ${-reach} Z M ${-inner} ${-inner} V ${inner} H ${inner} V ${-inner} Z`;

  return (
    <g ref={ref} data-followed-robot={robotId} visibility="hidden" pointerEvents="none" aria-hidden="true">
      <defs>
        <clipPath id={GLOW_CLIP_ID}>
          <rect x={-inner} y={-inner} width={2 * inner} height={2 * inner} />
        </clipPath>
        <filter id={GLOW_BLUR_ID} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={GLOW_BLUR} />
        </filter>
      </defs>
      {/* Outer line of the double border: its outer edge is the square's edge. */}
      <rect
        x={-side / 2 + BORDER_LINE / 2}
        y={-side / 2 + BORDER_LINE / 2}
        width={side - BORDER_LINE}
        height={side - BORDER_LINE}
        rx={BORDER_RADIUS}
        fill="none"
        stroke={robot.color}
        strokeWidth={BORDER_LINE}
      />
      {/* Inner line: the gap (one line wide) sits between the two. */}
      <rect
        x={-inner - BORDER_LINE / 2}
        y={-inner - BORDER_LINE / 2}
        width={2 * inner + BORDER_LINE}
        height={2 * inner + BORDER_LINE}
        fill="none"
        stroke={robot.color}
        strokeWidth={BORDER_LINE}
      />
      <g clipPath={`url(#${GLOW_CLIP_ID})`}>
        <path d={glowRing} fillRule="evenodd" fill={robot.color} filter={`url(#${GLOW_BLUR_ID})`} />
      </g>
      <text
        x={0}
        y={-side / 2 - CAPTION_GAP}
        textAnchor="middle"
        fill="#ffffff"
        stroke={CAPTION_OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
        paintOrder="stroke"
        fontSize={CAPTION_FONT_SIZE}
        fontWeight={600}
      >
        {fill('probe.followMarker', { name: robot.name, job })}
      </text>
    </g>
  );
}

/**
 * The square and caption around the robot the Deck camera is floating to or following (the
 * indicator Crawford asked for after Checkpoint A of docs/tasks/DECK_CAMERA_FOLLOW.md): a 90 x 90
 * double border and inset glow (IntroPanel's) in the robot's identity colour, and "name | job" just above its top line. A sibling
 * overlay, not part of the robot, so the gem body is untouched (CLAUDE.md "Visual Mapping"). Lives
 * in a moving scene layer, because it moves every frame; in a static one it would repaint the
 * foreground factories each frame.
 */
export function FollowedRobotMarker({ localeId }: { localeId: string }) {
  const robotId = useSyncExternalStore(subscribeFollowedRobot, getFollowedRobotId);
  return robotId === null ? null : <Marker robotId={robotId} localeId={localeId} />;
}
