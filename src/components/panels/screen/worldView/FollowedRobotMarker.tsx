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
const MARKER_SIDE = 60;
/** Gap between the square's top line and the caption's baseline. */
const CAPTION_GAP = 6;
const CAPTION_FONT_SIZE = 14;
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

  return (
    <g ref={ref} data-followed-robot={robotId} visibility="hidden" pointerEvents="none" aria-hidden="true">
      <rect x={-side / 2} y={-side / 2} width={side} height={side} fill="none" stroke={robot.color} strokeWidth={2} />
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
 * indicator Crawford asked for after Checkpoint A of docs/tasks/DECK_CAMERA_FOLLOW.md): a 60 x 60
 * border in the robot's identity colour, and "name | job" just above its top line. A sibling
 * overlay, not part of the robot, so the gem body is untouched (CLAUDE.md "Visual Mapping"). Lives
 * in a moving scene layer, because it moves every frame; in a static one it would repaint the
 * foreground factories each frame.
 */
export function FollowedRobotMarker({ localeId }: { localeId: string }) {
  const robotId = useSyncExternalStore(subscribeFollowedRobot, getFollowedRobotId);
  return robotId === null ? null : <Marker robotId={robotId} localeId={localeId} />;
}
