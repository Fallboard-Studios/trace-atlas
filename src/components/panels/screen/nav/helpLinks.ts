import { FLEET_PARAMS_SUBSECTIONS, openFleetParamsAt } from './navActions';
import { ROBOT_SEND_SCHEMAS } from '@/data/robotOptionsConfig';
import { recordByField, type RobotSendField } from '@/data/robotSends';
import { useAudioStore } from '@/stores/audioStore';
import { labels, type ContentKey } from '@/content';
import type { GlobalAudioSettings } from '@/types/globalAudio';
import type { SliderLinearSchema } from '@/types/controls';
import type { LfoLaneId } from '@/types/lfo';
import type { SelectedFleetParamsEffect } from '@/stores/uiStore';

/**
 * Help links (docs/specs/HELP_POPOVER_LINKS.md §1.4): the screen-side code that adds a "View {name} settings" link to a
 * control's help. Each link goes through navActions' openFleetParamsAt, so it is a step on the trail. The send table
 * and the data configs stay free of navigation: the destinations live here.
 */

/** The Color room's three effects, in chain order: Fleet Params' Colour sub-tabs, named once there. Each is also a
 *  GlobalAudioSettings block with a `wet` Mix. */
type ColourEffectKey = 'distortion' | 'chebyshev' | 'bitCrusher';
const COLOUR_CHAIN = FLEET_PARAMS_SUBSECTIONS.colour.map((sub) => sub.id as ColourEffectKey);

/** Grit's destination (spec §1.4): the first Color effect, in chain order, whose stored Mix is above 0; Distortion when
 *  none is, so the link always lands somewhere. Read at the press. */
export function colourRoomSubTab(globalAudio: Pick<GlobalAudioSettings, ColourEffectKey>): ColourEffectKey {
  return COLOUR_CHAIN.find((key) => globalAudio[key].wet > 0) ?? COLOUR_CHAIN[0];
}

/** Fleet Params' LFOs sub-tab for each lane. */
const LANE_SUB_TAB: Record<LfoLaneId, SelectedFleetParamsEffect> = { a: 'laneA', b: 'laneB', c: 'laneC', d: 'laneD' };

/** The LFO lane picker's link (spec §1.4): the LFOs tab on the picked lane, Core LFO (lane A) when the lane is Off.
 *  A module function, so the three drawers that hand it to LfoLink pass one stable value. */
export function openLfoLaneSettings(lane: LfoLaneId | null): void {
  openFleetParamsAt('lfoBank', LANE_SUB_TAB[lane ?? 'a']);
}

/** Where a send's link goes: the entry it is named from and the jump. Keyed by RobotSendField, so a sixth send fails
 *  to compile until it has one. */
interface SendDestination {
  content: ContentKey;
  open: () => void;
}

const SEND_DESTINATIONS: Record<RobotSendField, SendDestination> = {
  reverbSend: { content: 'fleet.reverb', open: () => openFleetParamsAt('timeSpace', 'reverb') },
  delaySend: { content: 'fleet.delay', open: () => openFleetParamsAt('timeSpace', 'delay') },
  gritSend: { content: 'fleet.colour', open: () => openFleetParamsAt('colour', colourRoomSubTab(useAudioStore.getState().globalAudio)) },
  shimmerSend: { content: 'fleet.frequencyShifter', open: () => openFleetParamsAt('modulation', 'frequencyShifter') },
  doubleSend: { content: 'fleet.chorus', open: () => openFleetParamsAt('modulation', 'chorus') },
};

/** The five send sliders' schemas with their help links (spec §1.4), built once at module load so each is one stable
 *  object and the sliders' memo holds. SendRow reads these in place of ROBOT_SEND_SCHEMAS, which stays plain data. */
export const SEND_SCHEMAS_WITH_HELP_LINKS: Readonly<Record<RobotSendField, SliderLinearSchema>> = recordByField((spec) => {
  const schema = ROBOT_SEND_SCHEMAS[spec.field];
  const destination = SEND_DESTINATIONS[spec.field];
  const link = { name: labels(destination.content).humanLabel, go: destination.open };
  // Every send's entry has help today; one without would have no "?" to carry a link.
  return { ...schema, help: schema.help && { ...schema.help, link } };
});
