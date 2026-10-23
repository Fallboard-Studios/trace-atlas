# Phase Spec: Robot Sends — One Table for the Five Sends

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - No phone gate and no `npm run perf:audio` run (§3): the audio graph is untouched.

Source of intent: [docs/intent/robot-send-table.md](../intent/robot-send-table.md) (confirmed 2026-10-22 via
`interview-me`, four questions, four guesses confirmed). Roadmap item **55**
([docs/todo/roadmap.md](../todo/roadmap.md#55-robot-sends-one-table-for-the-five-sends)), raised at the Robot Effect
Sends ([50.7](ROBOT_EFFECT_SENDS.md)) code review and put next on the roadmap by Crawford the same day. 50.7 merged as
PR #569 (`608c5b92`), so every one of the five sends is on `main`. **A refactor with no change in behaviour**: the five
per-robot sends (Reverb, Delay, Grit, Shimmer, Double) are written out one field at a time in about fifteen places; after
this phase each is one row of one table and every consumer iterates it.

Survey basis (2026-10-22, against `main` at `608c5b92`; every citation below was read, not recalled):

- **The prime, four times.** `{ reverb: robot.reverbSend, delay: robot.delaySend, grit: robot.gritSend, shimmer:
  robot.shimmerSend, double: robot.doubleSend }` at `src/engine/AudioEngine.ts:348` (`loadInstruments`' post-load pass)
  and `:1002` (`reReserveVoice`), `src/systems/spawnSystem.ts:995` (`spawnRobot`) and `:1156` (`reRegisterAllRobotsAudio`).
  The only guard is a regex source scan, `src/engine/reservationSendsPrime.test.ts`, which counts `.reserveVoice(` against
  `.updateRobotSends(` per file and checks each prime literal names all five keys.
- **The field list, seven times.** `ROBOT_SEND_FIELDS` (`src/data/robotSendLoadingRanges.ts:11`, read only for its type
  and by `generateRobotSends`); `SEND_ATTRIBUTES` (`src/systems/audioSwells.ts:185`); `SEND_PRIME_KEYS`
  (`src/utils/sessionDiff.ts:48`, field → engine key, read by three loops at `:336`, `:480`, `:657`); the literal clamp
  list in `localeStore.updateRobot` (`src/stores/localeStore.ts:214`); `resolveCompanyOptions`' five `?? 0` fallbacks
  (`src/systems/companyOptions.ts:43–47`); the five rows of `ROBOT_SWELL_FIELD_RANGE` (`src/data/audioSwellRanges.ts:27–29`);
  the five entries at the end of `SWELL_ROBOT_ATTRIBUTE_IDS` (`src/types/audioSwell.ts:68`).
- **The actions, ten functions.** `applyReverbSend` … `applyDoubleSend` (display percent → `/ SEND_DISPLAY_SCALE`) and
  `applyReverbSendValue` … `applyDoubleSendValue` (stored fraction: NaN dropped whole, `clampSend`, `updateRobot` with the
  one field, `updateRobotSends` with the one engine key), `src/systems/robotOptionsActions.ts:58–115`. `audioSwells.ts`'s
  `writeRobotSend` (`:226`) is a five-way switch over the `*Value` forms.
- **The screens, ten handlers.** `handleReverbSendChange` … `handleDoubleSendChange`
  (`src/components/panels/screen/screens/RobotScreen.tsx:273–294`: `cancelSwellForRobotAttribute(id, field)` then the
  action) beside five `isRobotAttributeSwelling` flags (`:205–209`), all passed as ten props (`:358–369`) and listed in the
  renderer's memo deps (`:430–432`). `onReverbSendChange` … `onDoubleSendChange` (`src/components/company/useCompanyOptions.ts:380–425`:
  NaN guard, per-member cancel + action, `patchSnapshot({ <field>: clampSend(pct / SEND_DISPLAY_SCALE) })`) beside five
  swelling flags in the `CompanyOptions` interface (`:113–118`, `:125–129`), passed through by
  `src/components/company/CompanyOptionsSection.tsx:69–78`. `AudioSettingSection` (`src/components/robot/AudioSettingSection.tsx`)
  declares five `on*SendChange` (`:66–71`) and five `*SendSwelling` props (`:86–91`) and renders five rows (`:180–194`),
  each `<div className="audio-setting-section__<key>-row"><SliderLinear schema={<KEY>_SEND_SCHEMA}
  value={toSendDisplay(value.<field>)} … /></div>`; the wrapper classes have no CSS rule (the comment at `:177` says so).
- **The schemas, five.** `REVERB_SEND_SCHEMA` … `DOUBLE_SEND_SCHEMA` (`src/data/robotOptionsConfig.ts:137–190`), identical
  but for `id: 'robotOptions.<field>'` and `...labels('probe.<field>')`.
- **The engine.** `reserveVoice` builds the five gains one by one (`src/engine/AudioEngine.ts:815–820`), connects them
  (`:846–857`: Reverb and Delay by their room getters, the three room sends in a `ROOM_KEYS` loop through
  `getGlobalRoomInput`), stores them as five named `VoiceEntry` fields (`:862`; `src/engine/audioEngine/voiceEntry.ts:16–25`),
  and builds five stubs again on the fallback path (`:895–900`). `disposeVoiceNodes` lists the five by name (`voiceEntry.ts:41–45`).
  `updateRobotSends(robotId, sends: { reverb?; delay?; grit?; shimmer?; double? })` (`:1149–1175`) writes Reverb and Delay
  one way and the three room sends in a loop that also calls `setRoomFeeder`.
- **The share codec.** `CompactRobotOverrideDiff` declares `rs` / `ds` / `gr` / `sm` / `db` (`src/utils/sessionShareUtils.ts:120–126`);
  `toCompactRobotOverrideDiff` writes them in five lines (`:268–272`, after `p`, before `dy`) and
  `fromCompactRobotOverrideDiff` reads them in five (`:302–307`) through `isSendFraction`.
- **What already is table-driven and stays.** `generateRobotSends` / `generateRobotSendsFallback` (`spawnSystem.ts:583–620`)
  read `ROBOT_SEND_LOADING_RANGES` and return `Record<RobotSendField, number>`, spread into the robot literal (`:967`) and the
  baseline (`:683`, `:700`). `SEND_FIELD_ROOM` / `SendRoomKey` (`robotSendLoadingRanges.ts:39–44`) map the three exclusive
  sends to their rooms; `bypassCell.ts`'s `RoomKey` is that type (`:371`).
- **What pins the old names.** 72 references to the ten actions in seven test files (`robotOptionsActions.test.ts` 12,
  `RobotScreen.test.tsx` 20, `useCompanyOptions.test.ts` 18, `CompanyOptionsSection.test.tsx` 7, `audioSwells.test.ts` 6,
  the two docs guards 9). The docs guards (`src/docs/robotSendsDocs.test.ts`, `src/docs/robotEffectSendsDocs.test.ts`)
  each hold a `declared` table of `[description, file, regex]` rows that must match source, a `NOT_REPO_SYMBOLS` set for
  "names the spec records as deleted", a "spec §1 to §4" case that extracts every backticked code-shaped name from the
  historical spec's design sections and requires it in `src/`, and an `UPDATED_DOCS` case that does the same for the send
  lines of seven living docs. The living docs that name the actions or handlers: `docs/AUDIO_SYSTEM.md:271`,
  `docs/COMPANIES.md:66`, `:95`, `:101`, `docs/SESSION_STORAGE.md:155`.
- **The content guard** (`src/content/content.test.ts:46`) decides a key is referenced by searching consumer source for
  the quoted literal `'probe.reverbSend'`; a key built from a template is unreferenced and fails the suite. Its help-coverage
  walk (`:128–143`) recurses every exported object of `robotOptionsConfig`, so a `Record` of schemas is reached. The ESLint
  content rule (`eslint.config.js:71–95`) restricts literal label *values* and JSX text, not the argument of `labels()`.

**Assumptions** (each is a decision this spec makes; the intent left them open; §7 lists the ones worth a veto):

1. **One new data module, `src/data/robotSends.ts`, owns the wiring table.** `ROBOT_SEND_FIELDS` and `RobotSendField` move
   there (re-exported from `robotSendLoadingRanges.ts` is *not* done: the band table imports the type from the new module;
   bands are tuning, the table is wiring). Each row carries `field`, `engineKey`, `shareCode` and `contentKey`, the last as a
   quoted literal (the content guard). Nothing Tone-shaped lives in `src/data/`.
2. **The table's order is load-bearing and is today's order:** Reverb, Delay, Grit, Shimmer, Double. It is the prime order,
   the `updateRobotSends` write order, the row order on the screen, the codec's key order and the swell pool's tail order.
3. **The engine speaks engine keys** (`reverb` | `delay` | `grit` | `shimmer` | `double`, type `SendEngineKey`); robots,
   screens, the store and the swell tick speak field names. The table is the one place that maps between them; the mapping
   functions `engineKeyOf(field)` and `sendFieldOf(engineKey)` live beside it.
4. **`VoiceEntry` keeps one `sends: Record<SendEngineKey, Tone.Gain>` instead of five named gain fields.** `updateRobotSends`'
   parameter becomes `Partial<Record<SendEngineKey, number>>` (the same five optional keys, written as a type).
5. **One action pair replaces ten:** `applySend(robot, localeId, field, pct)` (display percent) and
   `applySendValue(robot, localeId, field, fraction)` (stored fraction), keyed by `RobotSendField`. The NaN rule, `clampSend`,
   the one-field `updateRobot` and the one-key `updateRobotSends` are exactly today's. The ten named functions are deleted,
   not wrapped.
6. **`AudioSettingSection` takes two send props in place of ten:** `onSendChange(field, pct)` and
   `sendSwelling?: Readonly<Record<RobotSendField, boolean>>`. `AudioSettingValue` keeps its five named number fields (the
   value mirrors `Robot`; the docs guards pin the shape; the robot screen's memo must enumerate its deps anyway). Rows render
   from the table through one memoised `SendRow` child; the wrapper class is `audio-setting-section__${engineKey}-row`, which
   is today's five class names to the letter.
7. **One `useSendSwellingFlags(robotId, source)` hook** in `useSwellingFlags.ts`, the ADSR / layer hooks' shape, replaces the
   five `isRobotAttributeSwelling` reads on both screens.
8. **The five `Robot` / `RobotAudioBaseline` / `RobotAudioOverrideDiff` / `CompanyOptionsSnapshot` fields stay by name**, and
   so do `CompactRobotOverrideDiff.rs` … `db`: the saved and shared formats are documented by those types. Only the code that
   copies between them iterates the table.
9. **The share codec stays byte-identical.** The two loops sit exactly where the five lines are (after `p`, before `dy`) and
   run in table order, so an encoded link is the same string before and after.
10. **The regex source scan (`reservationSendsPrime.test.ts`) is deleted.** With one `robotSendLevels(robot)` helper the
    only way to prime is to pass all five, and the parity test (assumption 11) is the behavioural guard the scan stood in for.
11. **One parity test, `src/systems/robotSendsParity.test.ts`, is the oracle.** Written and committed as the first task
    against unchanged code: run once with empty expectations to prove it reads real values (red), then the recorded values
    make it green, and the recording is never edited afterwards (the 50.7 T1 pattern, `spawnSystem.test.ts:838–855`). It
    pins (a) all five seeded sends for two twelve-robot rosters, (b) the full `updateRobotSends` call sequence — robot id,
    keys in object order, values — across spawn, `reRegisterAllRobotsAudio`, `reReserveVoice`, a session-diff restore, a
    share-link decode-and-restore and a swell tick, (c) the encoded share string for a fixed diff carrying all five sends, (d)
    `updateRobot`'s normalised robot for an out-of-range and a NaN send, and (e) `SWELL_ROBOT_ATTRIBUTE_IDS` as a literal.
    The fixture seeds a distinguishing, non-default value for every send (the memory rule on parity fixtures).
12. **The historical specs stay as written.** `ROBOT_SENDS.md` and `ROBOT_EFFECT_SENDS.md` get a header note pointing here;
    the deleted names join each guard's `NOT_REPO_SYMBOLS` (the `SEND_DELAY_QUIET_THRESHOLD` precedent) rather than being
    edited out of §1–4. The living docs' send lines are rewritten to the new names.
13. **No phone A/B, no `perf:audio` run.** The graph is the same nodes, connections and ramps; nothing is built, disposed or
    scheduled differently. The main-thread cost of a table lookup at a slider edit is nil.

---

## 1. Overview & Claude Explanation

Every place that today spells out the five robot sends — the four reservation primes, the ten actions, the ten screen
handlers, the five schemas, the five rows, the seven field lists, the codec's ten lines and the engine's two gain builds —
becomes a loop over one table, `ROBOT_SENDS` in `src/data/robotSends.ts`. A row names the robot field (`reverbSend`), the
engine key `updateRobotSends` takes (`reverb`), the share-link code (`rs`) and the content key of its slider's words
(`'probe.reverbSend'`, a literal). Beside the table: `robotSendLevels(robot)` builds the prime object every reservation site
hands the engine; `engineKeyOf` and `sendFieldOf` translate between the two key spaces. The ten `apply*Send*` actions become
`applySend` / `applySendValue` keyed by field; the swell tick, both screens' one `onSendChange(field, pct)` handler and the
company broadcast all go through them. `AudioSettingSection` renders its five rows from the table. The engine's voice entry
holds `sends: Record<SendEngineKey, Tone.Gain>`, built, connected, written and disposed by iteration. The session diff, the
store clamp, the company resolver, the swell ranges and the swell pool read the field list instead of carrying a copy.
Nothing a user sees, hears, saves or shares changes: a parity test recorded against `main` before the first refactor commit
pins the seeded values, every prime the engine receives in order, the encoded share string and the store's clamp, and the
full suite stays green. The ten named actions and the regex reservation scan are gone; a sixth send is one new row, a
`Robot` field, a `CompactRobotOverrideDiff` code, a content entry and a band.

### 1.1 Data shape — `src/data/robotSends.ts` (new)

```ts
import type { Robot } from '../types/Robot';
import type { SendRoomKey } from './robotSendLoadingRanges';

/** The five per-robot sends in the one order every consumer uses: the prime, the engine write, the screen rows, the share
 *  codec's keys and the swell pool's tail (docs/specs/ROBOT_SEND_TABLE.md assumption 2). A sixth send is a new row here. */
export const ROBOT_SEND_FIELDS = ['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend'] as const;
export type RobotSendField = (typeof ROBOT_SEND_FIELDS)[number];

/** The key AudioEngine.updateRobotSends takes for a send: the two fixed rooms by name, the three effect rooms by RoomKey. */
export type SendEngineKey = 'reverb' | 'delay' | SendRoomKey;
/** The send's key in a share link's CompactRobotOverrideDiff (docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md). */
export type SendShareCode = 'rs' | 'ds' | 'gr' | 'sm' | 'db';

export interface RobotSendSpec {
  readonly field: RobotSendField;
  readonly engineKey: SendEngineKey;
  readonly shareCode: SendShareCode;
  /** Written as a literal, never built from `field`: the content guard finds a key by its quoted text in source. */
  readonly contentKey: `probe.${RobotSendField}`;
}

export const ROBOT_SENDS: readonly RobotSendSpec[] = [
  { field: 'reverbSend',  engineKey: 'reverb',  shareCode: 'rs', contentKey: 'probe.reverbSend' },
  { field: 'delaySend',   engineKey: 'delay',   shareCode: 'ds', contentKey: 'probe.delaySend' },
  { field: 'gritSend',    engineKey: 'grit',    shareCode: 'gr', contentKey: 'probe.gritSend' },
  { field: 'shimmerSend', engineKey: 'shimmer', shareCode: 'sm', contentKey: 'probe.shimmerSend' },
  { field: 'doubleSend',  engineKey: 'double',  shareCode: 'db', contentKey: 'probe.doubleSend' },
];

export const ROBOT_SEND_BY_FIELD: Readonly<Record<RobotSendField, RobotSendSpec>>;   // built from ROBOT_SENDS
export const ROBOT_SEND_BY_ENGINE_KEY: Readonly<Record<SendEngineKey, RobotSendSpec>>;

export function engineKeyOf(field: RobotSendField): SendEngineKey;
export function sendFieldOf(key: SendEngineKey): RobotSendField;

/** The prime every reservation site hands updateRobotSends: all five, in table order, straight off the robot. */
export function robotSendLevels(robot: Pick<Robot, RobotSendField>): Record<SendEngineKey, number>;
```

A test pins `ROBOT_SENDS` row for row (fields, engine keys, codes, content keys, order) and that `ROBOT_SEND_FIELDS` equals
`ROBOT_SENDS.map((s) => s.field)` — the array is derived, so the two cannot drift. `robotSendLoadingRanges.ts` imports
`RobotSendField` from here and keeps `ROBOT_SEND_LOADING_RANGES`, `EXCLUSIVE_SEND_FIELDS`, `SEND_FIELD_ROOM` and `SendRoomKey`
(the band table and the roll order are tuning, not wiring).

### 1.2 Engine — `AudioEngine.ts`, `voiceEntry.ts`

```ts
// voiceEntry.ts
export interface VoiceEntry {
  composite: CompositeVoice;
  panner: Tone.Panner;
  busGain: Tone.Gain;
  busFilter: Tone.Filter;
  /** busFilter -> sends[key] -> that send's room; 0 = this robot is dry there (ROBOT_SENDS.md §1.4, ROBOT_EFFECT_SENDS.md §1.4). */
  sends: Readonly<Record<SendEngineKey, Tone.Gain>>;
}
// disposeVoiceNodes: the sends in table order, then panner, busGain, busFilter — today's order.
```

- `reserveVoice` builds the gains once, `buildSendGains(GainCtor | null)` → `Record<SendEngineKey, Tone.Gain>` (a live
  `Gain(0)` per key, or `makeStubGain(0)` when there is no constructor), on both the live path and the fallback path.
- Connection runs over `ROBOT_SENDS`: `busFilter → sends[key]`, then `sends[key] → sendTargetOf(key)` when the target
  exists. `sendTargetOf` is engine-side: `reverb` → `getGlobalReverbRoom()`, `delay` → `getGlobalDelayRoom()`, a room key →
  `getGlobalRoomInput(key)`. The per-send interleaving of the two `connect` calls differs from today's (Reverb and Delay were
  both tapped before either was connected to its room); edges are not timing, so this is not behaviour.
- `updateRobotSends(robotId, sends: Partial<Record<SendEngineKey, number>>)`: one loop in table order — skip `undefined` and
  `NaN`, `rampOrSet(entry.sends[key].gain, clampSend(v), SEND_RAMP_SECONDS)`, and for a key in `ROOM_KEYS`
  `setRoomFeeder(key, robotId, clampSend(v) > 0)`. Reverb and Delay have no feeder set, as today.
- The two primes become `AudioEngine.updateRobotSends(robot.id, robotSendLevels(robot))`.

### 1.3 Actions — `robotOptionsActions.ts`

```ts
/** A send slider's hand edit: the display percent, the Volume split (ROBOT_SENDS.md §1.5). The caller cancels the swell. */
export function applySend(robot: Robot, localeId: string, field: RobotSendField, pct: number): void {
  applySendValue(robot, localeId, field, pct / SEND_DISPLAY_SCALE);
}

/** The stored-fraction form the swell tick writes (a display percent does not round-trip every double). NaN is dropped whole. */
export function applySendValue(robot: Robot, localeId: string, field: RobotSendField, fraction: number): void {
  if (Number.isNaN(fraction)) return;
  const value = clampSend(fraction);
  useLocaleStore.getState().updateRobot(localeId, robot.id, { [field]: value });
  AudioEngine.updateRobotSends(robot.id, { [engineKeyOf(field)]: value });
}
```

The ten named functions are removed. `audioSwells.ts`'s `writeRobotSend` becomes `applySendValue(robot, localeId,
attribute, value)`; `SEND_ATTRIBUTES` is replaced by `ROBOT_SEND_FIELDS` and `isSendAttribute` reads it.

### 1.4 Screens — `AudioSettingSection`, `RobotScreen`, `useCompanyOptions`, `CompanyOptionsSection`

```ts
// AudioSettingSection.tsx — props: ten become two
interface AudioSettingSectionProps {
  …
  /** 0..100, the display-domain contract of onVolumeChange, for whichever send row moved. */
  onSendChange: (field: RobotSendField, pct: number) => void;
  /** Per send, true while an Audio Swell rides it (forwarded to that row's own `swelling`). */
  sendSwelling?: Readonly<Record<RobotSendField, boolean>>;
  …
}

// the rows, from the table; SendRow is a memo'd child so each row's onChange is stable
{ROBOT_SENDS.map((spec) => (
  <SendRow key={spec.field} spec={spec} value={value[spec.field]} onSendChange={onSendChange}
           swelling={sendSwelling?.[spec.field]} disabled={disabled} />
))}
// SendRow renders <div className={`audio-setting-section__${spec.engineKey}-row`}>
//   <SliderLinear schema={ROBOT_SEND_SCHEMAS[spec.field]} value={toSendDisplay(value)} onChange={handle} … /></div>
```

- `robotOptionsConfig.ts`: `ROBOT_SEND_SCHEMAS: Readonly<Record<RobotSendField, SliderLinearSchema>>`, built by a map over
  `ROBOT_SENDS` with `id: \`robotOptions.${spec.field}\`` and `...labels(spec.contentKey)`; the five named constants go. Ids
  and words are unchanged, so the content test's help walk and `isReferenced` both pass.
- `RobotScreen.tsx`: one `handleSendChange = useCallback((field, pct) => { cancelSwellForRobotAttribute(id, field);
  applySend(latestRobot.current, localeId, field, pct); }, [localeId])`; one `sendSwelling = useSendSwellingFlags(robot.id,
  <the five robot fields as a source>)`; two props in place of ten; the memo deps list the two. `audioSettingValue` keeps its
  five named fields (assumption 6).
- `useCompanyOptions.ts`: one `onSendChange(field, pct)`: NaN → return; per member `cancelSwellForRobotAttribute(m.id,
  field)` then `applySend(m, localeId, field, pct)`; with members, `patchSnapshot({ [field]: clampSend(pct /
  SEND_DISPLAY_SCALE) })`. `sendSwelling` from the first member through the same hook. The `CompanyOptions` interface drops
  its ten send members for the two.
- `CompanyOptionsSection.tsx` passes `onSendChange` and `sendSwelling`.
- `useSwellingFlags.ts`: `useSendSwellingFlags(robotId, source): Record<RobotSendField, boolean>` over `ROBOT_SEND_FIELDS`,
  the ADSR / layer hooks' overloads and memo shape.

### 1.5 Persistence and sharing — `sessionDiff.ts`, `sessionShareUtils.ts`, `localeStore.ts`, `companyOptions.ts`

- `sessionDiff.ts`: `SEND_PRIME_KEYS` is deleted; the diff loop and the restore loop run over `ROBOT_SEND_FIELDS`; the prime
  builds `Object.fromEntries(ROBOT_SEND_FIELDS.filter((f) => updates[f] !== undefined).map((f) => [engineKeyOf(f),
  updatedRobot[f]]))` — table order, as today.
- `sessionShareUtils.ts`: `CompactRobotOverrideDiff` keeps `rs` … `db` by name. The encoder's five lines become `for (const
  spec of ROBOT_SENDS) if (diff[spec.field] !== undefined) compact[spec.shareCode] = diff[spec.field];` at the same position
  (after `p`, before `dy`); the decoder's five become the same loop over `isSendFraction(compact[spec.shareCode])`. Same
  keys, same order, same string (assumption 9).
- `localeStore.ts`: the clamp loop iterates `ROBOT_SEND_FIELDS`.
- `companyOptions.ts`: `resolveCompanyOptions` spreads `Object.fromEntries(ROBOT_SEND_FIELDS.map((f) => [f,
  firstMember[f] ?? 0]))` into the resolved snapshot.
- `audioSwellRanges.ts`: the five rows become a spread over `ROBOT_SEND_FIELDS` with `{ min: SEND_MIN, max: SEND_MAX }`.
- `types/audioSwell.ts`: the `SwellRobotAttributeId` union ends in `| RobotSendField`; `SWELL_ROBOT_ATTRIBUTE_IDS` ends in
  `...ROBOT_SEND_FIELDS`. The array's order is unchanged (the sends are last; index-based picks do not shift) and the parity
  test pins it as a literal.

### 1.6 The guards

- `reservationSendsPrime.test.ts` is deleted (assumption 10).
- `robotSendsDocs.test.ts` and `robotEffectSendsDocs.test.ts`: the `declared` rows that pinned `applyReverbSend`,
  `applyReverbSendValue`, `applyDelaySendValue`, `apply<Name>Send`, `apply<Name>SendValue`, `<NAME>_SEND_SCHEMA`,
  `REVERB_SEND_SCHEMA`, `DELAY_SEND_SCHEMA`, the five-key `updateRobotSends` signature, `ROBOT_SEND_FIELDS` in
  `robotSendLoadingRanges.ts`, the voice entry's `reverbSend: Tone.Gain` fields, the `audioSwellRanges` literals, the
  `reserve-site scan` and the `SWELL_ROBOT_ATTRIBUTE_IDS[...]'reverbSend',` literals are re-pinned to: `applySend`,
  `applySendValue`, `ROBOT_SEND_SCHEMAS`, `ROBOT_SENDS`, `robotSendLevels`, `engineKeyOf`, `ROBOT_SEND_FIELDS` in
  `robotSends.ts`, `sends: Readonly<Record<SendEngineKey, Tone.Gain>>`, and `...ROBOT_SEND_FIELDS` in the pool. The ten action
  names, `SEND_ATTRIBUTES`, `SEND_PRIME_KEYS`, `writeRobotSend`, the five schema names and the ten handler names join
  `NOT_REPO_SYMBOLS` in both files with a comment naming this spec. A new case in each asserts the ten action names are not
  identifiers in `src/` (the `setGlobalColourRoom` precedent at `robotEffectSendsDocs.test.ts:129`).
- The 72 action references in the five behavioural test files move to `vi.spyOn(robotOptionsActions, 'applySend')` /
  `'applySendValue'` and assert the `field` argument; the `it.each` tables that already carry `action: 'applyGritSend'`
  (`useCompanyOptions.test.ts:849`, `CompanyOptionsSection.test.tsx:459`) carry `field` instead.

---

## 2. Target File Structure

```text
src/
├── data/
│   ├── robotSends.ts / .test.ts                   NEW — ROBOT_SEND_FIELDS, RobotSendField, SendEngineKey, SendShareCode, ROBOT_SENDS,
│   │                                                     ROBOT_SEND_BY_FIELD / _BY_ENGINE_KEY, engineKeyOf, sendFieldOf, robotSendLevels
│   ├── robotSendLoadingRanges.ts / .test.ts       imports RobotSendField; ROBOT_SEND_FIELDS and the type leave
│   ├── robotOptionsConfig.ts                      ROBOT_SEND_SCHEMAS replaces the five named schemas
│   └── audioSwellRanges.ts                        the five send rows as a spread over ROBOT_SEND_FIELDS
├── types/audioSwell.ts / .test.ts                 union ends in RobotSendField; array ends in ...ROBOT_SEND_FIELDS
├── engine/
│   ├── audioEngine/voiceEntry.ts                  sends: Record<SendEngineKey, Tone.Gain>; disposeVoiceNodes iterates
│   ├── AudioEngine.ts / .test.ts                  buildSendGains, sendTargetOf, table-driven reserveVoice + updateRobotSends, two primes
│   └── reservationSendsPrime.test.ts              DELETED
├── stores/localeStore.ts / .test.ts               clamp loop over ROBOT_SEND_FIELDS
├── systems/
│   ├── robotOptionsActions.ts / .test.ts          applySend, applySendValue; the ten named actions deleted
│   ├── audioSwells.ts / .test.ts                  writeRobotSend → applySendValue; SEND_ATTRIBUTES → ROBOT_SEND_FIELDS
│   ├── companyOptions.ts / .test.ts               resolveCompanyOptions' fallbacks from the field list
│   ├── spawnSystem.ts / .test.ts                  two primes → robotSendLevels(robot)
│   └── robotSendsParity.test.ts                   NEW — the oracle (assumption 11), first task, never re-recorded
├── utils/
│   ├── sessionDiff.ts / .test.ts                  SEND_PRIME_KEYS deleted; three loops over the table
│   └── sessionShareUtils.ts / .test.ts            encode / decode loops over ROBOT_SENDS at the same position
├── components/
│   ├── robot/AudioSettingSection.tsx / .test.tsx  onSendChange + sendSwelling; SendRow; rows from the table
│   ├── robot/useSwellingFlags.ts / .test.ts       + useSendSwellingFlags
│   ├── panels/screen/screens/RobotScreen.tsx / .test.tsx   one handler, one flags hook, two props
│   ├── company/useCompanyOptions.ts / .test.ts    one broadcast handler, one flags record; interface
│   └── company/CompanyOptionsSection.tsx / .test.tsx       passes the two props
└── docs/
    ├── robotSendsDocs.test.ts                     re-pinned declared rows; NOT_REPO_SYMBOLS; removed-names case
    └── robotEffectSendsDocs.test.ts               the same; the scan row removed
docs/
├── specs/ROBOT_SENDS.md, ROBOT_EFFECT_SENDS.md    header note: the actions, schemas, handlers and scan are as refactored here
├── AUDIO_SYSTEM.md                                :271 names applySend / ROBOT_SEND_SCHEMAS; the robot-sends paragraph names the table
├── COMPANIES.md                                   :66, :95, :101 name applySend / onSendChange
├── SESSION_STORAGE.md                             :155 names the table loops
├── reference/ROBOT_DATA_GRID.md                   send rows' symbol names, if any changed
└── todo/roadmap.md                                55 "As built"; Not Doing / Open resolved
```

Nothing under `src/content/`, `src/types/Robot.ts`, `src/types/Company.ts`, `src/types/session.ts` or `bypassCell.ts` /
`globalFx.ts` changes. `generateRobotSends` and the robot literal are untouched.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Anything else is a conflict to surface, not a quiet widening.
- **No behaviour change.** No seeded value, saved diff, share string, slider id, label, help, row order, swell pick or
  sound moves. The parity test (assumption 11) is the proof; the full suite is the second check; Crawford's listen is the
  confirmation. A green suite with a red parity test is a failed task.
- **Five written once; nothing speculative.** No registry, no plugin hook, no theme column, no generic "send kind" abstraction
  beyond the four columns the consumers need today. A column is added when a consumer reads it.
- **The graph is untouched:** the same gains, the same connections, the same `rampOrSet` over `SEND_RAMP_SECONDS`, the same
  feeder-set calls. Every AudioParam write stays in `AudioEngine.ts`; the table never imports Tone.
- **State stays JSON-serialisable:** `ROBOT_SENDS` is a module constant; the voice entry's gains stay in the engine.
- **The caller-side swell cancel stays at the caller** (`RobotScreen`, `useCompanyOptions`); `applySendValue` never cancels
  (the tick writes through it).
- **Content:** no new key, no key renamed, no literal in a component or data config; the table's `contentKey` literals are
  exactly the five existing keys. ESLint's content rule and `content.test.ts` are the guard.
- **Pre-v1:** no compatibility shim, no wrapper, no deprecation period for the ten names or the scan.
- **Ask first:** renaming a `Robot` field, a share code or a content key; changing `AudioSettingValue`'s shape; moving the
  band table; touching `generateRobotSends`; a new dependency.
- **Never:** `.env*`, `node_modules/`, build output; relaxing a CLAUDE.md guardrail; re-recording the parity fixture.

---

## 4. Code Style & Architecture Conventions

```ts
// src/engine/AudioEngine.ts — the prime at every reservation site, after the change
if (robot.panAuto === false) AudioEngine.updateRobotPan(robot.id, robot.pan);
// A new voice starts dry; every robot is handed all five sends back (ROBOT_SENDS.md §1.4, ROBOT_SEND_TABLE.md §1.1).
AudioEngine.updateRobotSends(robot.id, robotSendLevels(robot));
```

```ts
// src/components/company/useCompanyOptions.ts — one broadcast handler for the five rows
// Broadcast, not link (COMPANIES.md): cancel each member's own swell, apply per member, record the clamped fraction the
// members store. A NaN is dropped whole here (the action would drop it per member, but the snapshot must not record it).
const onSendChange = useCallback((field: RobotSendField, pct: number) => {
  if (Number.isNaN(pct)) return;
  latest.current.members.forEach((m) => {
    cancelSwellForRobotAttribute(m.id, field);
    applySend(m, localeId, field, pct);
  });
  if (latest.current.members.length > 0) patchSnapshot({ [field]: clampSend(pct / SEND_DISPLAY_SCALE) });
}, [localeId, patchSnapshot]);
```

- Names: `ROBOT_SENDS`, `RobotSendSpec`, `SendEngineKey`, `SendShareCode`, `ROBOT_SEND_BY_FIELD`, `ROBOT_SEND_BY_ENGINE_KEY`,
  `engineKeyOf`, `sendFieldOf`, `robotSendLevels`, `applySend`, `applySendValue`, `ROBOT_SEND_SCHEMAS`, `SendRow`,
  `onSendChange`, `sendSwelling`, `useSendSwellingFlags`, `buildSendGains`, `sendTargetOf`, `VoiceEntry.sends`.
- Comments cite this spec by assumption number where a choice is not obvious: the literal content keys (1), the load-bearing
  order (2), the two key spaces (3), the codec's position (9), the kept named fields (6, 8).
- Loops over the table are plain `for … of` / `.map`; no helper that hides which column is read.
- Tests colocated; TDD per task (RED first); one commit per task; Prettier on touched files; the repo index is LF (the working
  tree is CRLF under autocrlf — match the sibling file, never mix within one).

---

## 5. Testing & Verification Requirements

**The parity test (`src/systems/robotSendsParity.test.ts`, assumption 11)** — the first task, recorded against `main` at the
branch base, with the commit hash in its header comment. Each case names the fixture's non-default values.

- **Seeds:** `generateRobotRosterBaseline(createNoise2D(alea(seed)), 12)` for two seeds, every robot's five sends `toEqual`
  the recorded arrays (the 50.7 fixture pins two; this one pins all five).
- **Primes, in order:** with `AudioEngine.updateRobotSends` spied, record `[robotId, JSON.stringify(sends)]` per call
  (`JSON.stringify` fixes key order) for: `spawnRobot` on a fixture locale; `reRegisterAllRobotsAudio`; `reReserveVoice`;
  `applySessionPayload` with a payload whose robot diff carries three of the five sends; a share link decoded by
  `sessionShareUtils` and restored through the same call; one `tickAudioSwells(localeId, measure)` with an active swell on a
  send attribute (seeded through the swell pool the way `audioSwells.test.ts` already does). Each sequence `toEqual` its
  recording.
- **The share string:** `encode(…)` of a session whose one robot diff carries all five sends at distinct values equals the
  recorded string, and decodes to the same diff.
- **The store clamp:** `updateRobot` with `{ reverbSend: 7, delaySend: NaN, gritSend: -1 }` leaves the recorded robot (1, the
  stored value kept, 0).
- **The swell pool:** `SWELL_ROBOT_ATTRIBUTE_IDS` `toEqual` the recorded 22-entry literal.
- **Self-check:** a case asserts each recording is non-empty and that the fixture sends are not all equal, so the test
  cannot pass on defaults or on an empty spy.

**Unit (Vitest), per module:**

- `robotSends.test.ts`: the table row for row; `ROBOT_SEND_FIELDS` derived from it; `engineKeyOf` / `sendFieldOf` are
  inverses over all five; `robotSendLevels` returns the five in table order straight off the robot (no clamp, no rounding);
  every `contentKey` is a quoted literal in the module's source text (a regex over the file, so the content guard's contract
  is stated where it is relied on).
- `AudioEngine.test.ts`: the `reserveVoice` cases read `entry.sends[key]`; `updateRobotSends` writes only the keys given,
  ignores `NaN` and `undefined`, clamps `7` to `1`, calls `setRoomFeeder` for the three room keys only, and devWarns without
  throwing with no composite; the fallback entry has all five stub gains; `disposeVoiceNodes` disconnects and disposes the
  five then the three. The two prime cases assert `updateRobotSends` was called with `robotSendLevels(robot)`.
- `robotOptionsActions.test.ts`: `applySend(robot, l, 'gritSend', 40)` writes `{ gritSend: 0.4 }` and
  `updateRobotSends(id, { grit: 0.4 })`; `150` clamps to `1`; `applySendValue(…, NaN)` writes nothing; one `it.each` over
  the five fields; no swell is cancelled here.
- `audioSwells.test.ts`: a send tick writes through `applySendValue` with the attribute as `field` and lands exactly on its
  base; `isSendAttribute` is true for the five and false for `volume`.
- `AudioSettingSection.test.tsx`: five rows render in table order with today's class names and ids; moving the Grit row calls
  `onSendChange('gritSend', 40)`; `sendSwelling.gritSend` reaches the Grit slider's `swelling` alone; the memo'd `SendRow`
  does not re-render for another row's value change.
- `RobotScreen.test.tsx`, `useCompanyOptions.test.ts`, `CompanyOptionsSection.test.tsx`: the existing cases rewritten to the
  two props and the `applySend` spy, asserting the `field` argument (the `it.each` tables carry `field`); the cancel-before-
  apply order and the snapshot patch are unchanged.
- `useSwellingFlags.test.ts`: `useSendSwellingFlags` returns the five flags and recomputes on its source.
- `sessionDiff.test.ts`, `sessionShareUtils.test.ts`, `localeStore.test.ts`, `companyOptions.test.ts`, `audioSwell.test.ts`:
  the existing cases pass unchanged (they test behaviour, not the copies).
- **Docs guards:** both green with the re-pinned rows and the removed-names case; `content.test.ts` green with no
  `AWAITING_CONSUMER` entry.

**Mutation checks (by hand, at the task):** drop one row from `ROBOT_SENDS` and watch the parity primes case go red; swap two
rows and watch the share-string case and the swell-pool case go red; make `robotSendLevels` return four keys and watch the
prime case go red; point `applySendValue` at the wrong engine key and watch the actions case go red.

**Static:** `npm run build:types`, `npm run lint`, `npm run build` clean. `grep -rn "applyReverbSend\|SEND_PRIME_KEYS\|
SEND_ATTRIBUTES\|reservationSendsPrime" src docs/*.md` finds only `NOT_REPO_SYMBOLS` entries, the historical specs and the
roadmap.

**Manual (Crawford):** `npm run dev`; one world; move each of the five sliders on a robot and on a company; save and restore a
session; make and open a share link; let a swell land on a send. Nothing sounds or reads differently.

---

## 6. Git & Workflow Context

- **Order of work:** (1) Crawford approves this spec; (2) `planning-and-task-breakdown` → `docs/tasks/ROBOT_SEND_TABLE.md`
  (the repo convention overrides the skill's `tasks/plan.md`); (3) the build on **`refactor/robot-send-table`** off `main`
  (name is a proposal, the `refactor/factory-timing` precedent; Crawford creates branches, PRs and merges). The first task is
  the parity test, recorded at the branch base before any other change.
- One commit per task, RED first, imperative subject, no conventional-commit prefix, the session's co-author line. Commits
  only when Crawford says so.
- The intent is untracked on `main`; it is committed with this spec (docs only) or carried onto the branch — Crawford's call.
- Roadmap 55's "Open" bullets are answered by assumptions 5, 6 and 8; its entry gets an "As built" at the end.

---

## 7. Open Questions & Risks

**For Crawford — veto points before the plan (each has a default this spec proceeds with):**

1. **Assumption 4 — `VoiceEntry.sends` as a record.** The alternative keeps five named `Tone.Gain` fields and iterates by
   name through a `sendGainOf(entry, key)` switch. The record is cleaner and the only consumers are `AudioEngine.ts` and
   `voiceEntry.ts`; `AudioEngine.test.ts` (42 `updateRobotSends` references) is the cost. Default: the record.
2. **Assumption 6 — `onSendChange(field, pct)` rather than a `sends` list prop.** A list of `{ field, value, onChange,
   swelling }` would move the five `value` reads out of `AudioSettingValue`; the docs guards pin `AudioSettingValue.<field>:
   number` and the robot screen's memo lists the fields either way. Default: two props, value stays named.
3. **Assumption 1 — the table's home.** `src/data/robotSends.ts` (new) versus growing `robotSendLoadingRanges.ts`. The band
   table is what a theme overrides; the wiring table is what a sixth send adds to. Default: two files.
4. **Assumption 11 — the swell-tick case in the parity test.** `tickAudioSwells(localeId, measure)` is the public tick; if an
   active send swell cannot be seeded into its pool from the test without faking the transport, the case records the
   `updateRobotSends` call of a direct `applySendValue` instead and says so. Default: drive the public tick.
5. **Roadmap 55's third Open bullet** (keep five named fields on the four types): **answered yes** by assumption 8.

**Risks:**

1. **Key order in the prime object.** `updateRobotSends` iterates its own table, not the caller's object, so the order a
   caller builds the object in is cosmetic to the engine — but the parity test records `JSON.stringify(sends)`, and
   `sessionDiff.ts`'s `Object.fromEntries` and `robotSendLevels` must both produce table order or the recording fails
   spuriously. Both are specified to; the test will say which one slipped.
2. **The content guard's literal search.** A `contentKey` built from `field` passes types and ESLint and fails
   `content.test.ts` with "unreferenced key". Assumption 1's literal rows and the `robotSends.test.ts` regex case are the
   defence.
3. **The historical specs' §1–4 scan.** Every deleted name must be in both `NOT_REPO_SYMBOLS` sets or the guards fail on
   the old specs' prose; the names are listed in §1.6. A name missed shows up as a named failure, not a silent pass.
4. **Memo churn on the screens.** Collapsing ten callbacks into one keeps `RobotScreen`'s renderer memo honest only if
   `handleSendChange` and `sendSwelling` are stable between unrelated renders (`useCallback([localeId])`, `useMemo` on the
   five fields). The `AudioSettingSection.test.tsx` re-render case checks the row; the existing RobotScreen memo tests
   check the screen.
5. **The removed `*SendSwelling` props** are read by nothing else; a `grep` confirms before deletion.
6. **A sixth send is still five edits** — a row, a `Robot` field, a `CompactRobotOverrideDiff` code, a content entry, a band
   — but each is a declaration the type system then demands everywhere (`Record<RobotSendField, …>`), which is the point.
