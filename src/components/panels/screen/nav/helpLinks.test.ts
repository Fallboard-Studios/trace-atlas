import { describe, it, expect, beforeEach } from 'vitest';
import { SEND_SCHEMAS_WITH_HELP_LINKS, colourRoomSubTab } from './helpLinks';
import { back } from './navActions';
import { useUIStore, type FleetParamsGroup, type SelectedFleetParamsEffect } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { ROBOT_SEND_SCHEMAS } from '@/data/robotOptionsConfig';
import { ROBOT_SEND_FIELDS, type RobotSendField } from '@/data/robotSends';
import { CONTENT, type ContentKey } from '@/content';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';

/*
 * docs/tasks/HELP_POPOVER_LINKS.md Task 4 (docs/specs/HELP_POPOVER_LINKS.md §1.4): the five sends' help links, each
 * named for the effect it opens and landing Fleet Params on that effect's tab and sub-tab; Grit's on the first Color
 * effect with its Mix up, read at the press.
 */

const UI_INITIAL = useUIStore.getInitialState();
const AUDIO_INITIAL = useAudioStore.getState();
const ui = () => useUIStore.getState();

/** Spec §1.4's table, written out here so the test does not read the module's own. Grit's tab is the Color room's
 *  first sub-tab with every Mix at its default 0. */
const DESTINATIONS: readonly (readonly [RobotSendField, ContentKey, FleetParamsGroup, SelectedFleetParamsEffect])[] = [
  ['reverbSend', 'fleet.reverb', 'timeSpace', 'reverb'],
  ['delaySend', 'fleet.delay', 'timeSpace', 'delay'],
  ['gritSend', 'fleet.colour', 'colour', 'distortion'],
  ['shimmerSend', 'fleet.frequencyShifter', 'modulation', 'frequencyShifter'],
  ['doubleSend', 'fleet.chorus', 'modulation', 'chorus'],
];

/** A robot on Levels > Sends, where a send's "?" sits: not Fleet Params, not its default tab. */
function onRobotSends() {
  useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'volume', selectedSubsection: 'sends' });
}

/** The three Color Mixes, set in the store after the module loaded. */
function setColourMixes(distortion: number, chebyshev: number, bitCrusher: number) {
  const globalAudio = useAudioStore.getState().globalAudio;
  useAudioStore.setState({
    globalAudio: {
      ...globalAudio,
      distortion: { ...globalAudio.distortion, wet: distortion },
      chebyshev: { ...globalAudio.chebyshev, wet: chebyshev },
      bitCrusher: { ...globalAudio.bitCrusher, wet: bitCrusher },
    },
  });
}

const link = (field: RobotSendField) => SEND_SCHEMAS_WITH_HELP_LINKS[field].help!.link!;

beforeEach(() => {
  useUIStore.setState(UI_INITIAL, true);
  useAudioStore.setState(AUDIO_INITIAL, true);
});

describe('SEND_SCHEMAS_WITH_HELP_LINKS', () => {
  it('has one schema per send, in the table order', () => {
    expect(Object.keys(SEND_SCHEMAS_WITH_HELP_LINKS)).toEqual([...ROBOT_SEND_FIELDS]);
  });

  it.each(DESTINATIONS)('%s: the link is named for %s', (field, content) => {
    expect(link(field).name).toBe(CONTENT[content].human);
  });

  it.each(DESTINATIONS)('%s: go() from a robot on Levels > Sends lands Fleet Params on %s, %s / %s', (field, _content, section, subsection) => {
    onRobotSends();
    link(field).go();
    expect(ui()).toMatchObject({ activeHubTile: 'audioRig', fleetParamsSection: section, fleetParamsSubsection: subsection });
  });

  it.each(DESTINATIONS)('%s: go() is a step, and back() returns to the robot on Levels > Sends', (field) => {
    onRobotSends();
    link(field).go();
    expect(ui().navTrail).toHaveLength(1);
    back();
    expect(ui()).toMatchObject({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'volume', selectedSubsection: 'sends' });
  });

  it.each(ROBOT_SEND_FIELDS)('%s: keeps the send schema\'s words, bounds and help text', (field) => {
    const { help, ...rest } = SEND_SCHEMAS_WITH_HELP_LINKS[field];
    const { help: plainHelp, ...plainRest } = ROBOT_SEND_SCHEMAS[field];
    expect(rest).toEqual(plainRest);
    expect(plainHelp?.human).toBeTruthy();
    expect(help).toMatchObject(plainHelp!);
  });

  it.each(ROBOT_SEND_FIELDS)('%s: the same object on every read, so the slider memo holds', (field) => {
    const first = SEND_SCHEMAS_WITH_HELP_LINKS[field];
    expect(SEND_SCHEMAS_WITH_HELP_LINKS[field]).toBe(first);
    expect(first.help).toBe(SEND_SCHEMAS_WITH_HELP_LINKS[field].help);
  });

  it('leaves the send table\'s own schemas without a link (they stay plain data)', () => {
    for (const field of ROBOT_SEND_FIELDS) {
      expect(ROBOT_SEND_SCHEMAS[field].help).not.toHaveProperty('link');
    }
  });
});

describe('Grit: the first Color effect with its Mix up', () => {
  it.each<[string, [number, number, number], SelectedFleetParamsEffect]>([
    ['only Chebyshev above 0', [0, 0.4, 0], 'chebyshev'],
    ['only Bit Crusher above 0', [0, 0, 0.7], 'bitCrusher'],
    ['Distortion and Bit Crusher both above 0', [0.2, 0, 0.7], 'distortion'],
    ['Chebyshev and Bit Crusher both above 0', [0, 0.5, 0.5], 'chebyshev'],
    ['all three at 0', [0, 0, 0], 'distortion'],
  ])('%s opens %s', (_case, [distortion, chebyshev, bitCrusher], expected) => {
    setColourMixes(distortion, chebyshev, bitCrusher);
    expect(colourRoomSubTab(useAudioStore.getState().globalAudio)).toBe(expected);
    onRobotSends();
    link('gritSend').go();
    expect(ui()).toMatchObject({ activeHubTile: 'audioRig', fleetParamsSection: 'colour', fleetParamsSubsection: expected });
  });

  it('reads the Mixes at the press: two presses either side of a change land on two tabs', () => {
    setColourMixes(0, 0, 0.3);
    onRobotSends();
    link('gritSend').go();
    expect(ui().fleetParamsSubsection).toBe('bitCrusher');

    setColourMixes(0, 0.3, 0.3);
    onRobotSends();
    link('gritSend').go();
    expect(ui().fleetParamsSubsection).toBe('chebyshev');
  });

  it('a Mix exactly at 0 is not up: a tiny Mix is', () => {
    setColourMixes(0, 0, 0.01);
    expect(colourRoomSubTab(useAudioStore.getState().globalAudio)).toBe('bitCrusher');
    expect(colourRoomSubTab(DEFAULT_GLOBAL_AUDIO_SETTINGS)).toBe('distortion');
  });

  it('the link keeps its words whatever the Mixes: always the Color room\'s name', () => {
    setColourMixes(0, 0.5, 0);
    expect(link('gritSend').name).toBe(CONTENT['fleet.colour'].human);
  });
});
