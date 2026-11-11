# Intent: Monitor Mode Made Trustworthy — Highlight you can hear, from a robot that is playing, and the mode shown on every card

Confirmed via `interview-me` on 2026-11-11 (five questions, every guess confirmed; one wording check — Crawford's "M"
is the word "Mute"), ahead of a `spec-driven-development` pass. Raised the same day in a review of how Auto, Solo,
Mute and Highlight work: of six findings Crawford kept four (1, 2, 3, 5 below) and called two features (4, 6). Not yet
a backlog or roadmap entry; the spec pass gives it a number (the shared counter's next free number is 81) and plan.md
a line.

## Outcome

Monitor Mode becomes something a listener can trust, and something a reader can see.

- **Highlight is audible.** The other robots drop about 10 dB on their bus gain, ramped; the highlighted robot keeps
  its own Volume. Today Highlight halves note velocity in `scheduleNote`, nominally 6 dB, and it cannot be heard.
- **Highlight counts only from a robot that is actually sounding.** A Highlight on a robot in its station, silenced
  by another robot's Solo, or standing by over the Audio Load budget does nothing. Today the check reads only the
  dock, so a silenced robot's Highlight still dims the robots that are playing (Solo on A plus Highlight on B leaves A
  playing alone at half level).
- **The budget admits a highlighted robot like a Solo**, by evicting the newest plain Auto robot, with Solo ranking
  above Highlight when slots are short. Today only Solo has priority, so on a Light tier you can highlight a robot
  that is standing by.
- **Every card and roster tile leads with the mode**, as a coloured light plus a word: Auto (green), Solo (yellow),
  Mute (red), Highlight (blue). The colour is the robot's own mode, never a consequence of another robot's; the light
  dims whenever the robot is not actually sounding. The three derived words Emitting / Standing by / Disabled go away.
- **The roster tile's status line** runs mode · job · docking · activity, and on desktop wraps to two lines, so the
  audio state is never the part the ellipsis eats.

## Behavior

- **Who it is for.** Crawford, listening and reading the fleet at a glance, on the desk and the phone shell.
- **Why now.** Highlight's halved velocity is inaudible; a silenced robot's Highlight still dims the players; nothing
  on a card or tile says which mode a robot carries; the tile's one-line status hides the audio state on desktop.

### Highlight, the sound

- While at least one highlighted robot is sounding, every other *sounding* robot's bus gain is lowered by about 10 dB,
  ramped (no step), and restored the same way when the last sounding Highlight ends. The highlighted robot's own bus
  gain is untouched: it stays at its Volume.
- Two or more highlighted robots all stay at full; everyone else drops the same amount once, not once per Highlight.
- The dip is a bus-gain write, not a per-note velocity multiply. Velocity stays the Dynamics roll's and the accents'
  alone.

### Highlight, when it counts

- A Highlight is live only while its robot is actually sounding: out of its station (`isDockMuted` false), not
  silenced by anyone's Solo (`isRobotAudible` true), and in the budget's sounding set.
- Under any Solo, a Highlight on a non-soloed robot does nothing at all, since that robot is silent. A soloed robot
  cannot also be highlighted (one `audioMode` per robot), so Solo and Highlight never meet on one robot.
- A highlighted robot in its station highlights nothing until it comes back out (unchanged from today).

### The budget

- Admission ranks Solo, then Highlight, then Auto, first come first served within a rank. A highlighted robot that
  arrives (or is highlighted) with no free slot evicts the newest Auto robot, never a Solo or another Highlight; a
  Highlight that finds only Solos and Highlights waits, first come.
- A lowered cap evicts newest Auto first, then newest Highlight, then newest Solo (today's rule with Highlight slotted
  between).

### The status field

- The field (the robot screen's well, `MetaBox`, and the roster tile's line) shows the robot's own `audioMode`: a
  small light and a word, Auto (green), Solo (yellow), Mute (red), Highlight (blue). Lore pairs for each, as the other
  options carry.
- The light is lit when the robot is sounding and dim when it is not, for any reason: the dock, another robot's Solo,
  the budget's standing by, its own Mute. The word never changes with the reason. So a silenced Auto robot reads
  "Auto" with a dim green light; a soloed robot in its station reads "Solo" with a bright yellow one; a user-muted
  robot is always a bright red "Mute".
- The docking state and activity stay their own fields, so "Docked" is still said next to a dim "Auto".
- Emitting / Standing by / Disabled (`AUDIBILITY_LABELS`, `probe.status` options) are removed, not kept as a second
  vocabulary.

### The roster tile

- The line's order becomes `{status} · {job} · {dockingState} · {activity}`; the status part carries the light.
- Phone shell: one line, ellipsis, as today; the mode leads so it is never cut.
- Desk shell: up to two lines (a line clamp), the tile taking the extra height, and every tile in the grid holding
  the same height so the rows stay even.

## Style / constraint

- **No world-view mark.** The Visual Mapping guardrail stays as written: audio reaches the body only through the
  dials ROBOT_DESIGN.md lists, day/night and battery dimming are the only overlays, and the world view keeps only the
  selection glow and the company glow. The mode shows on cards and tiles alone.
- **Enforcement stays at the note trigger.** `isRobotAudible` in `triggerWithCap` remains the sole mute/solo/dock
  gate. The Highlight dip is a bus-gain write beside it, never a GSAP callback, and never a timer: it follows the same
  state changes (`audioMode`, docking, the sounding set) the budget system already watches.
- **Copy lives in `src/content/`** (`probe.ts`): the four words, their lore pairs, and the tile template.
- **Colours** are tokens, not literals in a component. `statusLightColors.ts` already names mute red, solo green,
  highlight amber for the power switch; this field's palette (Auto green, Solo yellow, Mute red, Highlight blue) is
  its own and must not silently change the rocker's.
- **Tests exercise code, not text** (CLAUDE.md): the dip, the counts-only-when-sounding rule, the admission rank and
  the field's state are behaviour with tests; the copy and the two-line CSS get a look in the browser.
- **State stays serialisable**: nothing new is stored. The light's lit/dim is derived from `audioMode`, docking and
  `soundingRobotIds`, as `useRobotMeta` derives today.

## Out of scope

- **Mute and the stay-up rule** (finding 4): the last Active robot stays up by docking alone, so a user-muted last
  robot leaves the world silent. Crawford: a feature, not a bug; the rule keeps reading docking only.
- **Company-level mode is a broadcast** (finding 6): setting a mode on a company writes it to every member, and the
  company shows its first member's mode. Stays as COMPANIES.md describes.
- **A per-note pulse on the robot** (backlog 79) and **the dock fade** (backlog 74) are separate items.
- **Any world-view mark for a mode**, see the constraint above.
- **Who is heard**: `isRobotAudible`'s rule (Mute always wins; under any Solo only the soloed robots; otherwise the
  dock mutes) does not change. Only Highlight's sound, its counting rule, its admission and the display do.

## Known implementation notes (not yet spec'd)

- **Where Highlight lives today.** `scheduleNote` in `src/engine/AudioEngine.ts` (the `anyHighlight` block, ~line
  810) multiplies `effectiveVelocity` by 0.5. That block goes; the dip becomes a per-robot bus-gain target the engine
  ramps, beside `updateRobotMasterVolume` (the Volume slider's live bus gain). The target is Volume × dip while a
  sounding Highlight exists and the robot is not itself highlighted, else Volume. Mind the voice rebuild on
  admission (`reReserveVoice`): a rebuilt voice must come up already dipped if a Highlight is live.
- **Who decides a Highlight is live.** The budget system (`src/systems/audioBudgetSystem.ts`, `reconcile`) already
  computes `anySolo`, eligibility and the sounding set from the `id:audioMode:docking` signature; "any highlighted
  robot in the sounding set" is one more derived boolean there, pushed to the engine only when it changes, the way
  `applyStandingBy` pushes.
- **Admission.** `reconcileSounding` in `src/utils/audioBudget.ts` takes `soloIds`; it grows a second priority list
  (or a rank per id). `audioBudget.test.ts` has the solo cases to mirror.
- **The field.** `useRobotMeta` (`src/components/panels/screen/screens/useRobotMeta.ts`) returns display strings;
  it gains the mode word and a lit/dim boolean (`isRobotAudible && isRobotSounding`). `getAudibilityState` and
  `AUDIBILITY_LABELS` (`src/data/robotSelectionConfig.ts`) are removed with their tests. Consumers: `MetaBox.tsx`
  (the robot screen's wells) and `RosterTile.tsx` (`fill('probe.roster.statusLine', meta)`).
- **The tile.** `RosterTile.css` `.roster-tile__status` is `white-space: nowrap` with an ellipsis; the desk shell
  gets a two-line clamp and the grid an equal-height row. The light is a small inline element before the word, so
  `fill`'s template either carries a slot for it or the status part is rendered as its own span before the rest.
- **A doc to correct while there.** ROBOT_LIFECYCLE.md rule 6 calls the options "Off, Mute, Solo, Highlight"; the
  copy says Auto. AUDIO_SYSTEM.md line ~575 and POLYPHONY_GUIDE.md describe the velocity halving and need the new
  rule.
