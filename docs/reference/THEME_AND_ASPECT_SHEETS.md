# Theme and Aspect Character Sheets

The character sheets of roadmap [58](../todo/roadmap.md#58-themes-and-aspects-refinement) (spec
[THEME_AND_ASPECTS_REFINEMENT.md](../specs/THEME_AND_ASPECTS_REFINEMENT.md), the section on the character sheets; plan
[THEME_AND_ASPECTS_REFINEMENT.md](../tasks/THEME_AND_ASPECTS_REFINEMENT.md), the paper phase). One sheet for every
theme, aspect family and option that is live in `src/data/bands/themes.ts` and `src/data/bands/aspects.ts`, and one for
every candidate. The choice between them is made on this file, before any column is written.

## The rules

- **No numbers in the character.** A sheet says what a visitor hears, never a band's edges. Numbers come at the column,
  each cited to a line here, and are measured and listened to afterwards. The only digit a character field may carry is
  one inside a band key's own name. Since the cut (Crawford, 2026-11-03) a sheet may also carry a **Sketch starting
  points** line: his numbers for the measured sketch, read as guesses the sketch tests, never as rules; the sentence
  beside the key stays the contract.
- **A key with no sentence is not owned.** "Keys owned" lists the band keys the column must move, each followed by the
  sentence from the same sheet that needs it. A key the column would move for no reason the sheet can give goes under
  "Leaves alone" with that said plainly. This is the importance test, run on paper.
- **Covered.** A theme is the world and every probe's guardrails when no aspect is picked. If the character paragraph
  needs a band and "Keys owned" does not name it, the sheet has a hole; the key goes on before any column does.
- **A theme is a place, not a rung.** A candidate that reads as more or less of another is not written. The listener is
  a first-time visitor on a tablet, reading one line under the row and picking with no guide: any two themes must sound
  unlike each other inside a minute, and "Heard first / second / third" is written as what that visitor notices, in
  order.
- **Status marks are Crawford's.** Every sheet starts `candidate`, the current set included. Crawford marks `kept`,
  `renamed → <name>` or `cut`, and writes the reason on a cut; cut sheets move under "Cut" at the end of this file so a
  candidate is never proposed twice. Claude writes the sheets and nothing else on them.
- **Band keys** are written as `src/data/bands/bandKeys.ts` spells them. A row's words for a visitor are the sheet's;
  the key is the contract. **A theme that names a pedal's or a colour node's rows lights it in every world** (Crawford,
  2026-11-03): the pedals and the colour nodes are lit by a seeded coin today, and under a theme whose column names none
  of a pedal's rows the coin still decides; under a theme whose column names one, that pedal or node is always on. The
  three effect rooms (Grit, Shimmer, Double) light when a probe's send feeds them, and the sends are bands. A theme that
  wants no drive owns `gritSend` at none rather than the colour rows. A lit pedal counts toward the two-lit cap on the
  Tremolo and the Vibrato.
- **Two new keys, agreed at the cut (Crawford, 2026-11-03), built at T6 and named there:** `robot.detune`, the fixed
  offset in cents between a probe's layers (the Core, Companion and Accent sources each have a detune slider; the seed
  draws one small value today outside the table), and `robot.octaveRegister`, a weighted pick over the register list a
  probe's Octave Min and Max are dealt from, as the waveform pick weights the waveforms. Until T6 they are written on the
  sheets as any other key, and the key check knows they are not in `classic.ts` yet.
- **Not bands:** the fleet's size and Humanize (a seeded global setting): a sheet that needs one of these names it under
  "Leaves alone" as an ask-first. Pitch drift is the docking lifecycle's and no theme's business (Crawford, 2026-11-03):
  no sheet asks for it.

## The sheet

Every sheet has these fields, in this order:

```markdown
### <Working name>  ·  <theme | family | option of <family>>  ·  status: candidate | kept | renamed → <name> | cut

**Character.** One paragraph. For a theme: the place, what no single robot decides (tempo, rooms, filter and EQ,
crowdedness, colour, pedals) and what every robot does there when nothing else is picked. For a family: the axis, in
the visitor's words. For an option: the point on the axis.

**Heard first / second / third.** Three lines: what a first-time visitor on a tablet notices, in order, inside a minute.

**Keys owned.** The band keys the column must move, one per line, each followed by the sentence from this sheet that
needs it. (The importance test: a key with no sentence is not owned.)

**Leaves alone.** What stays the theme's or Classic's on purpose, in words.

**Overlaps.** For a theme: which families' options can take which of its keys, and what of the character survives when
they do. For an option: which theme keys it overrides, and so what the theme's sentence must not promise.

**Distinct from.** Its nearest neighbour in the set, and the one-minute difference.

**Promise.** What the one-line description will have to say, in plain words. Not the sentence: that is step 5.
```

---

## The current set

The five themes and the four families with their twelve options as `themes.ts` and `aspects.ts` hold them today. Each
sheet was first written from its column's keys, then rewritten as a character; where a key the column moves has no
sentence, it sits under "Leaves alone" with the note that the placeholder moved it for no reason the sheet can give.
Classic's column is empty by definition, so its sheet owns no key.

**The theme marks (Crawford, 2026-11-03).** Adventurous is cut (its sheet is under "Cut"). Calm, Bold, Perilous and the
Current candidate are renamed Float, Anchor, Shatter and Tide and redefined; each renamed sheet opens with his mark and
is rewritten to the new character, and the candidate themes' "Distinct from" lines now name the new set. The option
sheets' "Overlaps" lines still name Calm, Bold, Perilous and Current: they are rewritten with the family marks, since the
families are still to be cut.

### Themes

### Classic  ·  theme  ·  status: candidate

**Character.** The receiver as it was tuned over the project's life: the whole band table, every row where the long
listens left it, with nothing narrowed. The world side is a walking tempo, rooms of ordinary size, an open master
filter with a flat EQ, colour and pedals lit in some worlds and dark in others, the fleet neither crowded nor sparse.
On the probe side every band is at its surveyed width, so a fleet holds the full range of what a probe can be: most
plain, a few that curve a note, a few that glide, a few on a resonant filter, a few sent into a room. It is the only
theme in which nothing leans, which is itself a character: the widest fleet, and the one where a visitor hears every
kind of probe at once.

**Heard first.** No two probes alike: a fleet of strangers.
**Heard second.** A world that changes with its seed more than any other theme's does.
**Heard third.** Nothing leans: tempo, room and brightness are all middling and wide.

**Keys owned.**
- None. Classic's column is empty by definition: Classic is the table in `classic.ts`, and every other column overlays
  it. A key on this sheet would mean moving Classic's own band, which the rules allow once for a named reason; this
  sheet asks for no such move.

**Leaves alone.** Everything, by definition.

**Overlaps.** Every family's option replaces Classic's band for its keys when picked, so a visitor who picks an aspect
under Classic hears a narrowed fleet on that axis. What survives is the whole world side (tempo, rooms, filter, EQ,
colour, pedals), since no family reaches a global row, and every probe band no family owns.

**Distinct from.** Every other theme leans somewhere; Classic leans nowhere. Its nearest neighbour by sound is whichever
survivor moves the fewest keys, Anchor today: Anchor's probes are all dry and locked where Classic's are every kind at
once. (Adventurous, the one theme wider than Classic, is cut.)

**Promise.** The receiver as it came: the whole range, every kind of probe at once.

### Float (was Calm)  ·  theme  ·  status: renamed → Float

**Crawford's mark (2026-11-03).** Renamed and redefined: slow and unhurried; sparse notes, long rests between phrases and
short gentle cells; soft sine and triangle voices with long attacks and long tails; a warm master filter, a generous warm
room, no drive and no rhythmic push.

**Character.** Slack water, warm. Nothing hurries: the pulse is slow, each probe speaks seldom, leaves long rests between
phrases and plays short gentle cells, and no note is pushed harder than another. The voices are soft, the sine and the
triangle, and every note arrives slowly and trails long. The probe filter sits open and warm, the master filter takes the
top off the whole fleet, no probe is sent to the Grit room so there is no drive whatever the coin lit, and every probe
sits in a generous room that is near and warm rather than vast.

**Heard first.** Nothing hurries: a slow pulse, long rests, short gentle phrases.
**Heard second.** Soft round voices that arrive slowly and trail long.
**Heard third.** Warm and washed: the top softened, every probe in a generous room.

**Keys owned.**
- `bpm` — the pulse is slow.
- `robot.rhythmicDensity` — each probe speaks seldom.
- `robot.rests` — and leaves long rests between phrases.
- `robot.rhythmicMotifLength` — short gentle cells: a figure that is short when it is on.
- `robot.accents` — no note is pushed harder than another: no rhythmic push.
- `robot.waveform` — soft voices: the sine and the triangle.
- `robot.attack` — every note arrives slowly.
- `robot.release` — and trails long.
- `robot.filterFreq` — the probe filter open and warm.
- `filterLPF.frequency` — the master filter takes the top off the whole fleet.
- `gritSend` — no probe sent to the Grit room: no drive, whatever node the coin lit.
- `reverb.decay` — a generous room.
- `reverb.preDelay` — near: its walls close, warm rather than vast.
- `reverbSend` — every probe in it.

**Leaves alone.** The delay and its send: Classic's, on purpose; the late echo is Open Water's and Float is the near
room. The EQ, the pedals, dynamics, decay and sustain, the shaped stages: Classic's.

**Sketch starting points (Crawford, 2026-11-03; guesses for the sketch, not rules).** Master filter around 1.5 to 2.5
kHz; attack 0.3 to 0.8 s; release 1.5 to 3.0 s.

**Overlaps.** Melody takes `robot.rhythmicDensity` and `robot.rhythmicMotifLength`; Envelope takes `robot.attack` and
`robot.release` (Plucked makes the notes strike); Voice takes `robot.waveform` and `robot.filterFreq`; Distance takes
`reverbSend` (Near dries the fleet); Performance (candidate) would take `robot.rests` and `robot.accents`. What survives
everything is the slow pulse, the softened top, the dry colour and the generous near room.

**Distinct from.** Open Water, the nearest: both soft, slow and in a long room. Open Water is vast and far, quiet, with a
late echo and the silence between calls; Float is near and warm, its probes soft at the receiver with no echo. In the
current set, Anchor: dry weight against warm wash.

**Promise.** Slow, soft and warm: nothing hurries, nothing is pushed, everything is in the room.

### Anchor (was Bold)  ·  theme  ·  status: renamed → Anchor

**Crawford's mark (2026-11-03).** Renamed and redefined: low-mid punch and a solid fundamental; transient weight and dry
clarity, with every notion of speed stripped. Square and triangle layers, locked, so it stays apart from Shatter's saws.

**Character.** The hold on the sea floor. Every note lands with weight and stops: an instant attack, a tight decay, and
nothing after it, since no probe is in the wash or the echo. Nothing slides and nothing wavers: no probe glides between
notes, no probe's layers drift against each other, and each probe's layers are tuned dead on one another, so each stack
is locked and punches as one. The voices are the square and the triangle with the partner layers full, so the stack is
dense and the fundamental solid. The EQ is flat but
for a slight lift in the mid band, so the weight sits low-mid, and the limiter is held tight so the punch never spikes.
The pulse, the crowdedness and the gaps are Classic's: Anchor is weight, not speed.

**Heard first.** Every note lands with weight, dry and close, and stops.
**Heard second.** Nothing slides and nothing wavers: each stack is locked.
**Heard third.** Solid and low-mid: dense, plain, nothing bright or washed.

**Keys owned.**
- `robot.attack` — an instant attack: the note lands.
- `robot.decay` — a tight decay.
- `robot.portamento` — nothing slides: no probe glides.
- `robot.lfoDetuneDepth` — nothing wavers: no layer drifts against another.
- `robot.detune` — each probe's layers tuned dead on one another: the stack punches as one (new key, see the rules).
- `robot.waveform` — the square and the triangle.
- `robot.layerGain` — partner layers full: the stack is dense.
- `reverbSend` — no probe in the wash.
- `delaySend` — none in the echo.
- `eq3.low` — flat: held near centre.
- `eq3.high` — flat.
- `eq3.mid` — but for a slight lift: the weight sits low-mid.
- `limiter.threshold` — held tight: the punch never spikes.

**Leaves alone.** `bpm`, `robot.rhythmicDensity` and `robot.rests`: Classic's, on purpose; Anchor is weight, not speed.
The compressor: Classic's; the pumping clamp is Squall's alone, and the mild compression Anchor wants is what Classic
already draws. The master filter, the rooms' size, the pedals, dynamics, accents, sustain and the shaped stages:
Classic's. Pitch drift: the docking lifecycle's, not a theme's business.

**Sketch starting points (Crawford, 2026-11-03; guesses for the sketch, not rules).** Attack 0.001 s; portamento none;
the mid lift slight, around 200 to 500 Hz, which the three-band EQ can only approach; both sends zero; limiter threshold
tight.

**Overlaps.** Envelope takes `robot.attack` and `robot.decay` (Swelling softens the landing: the first line is lost);
Voice takes `robot.waveform` and `robot.layerGain`; Distance takes both sends (Remote puts the weight in the wash);
Motion (candidate) would take `robot.portamento` and `robot.lfoDetuneDepth`. What survives everything is the flat EQ
with its mid lift and the tight limiter: still solid, if no longer dry.

**Distinct from.** Shatter, the nearest by strike: both land notes hard and dry. Anchor is the square and the triangle,
locked and clean; Shatter is the saw and the pulse, buzzing and crushed. Among the candidates, Tidepool is dry too, but
tiny, thin and high where Anchor is dense and low-mid.

**Promise.** Weight: every note lands dry and solid, and stops.

### Shatter (was Perilous)  ·  theme  ·  status: renamed → Shatter

**Crawford's mark (2026-11-03).** Renamed (by way of "Gale") and redefined: tense, sharp and aggressive; a static,
abrasive, high-frequency wall of crunch from fold and crush, with no compressor pump (that is Squall's) and no resonant
sweep (that is Vent Field's); uptempo.

**Character.** Breaking glass. The world is bright, fast and abrasive, and it does not move. Most probes are sent to the
Grit room, where the drive is high, the fold order high and the bit depth low, so whatever colour node the coin lit bites
hard, and because the column names all three nodes, all three are lit in every Shatter world; the high band is lifted
and the master filter wide open, so the crunch sits on top. The voices are the saw and the pulse, set high in the
register and with each probe's layers tuned wide apart so the buzz beats against itself, and every note is a hard short
strike that is gone at once; probes talk nearly all the time with hardly a rest and
the pulse is fast, so the wall is steady and never gusts. Nothing resonates and nothing sweeps: the accent filter is off
most probes and the probe filter does not move. A short echo with high feedback rides every probe, so each strike rattles
once behind itself, and the fleet is dry of wash.

**Heard first.** A bright abrasive crunch on nearly every note, and it does not let up.
**Heard second.** Buzzing saws and pulses striking hard and short, a rattle behind each.
**Heard third.** Fast and steady: a wall, not a storm.

**Keys owned.**
- `gritSend` — most probes sent to the Grit room: a crunch on nearly every note.
- `distortion.amount` — the drive high.
- `chebyshev.order` — the fold order high: jagged.
- `bitCrusher.bits` — the bit depth low.
- `distortion.wet` — whatever node the coin lit bites hard.
- `chebyshev.wet` — bites hard.
- `bitCrusher.wet` — bites hard.
- `eq3.high` — the high band lifted: the crunch sits on top.
- `filterLPF.frequency` — the master filter wide open.
- `robot.waveform` — the saw and the pulse.
- `robot.octaveRegister` — set high in the register (new key, see the rules).
- `robot.detune` — each probe's layers tuned wide apart: the buzz beats against itself (new key, see the rules).
- `robot.attack` — a hard strike.
- `robot.decay` — short.
- `robot.sustain` — holds little.
- `robot.release` — gone at once.
- `robot.rhythmicDensity` — probes talk nearly all the time.
- `robot.rests` — with hardly a rest: a wall, never gusting.
- `bpm` — the pulse is fast.
- `robot.accentFilterFreq` — nothing resonates: the accent filter off most probes.
- `robot.lfoBusDepth` — nothing sweeps: the probe filter does not move.
- `delay.delayTime` — a short echo.
- `delay.feedback` — with high feedback: a rattle.
- `delaySend` — on every probe.
- `reverbSend` — dry of wash.

**Leaves alone.** The compressor: Classic's; the pumping clamp is Squall's alone. `robot.accentFilterQ`: Classic's, since
the filter is off most probes. The shaped stages, dynamics, accents, the probe filter's rest position and the layers:
Classic's. `shimmerSend` and `doubleSend`: Classic's, with the at-most-one-room note. A noise layer: no waveform the
table has. The pedals: the coin's.

**Sketch starting points (Crawford, 2026-11-03; guesses for the sketch, not rules).** Detune 20 to 30 cents; the delay a
slapback. The fast compressor and the accent Q range from the "Gale" draft were dropped with the compressor and the
resonance.

**Overlaps.** Voice takes `robot.waveform` and `robot.accentFilterFreq` (Hollow puts the resonance back); Envelope takes
the four stages (Held lets the notes ring); Melody takes `robot.rhythmicDensity`; Performance (candidate) would take
`robot.rests` (Halting turns the wall into gusts, which is Squall's); Distance takes both sends; Motion (candidate), if
it took the room sends, would take `gritSend`, the crunch itself. What survives everything is the bright EQ, the open
filter, the fast pulse and the hot Grit room: a probe still sent into it still crunches.

**Distinct from.** Squall, the nearest: both tear. Squall surges and drops, gusts, and pumps on its compressor; Shatter is
a steady wall with no pump and no gusts. Anchor: clean square weight against buzzing saw crunch. Vent Field: its filter
sweeps and squelches, low; Shatter's does not move, and sits on top. Wreck leans on the Grit room too, but dark, slow and
echoing with long tails where Shatter is bright, fast and rattling.

**Promise.** Bright, fast and abrasive: a wall of crunch that never lets up.

### Families and their options

### Melody  ·  family  ·  status: candidate

**Character.** What a probe plays: how often it speaks, how far its pitch roams, whether it tiles a short figure over
and over, and how often it comes back to the note it just left. The axis a visitor hears as "busy or sparse, circling or
roaming, repeating or not".

**Heard first.** How busy each probe is.
**Heard second.** Whether a phrase comes round again.
**Heard third.** How far the pitch wanders.

**Keys owned.**
- `robot.rhythmicDensity` — how often a probe speaks.
- `robot.noteVariance` — how far its pitch roams.
- `robot.rhythmicMotifLength` — whether it tiles a short figure over and over.
- `robot.pitchRepeat` — how often it comes back to the note it just left.

**Leaves alone.** Rests, dynamics and accents: how a line is performed, not what it is. The envelope, the voice and the
sends.

**Overlaps.** Takes `robot.rhythmicDensity` from Calm, Bold and Perilous (Adventurous does not name it). A theme's
sentence about how often its probes speak does not survive a Melody pick.

**Distinct from.** Performance (candidate), which shapes how a line is played rather than what it is: Melody decides the
notes, Performance how hard and how whole they are.

**Promise.** What the probes play.

### Hypnotic  ·  option of melody  ·  status: candidate

**Character.** A probe that circles. It speaks at a middling, steady pace, keeps to a note or two, and comes back to the
one it just left more often than not; it never scatters.

**Heard first.** Each probe circles a note or two.
**Heard second.** At a steady, middling pace.
**Heard third.** It keeps coming back to where it was.

**Keys owned.**
- `robot.rhythmicDensity` — a middling, steady pace.
- `robot.noteVariance` — keeps to a note or two, and the roaming is never off.
- `robot.pitchRepeat` — comes back to the one it just left more often than not.

**Leaves alone.** `robot.rhythmicMotifLength`: whether the circling tiles a figure is the theme's.

**Overlaps.** Overrides `robot.rhythmicDensity` in Calm, Bold and Perilous: Calm's "seldom", Bold's "often" and
Perilous's "nearly all the time" give way to a middling pace, so none of those sentences may promise its density
outright.

**Distinct from.** Mechanical. Both keep the pitch close; Mechanical drives a long fixed figure at high density, Hypnotic
circles at a middling pace with no figure of its own.

**Promise.** Circles a note or two at a steady pace.

### Mechanical  ·  option of melody  ·  status: candidate

**Character.** A probe that drives. It speaks nearly all the time, tiles one long figure and keeps tiling it, holds its
pitch close, and returns to a note about as often as it leaves it: a machine running a pattern.

**Heard first.** One long figure, driven over and over.
**Heard second.** At a high, unbroken rate.
**Heard third.** The pitch barely moves.

**Keys owned.**
- `robot.rhythmicDensity` — speaks nearly all the time.
- `robot.rhythmicMotifLength` — tiles one long figure and keeps tiling it: the figure is never off.
- `robot.noteVariance` — holds its pitch close, and never off.
- `robot.pitchRepeat` — returns to a note about as often as it leaves it.

**Leaves alone.** Nothing in its family: all four keys are set.

**Overlaps.** Overrides `robot.rhythmicDensity` in Calm, Bold and Perilous: Calm's "seldom" is lost under it; Bold's and
Perilous's crowd is kept or raised.

**Distinct from.** Hypnotic, as above; and Wandering, its opposite on every key.

**Promise.** Drives one long figure at high speed.

### Wandering  ·  option of melody  ·  status: candidate

**Character.** A probe that roams. It speaks less often than most, ranges wide in pitch, almost never tiles a figure, and
rarely returns to the note it just left: a line going somewhere and not coming back.

**Heard first.** The pitch ranges wide and rarely returns.
**Heard second.** No figure repeats.
**Heard third.** Sparser than most.

**Keys owned.**
- `robot.rhythmicDensity` — speaks less often than most.
- `robot.noteVariance` — ranges wide in pitch, never off.
- `robot.rhythmicMotifLength` — almost never tiles a figure.
- `robot.pitchRepeat` — rarely returns to the note it just left.

**Leaves alone.** Nothing in its family: all four keys are set.

**Overlaps.** Overrides `robot.rhythmicDensity` in Calm, Bold and Perilous: Bold's "often" and Perilous's "nearly all
the time" are lost under it, so neither sentence may promise the crowd outright.

**Distinct from.** Hypnotic, its opposite: Hypnotic returns, Wandering leaves.

**Promise.** Roams wide and sparse, never repeating.

### Envelope  ·  family  ·  status: candidate

**Character.** How a note is shaped: whether it strikes or arrives, how fast it settles, how much of it holds, and how
it ends, at once or ringing on. The axis a visitor hears as "plucked, swelling or held".

**Heard first.** Whether a note strikes or arrives.
**Heard second.** Whether it dies away or holds.
**Heard third.** Whether it stops or rings on.

**Keys owned.**
- `robot.attack` — whether a note strikes or arrives.
- `robot.decay` — how fast it settles.
- `robot.sustain` — how much of it holds.
- `robot.release` — how it ends, at once or ringing on.
- `robot.shapedAttack` — a probe that curves its start takes the option's start too, or the curve would undo it.
- `robot.shapedRelease` — the same for a probe that curves its tail.

**Leaves alone.** Portamento and the LFO links: how a note moves, not how it is shaped. Everything the probe plays.

**Overlaps.** Takes `robot.attack` and `robot.release` from Calm, Bold and Perilous, and `robot.shapedAttack` and
`robot.shapedRelease` from Bold, Adventurous and Perilous. A theme's sentence about how its notes strike or fade does not
survive an Envelope pick.

**Distinct from.** Motion (candidate): Envelope shapes a note's loudness over its life; Motion moves its pitch and tone.

**Promise.** How the notes are shaped.

### Plucked  ·  option of envelope  ·  status: candidate

**Character.** A struck string. The note strikes at once, falls away quickly to almost nothing, and lets go; a probe that
curves its start or tail is kept as short as a plain one, so the pluck survives the curve.

**Heard first.** Every note strikes at once and dies away.
**Heard second.** Almost nothing holds.
**Heard third.** The tail is short.

**Keys owned.**
- `robot.attack` — strikes at once.
- `robot.decay` — falls away quickly.
- `robot.sustain` — to almost nothing.
- `robot.release` — and lets go.
- `robot.shapedAttack` — a probe that curves its start is kept as short as a plain one.
- `robot.shapedRelease` — the same for its tail, so the pluck survives the curve.

**Leaves alone.** Nothing in its family: all six keys are set.

**Overlaps.** Overrides `robot.attack` and `robot.release` in Calm, Bold and Perilous: Calm's "arrive rather than
strike" and "fade rather than stop" are lost under it, so Calm's sentence must not promise softness of attack.

**Distinct from.** Held. Both start promptly; Plucked dies away and lets go, Held sounds in full and rings on.

**Promise.** Strikes at once and dies away.

### Swelling  ·  option of envelope  ·  status: candidate

**Character.** A note that arrives. Each one rises slowly out of nothing, plain or curved, into a high held level, and
ends however the theme ends it.

**Heard first.** Each note rises slowly out of nothing.
**Heard second.** And holds high once it is there.
**Heard third.** The rise is the whole character; the end is the theme's.

**Keys owned.**
- `robot.attack` — rises slowly out of nothing.
- `robot.shapedAttack` — plain or curved: a curved probe rises as slowly.
- `robot.sustain` — into a high held level.

**Leaves alone.** `robot.decay`, `robot.release`, `robot.shapedRelease`: how the note ends is the theme's.

**Overlaps.** Overrides `robot.attack` in Calm, Bold and Perilous and `robot.shapedAttack` in Bold, Adventurous and
Perilous: Bold's and Perilous's "strike" is lost under it, so neither may promise a hard start.

**Distinct from.** Held. Held starts promptly and rings on; Swelling starts slowly and ends as the theme does.

**Promise.** Rises slowly into each note and holds it high.

### Held  ·  option of envelope  ·  status: candidate

**Character.** An organ key. The note starts promptly, sounds in full for as long as it lasts, and rings on long after
it is let go, curved or plain.

**Heard first.** Each note rings on long after it ends.
**Heard second.** It sounds in full while it lasts.
**Heard third.** It starts promptly, without a strike.

**Keys owned.**
- `robot.attack` — starts promptly, without a strike.
- `robot.sustain` — sounds in full for as long as it lasts.
- `robot.release` — rings on long after it is let go.
- `robot.shapedRelease` — curved or plain: a curved tail rings as long.

**Leaves alone.** `robot.decay`, `robot.shapedAttack`: the theme's.

**Overlaps.** Overrides `robot.attack` and `robot.release` in Calm, Bold and Perilous and `robot.shapedRelease` in
Adventurous and Perilous: Perilous's "gone at once" is lost under it, so Perilous must not promise short notes.

**Distinct from.** Plucked and Swelling, as on their sheets.

**Promise.** Sounds in full and rings on.

### Distance  ·  family  ·  status: candidate

**Character.** How far off a probe sits in the theme's rooms: how deep into the reverb and how deep into the delay. The
rooms' own size is the theme's; Distance sinks a probe into them or pulls it out. The axis a visitor hears as "near,
far, or at the edge of range".

**Heard first.** How much of the wash each probe is in.
**Heard second.** Whether an echo follows it.
**Heard third.** Nothing else: the rooms stay the size they were.

**Keys owned.**
- `reverbSend` — how deep into the reverb.
- `delaySend` — how deep into the delay.

**Leaves alone.** `reverb.decay`, `delay.delayTime` and every other room row: the theme's. The three effect-room sends
(Grit, Shimmer, Double): the theme's.

**Overlaps.** Takes `reverbSend` and `delaySend` from every current theme. A theme's sentence about how wet or dry its
fleet is does not survive a Distance pick: Calm's wash and Bold's and Perilous's dryness are both at risk.

**Distinct from.** Motion (candidate), if Motion takes the three effect-room sends: Distance would then be the two fixed
rooms only. Honest note: on the "axis a visitor can hear" test this family is the weakest of the four; its options are
three depths of one effect, and the intent names it as the one to repropose.

**Promise.** How far off the probes sound.

### Near  ·  option of distance  ·  status: candidate

**Character.** At the receiver. The probe is dry, with next to no wash and almost never an echo; most probes carry no
reverb at all.

**Heard first.** Dry, right at the receiver.
**Heard second.** Hardly any echo anywhere.
**Heard third.** The room is heard only on the few probes still in it.

**Keys owned.**
- `reverbSend` — dry, with next to no wash: most probes carry none.
- `delaySend` — almost never an echo.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides both sends in every current theme: Calm's "every probe sits in the wash" is lost under it, so
Calm must not promise the wash.

**Distinct from.** Far: Near is dry, Far is deep in the reverb.

**Promise.** Close and dry.

### Far  ·  option of distance  ·  status: candidate

**Character.** Well off. Every probe is deep in the reverb and few carry any echo; the fleet is one wash with little
definition.

**Heard first.** Everything is deep in the wash.
**Heard second.** Little echo.
**Heard third.** Probes blur together.

**Keys owned.**
- `reverbSend` — every probe deep in the reverb.
- `delaySend` — few carry any echo.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides both sends in every current theme: Bold's and Perilous's dryness is lost under it, so neither
may promise a dry fleet.

**Distinct from.** Remote: Far is wash without echo, Remote is wash and echo both.

**Promise.** Well off, deep in the wash.

### Remote  ·  option of distance  ·  status: candidate

**Character.** The edge of range. Every probe is as deep in the reverb as it can go and every probe carries a long echo;
the signal is washed out and repeating.

**Heard first.** Washed out and echoing.
**Heard second.** Every probe, not just some.
**Heard third.** The echo repeats after the note is gone.

**Keys owned.**
- `reverbSend` — as deep in the reverb as it can go, every probe.
- `delaySend` — every probe carries a long echo.

**Leaves alone.** Nothing in its family.

**Overlaps.** As Far's, and more so: no theme sentence about dryness or about "a faint echo" survives it.

**Distinct from.** Far, as above. Honest note: Near, Far and Remote are three rungs on one axis, which is what a family's
options are allowed to be; the question the cut asks is whether the axis is one a visitor cares about.

**Promise.** At the edge of range, washed out and echoing.

### Voice  ·  family  ·  status: candidate

**Character.** What a probe sounds like: the waveform it speaks with, how open its own filter is, whether it is one of
the resonant ones and how sharply, and how loud its partner layers sound beside it. The axis a visitor hears as "glassy,
woody or hollow".

**Heard first.** The tone colour of each probe.
**Heard second.** How many are resonant.
**Heard third.** How thick or thin each one is.

**Keys owned.**
- `robot.waveform` — the waveform it speaks with.
- `robot.filterFreq` — how open its own filter is.
- `robot.accentFilterFreq` — whether it is one of the resonant ones.
- `robot.accentFilterQ` — and how sharply.
- `robot.layerGain` — how loud its partner layers sound beside it.

**Leaves alone.** The master filter and EQ: the theme's. The LFO links on the layers: how the voice moves, not what it is.

**Overlaps.** Takes nothing from any current theme: no theme names a Voice key today. A theme that owns one (several
candidates do) loses it to a Voice pick.

**Distinct from.** Envelope: Voice is the colour of the sound, Envelope its shape in time.

**Promise.** What the probes sound like.

### Glassy  ·  option of voice  ·  status: candidate

**Character.** Clear and pure. The probe leans to the round waveforms under a filter left wide open, is almost never one
of the resonant ones, and its partner layers are quiet, so the fundamental rings alone.

**Heard first.** Clear, round tones.
**Heard second.** Nothing resonant, nothing buzzing.
**Heard third.** Thin: one voice, not a stack.

**Keys owned.**
- `robot.waveform` — leans to the round waveforms.
- `robot.filterFreq` — under a filter left wide open.
- `robot.accentFilterFreq` — almost never one of the resonant ones.
- `robot.layerGain` — partner layers quiet, so the fundamental rings alone.

**Leaves alone.** `robot.accentFilterQ`: the few resonant probes keep the theme's sharpness.

**Overlaps.** Overrides no current theme key. Under a candidate theme that owns a Voice key, the theme's colour sentence
is lost.

**Distinct from.** Woody: Glassy is open and thin, Woody closed and full.

**Promise.** Clear and pure.

### Woody  ·  option of voice  ·  status: candidate

**Character.** Warm and soft-edged. The probe leans to the mellow and the square waveforms under a filter brought well
down, and its partner layers sound full and are nearly always on, so each probe is a small stack.

**Heard first.** Warm, soft-edged tones.
**Heard second.** Full: each probe is a stack.
**Heard third.** The top is rounded off every probe.

**Keys owned.**
- `robot.waveform` — leans to the mellow and the square waveforms.
- `robot.filterFreq` — under a filter brought well down.
- `robot.layerGain` — partner layers full and nearly always on.

**Leaves alone.** `robot.accentFilterFreq`, `robot.accentFilterQ`: the resonant share and its sharpness are the theme's.

**Overlaps.** As Glassy's.

**Distinct from.** Hollow: both are closed; Hollow is reedy and resonant where Woody is round and full.

**Promise.** Warm and full.

### Hollow  ·  option of voice  ·  status: candidate

**Character.** Reedy, as through a tube. The probe leans to the hard-edged waveforms under a filter brought down, and
nearly half the fleet is on the resonant filter with a sharp peak, so many probes whistle at one note.

**Heard first.** Many probes whistle on a sharp resonance.
**Heard second.** Reedy, hard-edged tones.
**Heard third.** The top is closed down.

**Keys owned.**
- `robot.waveform` — leans to the hard-edged waveforms.
- `robot.filterFreq` — under a filter brought down.
- `robot.accentFilterFreq` — nearly half the fleet is on the resonant filter.
- `robot.accentFilterQ` — with a sharp peak.

**Leaves alone.** `robot.layerGain`: how full each probe is stays the theme's.

**Overlaps.** As Glassy's.

**Distinct from.** Woody, as above.

**Promise.** Reedy and resonant.

---

## Theme candidates

Ten places. Each is written as the world and the default probe, may own any key in the table (global rows included),
and names its nearest neighbour among the current five and among the other candidates. A candidate that read as more or
less of another was not written. Where the fleet's size or Humanize would suit the place, the sheet says so under "Leaves
alone" as an ask-first and owns no key for it; a pedal or a colour node a sheet wants in every world is owned by its
rows since the cut, and the register by the new register key. The three effect-room sends
are exclusive (a fresh probe carries at most one), so a sheet that raises one room's share notes that the measured
sketch will show what share it reaches beside the other two.

### Trench  ·  theme  ·  status: candidate

**Character.** The deep. The top of the sound is gone: the master filter is shut well down and the high band cut, the
low band lifted, so everything is felt as much as heard. The pulse is a crawl. The room is a cavern, its walls far: a
long tail and a late first reflection, and every probe is sunk deep in it. A probe speaks seldom and leaves long gaps
between calls, and when it moves between notes it slurs rather than steps, like a sonar sweep; its notes fade long, and
its voice is round, with no edges.

**Heard first.** The top of the sound is gone: everything felt as much as heard.
**Heard second.** Probes slur from note to note, like sonar.
**Heard third.** A cavern with far walls, and long gaps between calls.

**Keys owned.**
- `filterLPF.frequency` — the master filter shut well down: the top is gone.
- `eq3.high` — the high band cut.
- `eq3.low` — the low band lifted: felt as much as heard.
- `bpm` — the pulse is a crawl.
- `reverb.decay` — the room is a cavern: a long tail.
- `reverb.preDelay` — its walls are far: a late first reflection.
- `reverbSend` — every probe sunk deep in it.
- `robot.rhythmicDensity` — a probe speaks seldom.
- `robot.rests` — and leaves long gaps between calls.
- `robot.portamento` — most probes slur between notes rather than step, like a sonar sweep.
- `robot.release` — its notes fade long.
- `robot.waveform` — its voice is round, with no edges.
- `robot.octaveRegister` — and set low in the register: the deep (new key, see the rules).

**Leaves alone.** The delay, the colour, the pedals and the attack: Classic's; a dark world need not echo.

**Overlaps.** Melody takes `robot.rhythmicDensity`; Envelope takes `robot.release`; Distance takes `reverbSend`; Voice
takes `robot.waveform`; Motion (candidate) would take `robot.portamento`, the sonar slur. With everything picked, what
survives is the dark filter and EQ, the crawl, the cavern and the gaps: still the deep, without the sonar.

**Distinct from.** Float, the nearest current theme: Float is soft and slow in a warm near room with the top only
softened; Trench is dark, in a cavern, and its probes slide. Among the candidates, Open Water: far and wide, not dark;
Tide slides too, but bright and wet, not deep.

**Promise.** Dark and deep: the top is gone, the room is a cavern, the probes slide like sonar.

### Tidepool  ·  theme  ·  status: candidate

**Character.** The shallows at low tide: a small bright pool. The room is tiny, a short tail with no distance to the
walls, and the master filter is wide open with the high band lifted, so everything is clear and close. The pulse is
light and quick-ish. Every note is a small dry droplet: it strikes, settles at once, holds almost nothing and is gone,
with no wash and no echo; a probe that curves its start or tail is kept as short as a plain one. The voices are round
and thin, one voice each with quiet partners, and no probe is resonant. Probes speak at a middling rate, so the pool
ticks with small sounds.

**Heard first.** Every note is a small dry droplet, gone at once.
**Heard second.** Bright and close: a tiny room, nothing far.
**Heard third.** Thin, round voices ticking at a light pace.

**Keys owned.**
- `reverb.decay` — a tiny room: a short tail.
- `reverb.preDelay` — no distance to the walls.
- `reverbSend` — no wash.
- `delaySend` — no echo.
- `filterLPF.frequency` — wide open: everything clear.
- `eq3.high` — the high band lifted.
- `bpm` — a light, quick-ish pulse.
- `robot.attack` — a droplet strikes.
- `robot.decay` — settles at once.
- `robot.sustain` — holds almost nothing.
- `robot.release` — and is gone.
- `robot.shapedAttack` — a probe that curves its start is kept as short as a plain one.
- `robot.shapedRelease` — the same for its tail.
- `robot.waveform` — round, thin voices.
- `robot.layerGain` — one voice each, partners quiet.
- `robot.accentFilterFreq` — no probe is resonant.
- `robot.rhythmicDensity` — a middling rate: the pool ticks.

**Leaves alone.** Rests, dynamics, accents, the colour and the pedals: Classic's. The delay room's size: Classic's, since
no probe is in it.

**Overlaps.** Envelope takes the four stages and both shaped stages (Held makes the droplets ring: the character's first
line is lost); Distance takes both sends; Voice takes `robot.waveform`, `robot.layerGain` and `robot.accentFilterFreq`;
Melody takes `robot.rhythmicDensity`. What survives everything is the tiny bright room and the light pulse.

**Distinct from.** Anchor, the nearest current theme: Anchor is dry weight, dense and low-mid; Tidepool is dry too, but
small, delicate and bright, each note tiny. Among the candidates, Floe is glassy too, but slow and shimmering; Tidepool
has no sheen and ticks. Tide shares the name's root only: Tide slides and is wet.

**Promise.** Small, bright and close: every note a dry droplet.

### Floe  ·  theme  ·  status: candidate

**Character.** Pack ice. Slow and still, glassy and cold. Most probes are sent to the Shimmer room, so a sheen that is
not quite in tune rides on nearly every note; the shift is small, so it beats rather than clashes. The voices are pure;
notes arrive slowly, hold and ring long, curved or plain. The high band is lifted and the low floor is removed by a
high-pass set higher, so there is nothing underneath; the room is large with a long tail and every probe is in it.
Probes speak seldom.

**Heard first.** A glassy sheen, not quite in tune, rides on nearly every note.
**Heard second.** Slow and still: notes arrive, hold and ring long.
**Heard third.** Nothing underneath: thin, cold, high.

**Keys owned.**
- `shimmerSend` — most probes sent to the Shimmer room: a sheen on nearly every note.
- `frequencyShifter.shift` — the shift is small, so it beats rather than clashes.
- `robot.waveform` — the voices are pure.
- `robot.attack` — notes arrive slowly.
- `robot.sustain` — hold.
- `robot.release` — and ring long.
- `robot.shapedAttack` — a curved probe arrives as slowly.
- `robot.shapedRelease` — and rings as long.
- `bpm` — slow and still.
- `robot.rhythmicDensity` — probes speak seldom.
- `eq3.high` — the high band lifted.
- `filterHPF.frequency` — the low floor removed: nothing underneath.
- `reverb.decay` — a large room with a long tail.
- `reverbSend` — every probe in it.

**Leaves alone.** The delay, the colour and the pedals: Classic's. `gritSend` and `doubleSend`: Classic's, with the note
that a probe carries at most one room send, so the sketch will show what share the Shimmer room reaches; if the other
two crowd it out, this sheet will need to own them to lower them.

**Overlaps.** Envelope takes the stages and the shaped stages; Voice takes `robot.waveform`; Melody takes
`robot.rhythmicDensity`; Distance takes `reverbSend`; Motion (candidate), if it took the room sends, would take
`shimmerSend`, the sheen itself. What survives everything is the slow pulse, the thin cold EQ and the large room.

**Distinct from.** Float, the nearest current theme: Float is warm and soft with the top softened; Floe is cold and
bright with a sheen and nothing underneath. Among the candidates, Tidepool (bright but dry and quick) and Open Water
(far, no sheen).

**Promise.** Cold, slow and glassy, with a sheen on every note.

### Thicket  ·  theme  ·  status: candidate

**Character.** A kelp forest: thick and swaying. Most probes are sent to the Double room, where a slow, deep chorus makes
each sound like two or three of itself, and every probe's partner layers are full and on, so the fleet is a dense sway
of mid-heavy voices: the mellow and the square waveforms under a probe filter brought down, the mid band lifted, the
master filter part-closed. The pulse is unhurried, probes speak at a middling rate, and notes hold and are let go
slowly, moderately in the wash.

**Heard first.** Every probe sounds like two or three of itself, thick and swaying.
**Heard second.** Mid-heavy and warm: nothing bright, nothing thin.
**Heard third.** Unhurried, notes held and let go slowly.

**Keys owned.**
- `doubleSend` — most probes sent to the Double room.
- `chorus.depth` — a deep chorus: two or three of itself.
- `chorus.rate` — slow: swaying.
- `chorus.delayTime` — long enough to read as voices, not a smear.
- `robot.layerGain` — partner layers full and on.
- `robot.waveform` — the mellow and the square waveforms.
- `robot.filterFreq` — under a probe filter brought down.
- `eq3.mid` — the mid band lifted.
- `filterLPF.frequency` — the master filter part-closed: nothing bright.
- `bpm` — unhurried.
- `robot.rhythmicDensity` — a middling rate.
- `robot.sustain` — notes hold.
- `robot.release` — and are let go slowly.
- `reverbSend` — moderately in the wash.

**Leaves alone.** `chorus.spread` and `chorus.feedback`: Classic's. `gritSend` and `shimmerSend`: Classic's, with the
same at-most-one-room note as Floe's. The delay, the colour, the pedals, the attack, rests, dynamics and accents:
Classic's.

**Overlaps.** Voice takes `robot.waveform`, `robot.filterFreq` and `robot.layerGain` (Glassy thins the stack); Envelope
takes `robot.sustain` and `robot.release`; Melody takes `robot.rhythmicDensity`; Distance takes `reverbSend`; Motion
(candidate), if it took the room sends, would take `doubleSend`. What survives everything is the mid-heavy EQ, the
part-closed master filter, the pulse, and the chorus room itself: a probe still in it is still doubled.

**Distinct from.** Tide, the nearest current theme, and the one that shares the Double room: Tide's chorus is shallow and
short, a wobble on a thin sliding voice; Thicket's is slow and deep, each probe two or three thick voices that stand
still. Float is sparse and washed where Thicket is thick and close. Beside the Woody option: Thicket is the world Woody's
voice lives in, plus the doubling.

**Promise.** Thick, warm and swaying: every probe doubled.

### Wreck  ·  theme  ·  status: candidate

**Character.** A rusted hulk. Most probes are sent to the Grit room, so a grain sits on the notes: the drive is high and
the bit depth low, and both nodes are lit in every Wreck world since the column names them. The echo is long and will
not die: a long delay
with high feedback, every probe sent into it. The world is dark, the high band cut and the master filter down, and
slow. Probes run a long fixed figure and keep returning to the same notes, like machines still cycling, in hard-edged
voices; more probes than usual sit on a resonant filter, so some creak.

**Heard first.** The notes are rusted: a grain on them, and an echo that will not die.
**Heard second.** Machines still cycling: long fixed figures, the same notes returning.
**Heard third.** Dark and slow, with a creak on some probes.

**Keys owned.**
- `gritSend` — most probes sent to the Grit room: a grain on the notes.
- `distortion.amount` — the drive is high.
- `bitCrusher.bits` — the bit depth low: whatever nodes are lit bite hard.
- `delay.delayTime` — the echo is long.
- `delay.feedback` — and will not die.
- `delaySend` — every probe sent into it.
- `eq3.high` — dark: the high band cut.
- `filterLPF.frequency` — the master filter down.
- `bpm` — slow.
- `robot.rhythmicMotifLength` — a long fixed figure, always on.
- `robot.pitchRepeat` — the same notes returning.
- `robot.waveform` — hard-edged voices.
- `robot.accentFilterFreq` — more probes than usual on a resonant filter: some creak.

**Leaves alone.** The fold (`chebyshev.*`): the coin's, since the column does not name it; the drive and the crush are
always lit here by the rule. The three colour `wet` rows: Classic's (a grain, not a wall). `shimmerSend` and `doubleSend`:
Classic's, with the at-most-one-room note. The attack and release, rests, dynamics, accents and the reverb: Classic's.

**Overlaps.** Melody takes `robot.rhythmicMotifLength` and `robot.pitchRepeat` (Wandering stops the cycling); Voice
takes `robot.waveform` and `robot.accentFilterFreq`; Distance takes `delaySend` (Near kills the echo); Motion
(candidate), if it took the room sends, would take `gritSend`. What survives everything is the dark EQ and filter, the
slow pulse and the long-feedback delay room itself.

**Distinct from.** Shatter, the nearest current theme, and the one that shares the Grit room: Shatter is bright, fast and
rattling, a wall; Wreck is dark, slow and echoing with long tails, a hulk. Among the candidates, Trench is dark too, but
round, sliding and silent where Wreck is grainy, cycling and echoing; Beacon repeats a figure too, but clean and flat.

**Promise.** Dark, rusted and echoing: machines still cycling in the hulk.

### Tide (was Current)  ·  theme  ·  status: renamed → Tide

**Crawford's mark (2026-11-03).** Renamed and redefined: fluid, sliding, aquatic pitch and filters; a high glide, a saw
and triangle blend, gentle filter wobbles, a global chorus and a moderate delay feedback, so the world stays aquatic in
its chain even when an aspect takes the glide.

**Character.** The tide. Every probe glides from pitch to pitch over a long slide, and on many the probe filter wobbles
gently while a note lasts; notes arrive slowly, run into each other with no rests and release long, so the fleet is one
moving surface. The voices are the saw and the triangle blended. The world itself is wet: most probes are sent to the
Double room, whose chorus is set shallow, quick-ish and short-delayed, so it reads as water moving over the sound rather
than as extra voices, a slow shallow vibrato rides the whole world so even a held note is never quite still, and the
delay's feedback is moderate so each note ripples a few times behind itself, most probes sent into it.

**Heard first.** No note is fixed: each slides into the next.
**Heard second.** Water moves over the whole sound: a wobble on the notes and a ripple behind them.
**Heard third.** One surface: no gaps, notes run together, slow to arrive and slow to go.

**Keys owned.**
- `robot.portamento` — every probe glides over a long slide.
- `robot.lfoBusDepth` — on many the probe filter wobbles gently.
- `robot.attack` — notes arrive slowly.
- `robot.rests` — run into each other with no rests.
- `robot.release` — and release long.
- `robot.waveform` — the saw and the triangle blended.
- `doubleSend` — most probes sent to the Double room: water over the sound.
- `chorus.depth` — shallow: a wobble, not voices.
- `chorus.rate` — quick-ish: water moving.
- `chorus.delayTime` — short: a smear, not a second voice.
- `vibrato.wet` — a vibrato rides the whole world: lit in every Tide world by the rule.
- `vibrato.depth` — shallow: never quite still, never seasick.
- `vibrato.rate` — slow.
- `delay.feedback` — moderate: each note ripples a few times.
- `delaySend` — most probes sent into it.

**Leaves alone.** `bpm`, the density, the rooms' size, the EQ, the master filter, the probe filter's rest position,
dynamics, accents and the shaped stages: Classic's. `chorus.spread` and `chorus.feedback`: Classic's. `gritSend` and
`shimmerSend`: Classic's, with the at-most-one-room note. The Phaser: the coin's; the vibrato does the pedal's work here.
Not a band: a slow sweep on the master filter would make the world aquatic without any probe's help, and whether the
master filter is linked to a global LFO is a coin today: ask-first, still open.

**Sketch starting points (Crawford, 2026-11-03; guesses for the sketch, not rules).** Portamento 0.15 to 0.35 s; the
chorus shallow and short.

**Overlaps.** Motion (candidate) takes `robot.portamento` and `robot.lfoBusDepth`, the first line, and would take
`doubleSend` if it took the room sends; Envelope takes `robot.attack` and `robot.release`; Voice takes `robot.waveform`;
Performance (candidate) would take `robot.rests`; Distance takes `delaySend`. What survives everything is the chorus
room's setting and the delay's ripple: a probe still in the Double room is still under water, which is why the chain
carries it.

**Distinct from.** Thicket, the nearest: both send most probes to the Double room. Thicket's chorus is slow and deep with
a long delay, so each probe is two or three thick mid-heavy voices; Tide's is shallow and short, a wobble on one thin
voice, and Tide slides where Thicket stands. Trench slides too, but dark, in a cavern, and seldom. Tidepool shares the
name's root and nothing else: tiny dry droplets.

**Promise.** Fluid: everything slides, and water moves over the whole sound.

### Open Water  ·  theme  ·  status: candidate

**Character.** The pelagic: a vast open space with nothing near. The reverb is at its longest with its first reflection
late, the delay long, and every probe is deep in both, so each call comes from far off and its echo later. Probes speak
seldom and leave long gaps, so the silence between calls is the room; each is quieter than usual, as a far thing is,
and its notes fade long. Wide across the field. The master filter is partly closed, since distance dulls, and the pulse
is slow to middling.

**Heard first.** Each probe is far away, and the silence between them is the room.
**Heard second.** Every call comes back late as an echo.
**Heard third.** Quiet, dulled, wide.

**Keys owned.**
- `reverb.decay` — the reverb at its longest.
- `reverb.preDelay` — its first reflection late.
- `delay.delayTime` — the delay long: every call comes back late.
- `reverbSend` — every probe deep in the reverb.
- `delaySend` — and in the delay.
- `robot.rhythmicDensity` — probes speak seldom.
- `robot.rests` — and leave long gaps: the silence is the room.
- `robot.masterVolume` — each quieter than usual, as a far thing is.
- `robot.release` — its notes fade long.
- `stereoWidener.width` — wide across the field.
- `filterLPF.frequency` — partly closed: distance dulls.
- `bpm` — slow to middling.

**Leaves alone.** The attack, voices, colour, pedals and EQ: Classic's. The fleet's size is not a band; fewer probes
would suit the place: ask-first.

**Overlaps.** Distance takes both sends (Near pulls the fleet in: "far" is lost, so the sentence must not promise it
outright); Melody takes `robot.rhythmicDensity`; Envelope takes `robot.release`; Performance (candidate) would take
`robot.rests`. What survives everything is the longest room with the late echo, the quiet, the width and the dulled
filter: still a vast space.

**Distinct from.** Float, the nearest current theme: Float is soft and slow in a warm near room with no echo; Open Water
is far, quiet, with long gaps and a late echo, space rather than softness. Among the candidates, Trench is dark, narrow
and sliding where Open Water is not dark; Floe has its sheen.

**Promise.** Vast and far: each call from a distance, its echo late.

### Vent Field  ·  theme  ·  status: candidate

**Character.** Hydrothermal vents: hot and bubbling. Nearly every probe is on the resonant filter, set low with a sharp
peak, and the filter sweeps on most of them, so the fleet squelches and whistles in hard-edged voices. Probes speak
often with short notes that settle fast and hold little, and a pitch that ranges wide, so the surface bubbles. The low
and mid bands are lifted, the master filter part-closed, the pulse middling to fast.

**Heard first.** The probes squelch and whistle: a resonant peak sweeps through nearly every one.
**Heard second.** Bubbling: short notes, often, ranging wide.
**Heard third.** Hot and low-heavy, the top part-closed.

**Keys owned.**
- `robot.accentFilterFreq` — nearly every probe on the resonant filter, set low.
- `robot.accentFilterQ` — with a sharp peak.
- `robot.lfoBusDepth` — the filter sweeps on most of them.
- `robot.waveform` — hard-edged voices.
- `robot.rhythmicDensity` — probes speak often.
- `robot.attack` — short notes.
- `robot.decay` — that settle fast.
- `robot.sustain` — and hold little.
- `robot.noteVariance` — a pitch that ranges wide.
- `eq3.low` — the low band lifted.
- `eq3.mid` — and the mid.
- `filterLPF.frequency` — the top part-closed.
- `bpm` — middling to fast.
- `autoWah.wet` — the whole world's filter chews on the loud notes too: the Auto-Wah lit in every Vent Field world by
  the rule.
- `autoWah.baseFrequency` — set low: the squelch starts in the mud.
- `autoWah.Q` — sharp: it whistles as it opens.

**Leaves alone.** The Phaser: the coin's; the wah is the squelch, the Phaser would only swirl. The rooms and sends,
rests, dynamics, accents and release: Classic's.

**Overlaps.** Voice takes `robot.accentFilterFreq`, `robot.accentFilterQ` and `robot.waveform` (Glassy silences the
whistle: the first line is lost); Motion (candidate) would take `robot.lfoBusDepth`, the sweep; Melody takes
`robot.rhythmicDensity` and `robot.noteVariance`; Envelope takes `robot.attack`, `robot.decay` and `robot.sustain`. What
survives everything is the low-heavy EQ, the part-closed top and the pulse.

**Distinct from.** Shatter, the nearest current theme: Shatter is bright crunch that does not move; Vent Field is a
resonant filter that never stops moving, low and squelching, and that movement is the whole identity (Crawford,
2026-11-03: push Vent Field all the way into its sweep). Among the candidates, Wreck is grainy and slow. Beside the Hollow
option: Vent Field is the world Hollow's voice lives in, plus the sweep and the bubbling.

**Promise.** Hot and bubbling: resonant probes squelching and whistling.

### Beacon  ·  theme  ·  status: candidate

**Character.** The lighthouse. The same short phrase comes round again and again, with its echo. Every probe runs a long
figure that is always on, keeps its pitch close and returns to the same notes; it plays flat, with no marks and few
gaps, so nothing varies but the turn of the figure. Every probe is sent into a delay with high feedback whose echo falls
well behind the phrase, so each phrase is answered by its own repeats, with little wash around it. The pulse is slow to
middling and probes speak at a middling-low rate.

**Heard first.** The same short phrase comes round again and again, with its echo.
**Heard second.** Flat and even: no note louder than another, no mark.
**Heard third.** Dry but echoing: the repeats are the only room.

**Keys owned.**
- `robot.rhythmicMotifLength` — a long figure that is always on.
- `robot.noteVariance` — keeps its pitch close, never off.
- `robot.pitchRepeat` — returns to the same notes.
- `robot.dynamics` — plays flat.
- `robot.accents` — with no marks.
- `robot.rests` — few gaps.
- `delaySend` — every probe sent into the delay.
- `delay.feedback` — with high feedback: answered by its own repeats.
- `delay.delayTime` — whose echo falls well behind the phrase, not on top of it.
- `reverbSend` — little wash.
- `bpm` — slow to middling.
- `robot.rhythmicDensity` — a middling-low rate.

**Leaves alone.** The envelope, voices, EQ, master filter, colour and pedals: Classic's. A beacon would want no Humanize,
which is a seeded global setting and not a band: ask-first.

**Overlaps.** Melody takes `robot.rhythmicMotifLength`, `robot.noteVariance`, `robot.pitchRepeat` and
`robot.rhythmicDensity` (Wandering ends the beacon); Performance (candidate) would take `robot.dynamics`,
`robot.accents` and `robot.rests`; Distance takes `delaySend` and `reverbSend` (Near kills the echo). What survives
everything is the feedback room and the pulse. Beacon is the theme most made of probe keys: with Melody and Distance
picked, almost nothing of it is left, and its sentence must say "the probes" rather than "the world".

**Distinct from.** Float, the nearest current theme by pace: Float's probes vary and play short gentle cells; Beacon's
repeat one long figure. Among the candidates, Wreck also cycles, but dark and dirty. Beside the Mechanical option: Beacon
is the world, sparser, flat and echoing; Mechanical is one family's point at high density.

**Promise.** One phrase, round and round, with its echo.

### Squall  ·  theme  ·  status: candidate

**Character.** A storm. The fleet surges and drops: probes play with wide dynamics and hard marks, break off in gusts
and start again, and the master compressor clamps hard so the whole world pumps with them. The pulse is fast; probes
speak often, with a wide-ranging pitch and short hard notes; many are sent to the Grit room, so the loud ones tear. Loud,
with the low band lifted and the field wide.

**Heard first.** The fleet surges and drops: loud bursts, sudden gaps, nothing steady.
**Heard second.** Hard marks on the notes, and a tearing edge on the loud ones.
**Heard third.** Fast, wide and low-heavy.

**Keys owned.**
- `robot.dynamics` — wide dynamics: surges and drops.
- `robot.accents` — hard marks.
- `robot.rests` — break off in gusts and start again.
- `compressor.threshold` — the master compressor clamps hard: the whole world pumps.
- `compressor.ratio` — clamps hard.
- `bpm` — the pulse is fast.
- `robot.rhythmicDensity` — probes speak often.
- `robot.noteVariance` — a wide-ranging pitch.
- `robot.attack` — short hard notes.
- `robot.release` — short.
- `gritSend` — many sent to the Grit room: the loud ones tear.
- `robot.masterVolume` — loud.
- `eq3.low` — the low band lifted.
- `stereoWidener.width` — the field wide.
- `tremolo.wet` — the whole world throbs under the gusts: the Tremolo lit in every Squall world by the rule.
- `tremolo.depth` — deep: a throb, not a shimmer.
- `tremolo.rate` — slow to middling: weather, not a buzz.

**Leaves alone.** The compressor's attack, release and knee: Classic's. The rooms, voices and master filter: Classic's. `shimmerSend` and
`doubleSend`: Classic's, with the at-most-one-room note.

**Overlaps.** Performance (candidate) would take `robot.dynamics`, `robot.accents` and `robot.rests`: the whole first
line. Melody takes `robot.rhythmicDensity` and `robot.noteVariance`; Envelope takes `robot.attack` and `robot.release`;
Motion (candidate), if it took the room sends, would take `gritSend`. What survives everything is the pumping
compressor, the fast pulse, and the loud, low-heavy, wide world.

**Distinct from.** Shatter, the nearest current theme: Shatter is a steady wall that never stops and never pumps;
Squall stops and starts, loud and soft, and the pumping compressor is Squall's alone (Crawford, 2026-11-03). Both lean
on the Grit room: Squall's loud ones tear, Shatter's every note crunches. Among the candidates, Vent Field bubbles
steadily and resonates where Squall gusts and tears.

**Promise.** Stormy: surging, gusting, tearing, nothing steady.

---

## Family and option candidates

Two or three extra options for each current family, Distance reproposed on the axis test, and two candidate families,
Motion and Performance, each with three options. A family sheet states the axis, why its options are distinct from one
another before any number exists, and its key set; each option is a sheet of its own. No key is in two families' key
sets across the current and the candidate families, and every candidate family key is a probe band or a send.

### Melody candidates

### Chanting  ·  option of melody  ·  status: candidate

**Character.** A probe that chants. It tiles a figure of two or three notes without end, keeps its pitch close, comes
back to the same notes nearly every time, and speaks at a brisk, even rate: a short ostinato.

**Heard first.** A short figure of two or three notes, chanted without end.
**Heard second.** Brisk and even.
**Heard third.** Always the same notes.

**Keys owned.**
- `robot.rhythmicMotifLength` — tiles a figure of two or three notes without end: short, and never off.
- `robot.noteVariance` — keeps its pitch close, never off.
- `robot.pitchRepeat` — comes back to the same notes nearly every time.
- `robot.rhythmicDensity` — a brisk, even rate.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides `robot.rhythmicDensity` in Calm, Bold and Perilous, and every Melody key the Beacon and Wreck
candidates own: under Chanting their long figure becomes a short one.

**Distinct from.** Hypnotic, which circles with no figure at a middling pace; Mechanical, which drives a long figure at a
high rate. Chanting is the short figure between them.

**Promise.** Chants a short figure over and over.

### Tumbling  ·  option of melody  ·  status: candidate

**Character.** A probe that tumbles. It speaks nearly all the time, ranges wide in pitch, never tiles a figure and rarely
returns to a note: a cascade that never settles.

**Heard first.** Notes tumble over each other, fast and wide, never settling.
**Heard second.** No figure, no return.
**Heard third.** The busiest probes in any family.

**Keys owned.**
- `robot.rhythmicDensity` — speaks nearly all the time.
- `robot.noteVariance` — ranges wide in pitch, never off.
- `robot.rhythmicMotifLength` — never tiles a figure: always off.
- `robot.pitchRepeat` — rarely returns to a note.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides `robot.rhythmicDensity` in Calm, Bold and Perilous (Calm's "seldom" is lost), and the Melody keys
of the Beacon and Wreck candidates (their cycling is lost).

**Distinct from.** Wandering, which roams wide but sparse; Mechanical, which is busy but fixed. Tumbling is busy and
loose.

**Promise.** Fast, wide and loose: a cascade.

### Telegraph  ·  option of melody  ·  status: candidate

**Character.** A probe that signals. It speaks rarely, in clipped bursts of a long fixed figure on one or two notes,
returning to them about as often as not: dots and dashes from far off.

**Heard first.** Dots and dashes: a rare, clipped signal on one or two notes.
**Heard second.** The same long pattern each time it speaks.
**Heard third.** Long silences between.

**Keys owned.**
- `robot.rhythmicDensity` — speaks rarely.
- `robot.rhythmicMotifLength` — a long fixed figure, never off.
- `robot.noteVariance` — on one or two notes, never off.
- `robot.pitchRepeat` — returning to them about as often as not.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides `robot.rhythmicDensity` in Calm, Bold and Perilous (Bold's and Perilous's crowd is lost), and
the Melody keys of the Beacon and Wreck candidates.

**Distinct from.** Hypnotic, which circles at a middling pace; Chanting, which is busy. Telegraph is the sparse, fixed
corner of the family.

**Promise.** A rare, clipped signal.

### Envelope candidates

### Bowed  ·  option of envelope  ·  status: candidate

**Character.** A bowed string. Each note is drawn in slowly, holds high while it lasts, and is drawn out slowly after,
curved or plain: slow in and slow out.

**Heard first.** Each note is drawn in slowly and drawn out slowly, like a bow.
**Heard second.** It holds high in between.
**Heard third.** Nothing strikes, nothing stops.

**Keys owned.**
- `robot.attack` — drawn in slowly.
- `robot.sustain` — holds high while it lasts.
- `robot.release` — drawn out slowly after.
- `robot.shapedAttack` — a curved probe is drawn in as slowly.
- `robot.shapedRelease` — and out as slowly.

**Leaves alone.** `robot.decay`: with the sustain high there is little to decay into; the theme's.

**Overlaps.** Overrides `robot.attack` and `robot.release` in Calm, Bold and Perilous and the shaped stages in Bold,
Adventurous and Perilous: Bold's and Perilous's strike is lost. Under the Tidepool candidate the droplet is lost.

**Distinct from.** Swelling, which is slow in and ends as the theme ends; Held, which starts promptly and rings on. Bowed
is slow at both ends.

**Promise.** Slow in, slow out, like a bow.

### Hammered  ·  option of envelope  ·  status: candidate

**Character.** A key struck and cut off. Each note switches on at once, sounds in full for as long as it lasts, and stops
dead when it ends, curved or plain: a hard start and a dead stop with nothing in between.

**Heard first.** Each note switches on and off: a hard start and a dead stop.
**Heard second.** Full while it lasts.
**Heard third.** No tail at all.

**Keys owned.**
- `robot.attack` — switches on at once.
- `robot.sustain` — sounds in full for as long as it lasts.
- `robot.release` — stops dead when it ends.
- `robot.shapedAttack` — a curved probe switches on as fast.
- `robot.shapedRelease` — and stops as dead.

**Leaves alone.** `robot.decay`: with the sustain full the decay has nowhere to go; the theme's.

**Overlaps.** Overrides `robot.attack` and `robot.release` in Calm, Bold and Perilous (Calm's "arrive" and "fade" are
lost) and the shaped stages in Bold, Adventurous and Perilous.

**Distinct from.** Plucked, which strikes and dies away; Held, which starts promptly and rings on. Hammered neither dies
away nor rings: it stops.

**Promise.** On and off: a hard start, a dead stop.

### Breathing  ·  option of envelope  ·  status: candidate

**Character.** A sigh. Each note comes in over a moment, falls away to a low level, and lingers after it is let go,
curved or plain: it swells a little, gives way, and is slow to leave.

**Heard first.** Each note is a sigh: it comes in, falls away, and lingers.
**Heard second.** Little is held.
**Heard third.** The tail is longer than the note.

**Keys owned.**
- `robot.attack` — comes in over a moment.
- `robot.decay` — falls away.
- `robot.sustain` — to a low level.
- `robot.release` — and lingers after it is let go.
- `robot.shapedAttack` — a curved probe comes in as slowly.
- `robot.shapedRelease` — and lingers as long.

**Leaves alone.** Nothing in its family: all six keys are set.

**Overlaps.** Overrides `robot.attack` and `robot.release` in Calm, Bold and Perilous and the shaped stages in Bold,
Adventurous and Perilous: Perilous's "gone at once" is lost.

**Distinct from.** Plucked, which strikes and has a short tail; Bowed, which holds high. Breathing gives way in the
middle and lingers at the end.

**Promise.** Comes in, gives way, lingers.

### Distance, reproposed

The Distance family sheet above stands, with its axis: how far off a probe sits in the theme's rooms. On the test the
intent sets, an axis a visitor can hear, its weakness is that Near, Far and Remote are three depths of the same thing,
and depth is a knob rather than a character. The two candidates below widen the axis to two kinds of distance a visitor
would name differently: distance heard as echo, and a field with depth in it. If the cut keeps Distance, these are its
other points; if Motion takes the three effect-room sends, Distance keeps the two fixed rooms either way, and the send
derive function does not split for Distance's sake.

### Echoing  ·  option of distance  ·  status: candidate

**Character.** A hard-walled space. Every probe is sent deep into the delay and only lightly into the reverb, so distance
is heard as repeats rather than wash: a call, and the call again.

**Heard first.** Every probe repeats: distance heard as echo, not wash.
**Heard second.** Little reverb around the repeats.
**Heard third.** The rooms' own size is still the theme's.

**Keys owned.**
- `delaySend` — every probe sent deep into the delay: a call, and the call again.
- `reverbSend` — only lightly into the reverb: repeats rather than wash.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides both sends in every current theme: Calm's wash and Bold's and Perilous's dryness are both lost.
Under the Beacon candidate it agrees with the theme; under Trench and Open Water the wash is lost.

**Distinct from.** Remote, which is deep in both rooms; Near, which is in neither. Echoing is deep in one.

**Promise.** Echoing, not washed.

### Half-heard  ·  option of distance  ·  status: candidate

**Character.** A field with depth in it. Half the probes are dry and present and half are far off in the reverb, with an
echo on about half as well, so a visitor hears near and far at once and the fleet has a foreground and a background.

**Heard first.** Half the fleet is close and half far off: the field has depth.
**Heard second.** Some probes echo, some do not.
**Heard third.** The far ones are as far as Far's.

**Keys owned.**
- `reverbSend` — half the probes dry and present, half far off in the reverb.
- `delaySend` — an echo on about half.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides both sends in every current theme: Calm's "none is dry" and Perilous's "the fleet is dry" are
both half lost.

**Distinct from.** Far, where every probe is far; Near, where every probe is close. Half-heard is the one option that is
not a single depth.

**Promise.** Near and far at once.

### Voice candidates

### Brassy  ·  option of voice  ·  status: candidate

**Character.** Bright and edged. The probe leans to the sawtooth under a filter left open, its partner layers full and
always on, and it is almost never one of the resonant ones: a brass section, loud and plain.

**Heard first.** Bright and brassy: edged tones with the filter open and every layer on.
**Heard second.** Loud and full.
**Heard third.** Nothing resonant, nothing whistling.

**Keys owned.**
- `robot.waveform` — leans to the sawtooth.
- `robot.filterFreq` — under a filter left open.
- `robot.layerGain` — partner layers full and always on.
- `robot.accentFilterFreq` — almost never one of the resonant ones.

**Leaves alone.** `robot.accentFilterQ`: the few resonant probes keep the theme's sharpness.

**Overlaps.** Overrides no current theme key. Under Trench, Floe, Thicket, Wreck, Vent Field or Tidepool the theme's
voice sentence is lost.

**Distinct from.** Glassy, which is round and thin; Hollow, which is closed and resonant. Brassy is edged, open and full.

**Promise.** Bright, edged and full.

### Muted  ·  option of voice  ·  status: candidate

**Character.** Muffled and quiet. The probe leans to the round waveforms under a filter brought right down, its partner
layers quiet and rarely on, and none is resonant: a voice behind a wall.

**Heard first.** Muffled and quiet: round tones under a filter brought right down.
**Heard second.** Thin: one voice, partners silent.
**Heard third.** Nothing resonant.

**Keys owned.**
- `robot.waveform` — leans to the round waveforms.
- `robot.filterFreq` — under a filter brought right down.
- `robot.layerGain` — partner layers quiet and rarely on.
- `robot.accentFilterFreq` — none is resonant.

**Leaves alone.** `robot.accentFilterQ`: the theme's.

**Overlaps.** As Brassy's.

**Distinct from.** Woody, which is closed but full and warm; Glassy, which is round but open. Muted is closed and thin.

**Promise.** Muffled, behind a wall.

### Chiming  ·  option of voice  ·  status: candidate

**Character.** A bell. The probe speaks with a pure fundamental under an open filter, and its partner layers ring loud
above it and are always on, so every note carries its partials; none is resonant.

**Heard first.** Bell-like: a pure fundamental with its partials ringing loud above it.
**Heard second.** Open and clear.
**Heard third.** Nothing resonant.

**Keys owned.**
- `robot.waveform` — a pure fundamental.
- `robot.filterFreq` — under an open filter.
- `robot.layerGain` — partner layers ring loud above it and are always on.
- `robot.accentFilterFreq` — none is resonant.

**Leaves alone.** `robot.accentFilterQ`: the theme's.

**Overlaps.** As Brassy's.

**Distinct from.** Glassy, its nearest neighbour: both are pure and open; Glassy's partners are quiet and Chiming's ring
loud, which is the whole difference and the thing the listen must hear. Brassy is edged.

**Promise.** Bell-like, partials ringing.

### Motion

### Motion  ·  family  ·  status: candidate

**Character.** How a probe moves while it sounds: whether it slides from one note into the next, whether its tone wavers
in pitch or loudness while a note holds, and whether its filter sweeps. The axis a visitor hears as "still, sliding,
trembling or sweeping". Its three options are distinct because each lights a different mechanism rather than a
different depth of one: the slide, the waver, the sweep, each with the other two held still.

**Heard first.** Whether a probe slides into its notes.
**Heard second.** Whether its tone wavers while it holds.
**Heard third.** Whether a filter sweep rolls through it.

**Keys owned.**
- `robot.portamento` — whether it slides from one note into the next.
- `robot.lfoDetuneDepth` — whether its tone wavers in pitch while a note holds.
- `robot.lfoGainDepth` — or in loudness.
- `robot.lfoBusDepth` — whether its filter sweeps.

**Leaves alone.** The three effect-room sends (`gritSend`, `shimmerSend`, `doubleSend`): how a probe is coloured, not how
it moves; they stay the theme's, which also leaves Distance's two sends untouched and the send derive function whole.
Pitch drift stays the docking lifecycle's: no theme's or family's business (Crawford, 2026-11-03). The fixed detune
between a probe's layers (`robot.detune`, new at the cut) could belong here or stay the theme's: open until the family
marks. Which shared lane a link rides is a draw, not a band.

**Overlaps.** Takes `robot.portamento` from the Trench and Current candidates (the sonar slur, the drift's slide) and the
three LFO depths from Current and `robot.lfoBusDepth` from Vent Field (the sweep). A theme's sentence about sliding or
sweeping does not survive a Motion pick. No current theme names a Motion key.

**Distinct from.** Envelope, which shapes a note's loudness over its life; Voice, which is the colour the note holds.
Motion is what changes while the note sounds.

**Promise.** How the probes move while they sound.

### Gliding  ·  option of motion  ·  status: candidate

**Character.** A probe that slides. Every one glides into every note over a long slide, and nothing else moves: the
layers hold still, the filter holds still, so the slide is heard clean.

**Heard first.** Every probe slides into every note.
**Heard second.** Long slides, not slurs.
**Heard third.** Nothing else moves.

**Keys owned.**
- `robot.portamento` — every one glides into every note over a long slide.
- `robot.lfoDetuneDepth` — the layers hold still in pitch.
- `robot.lfoGainDepth` — and in loudness.
- `robot.lfoBusDepth` — the filter holds still: the slide is heard clean.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides the Motion keys of the Trench, Current and Vent Field candidates: Vent Field's sweep is lost under
it; Trench's and Current's slides are kept or lengthened.

**Distinct from.** Trembling and Sweeping, which hold the pitch step and move the tone; Gliding moves the pitch and holds
the tone.

**Promise.** Slides into every note.

### Trembling  ·  option of motion  ·  status: candidate

**Character.** A probe that trembles. Every one's layers waver in pitch and in loudness while a note holds, deep enough to
hear as a tremor; no probe slides, and no filter sweeps, so the tremor is heard clean.

**Heard first.** Every probe's tone wavers in pitch and loudness while it holds.
**Heard second.** No slides between notes.
**Heard third.** The filter holds still.

**Keys owned.**
- `robot.lfoDetuneDepth` — the layers waver in pitch while a note holds, deep enough to hear.
- `robot.lfoGainDepth` — and in loudness.
- `robot.portamento` — no probe slides.
- `robot.lfoBusDepth` — and no filter sweeps: the tremor is heard clean.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides the Motion keys of Trench, Current and Vent Field: Trench's slur and Vent Field's sweep are lost.

**Distinct from.** Gliding, as above; Sweeping, which moves the filter and holds the layers.

**Promise.** Trembles while it holds.

### Sweeping  ·  option of motion  ·  status: candidate

**Character.** A probe whose filter sweeps. A deep filter sweep rolls through every probe while it sounds, opening and
closing the tone; no probe slides and the layers hold still, so the sweep is the only motion.

**Heard first.** A filter sweep rolls through every probe.
**Heard second.** Deep: the tone opens and closes.
**Heard third.** Nothing else moves.

**Keys owned.**
- `robot.lfoBusDepth` — a deep filter sweep rolls through every probe.
- `robot.portamento` — no probe slides.
- `robot.lfoDetuneDepth` — the layers hold still in pitch.
- `robot.lfoGainDepth` — and in loudness: the sweep is the only motion.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides the Motion keys of Trench, Current and Vent Field: Vent Field's sweep is kept or deepened; Trench's
and Current's slides are lost.

**Distinct from.** Gliding and Trembling, as above.

**Promise.** A sweep through every probe.

### Performance

### Performance  ·  family  ·  status: candidate

**Character.** How a probe plays its line, whatever the line is: how much louder and softer it gets from note to note,
how often a note carries a mark and how hard, and how often it breaks a note off short and leaves a gap. The axis a
visitor hears as "even, acted, or halting". Its three options are distinct because each leans on a different one of the
three: Steady flattens all three, Dramatic raises the swell and the marks, Halting raises the gaps.

**Heard first.** Whether the probes play even or surge.
**Heard second.** Whether notes carry marks.
**Heard third.** Whether lines break off.

**Keys owned.**
- `robot.dynamics` — how much louder and softer it gets from note to note.
- `robot.accents` — how often a note carries a mark and how hard.
- `robot.rests` — how often it breaks a note off short and leaves a gap.

**Leaves alone.** Humanize, the small timing scatter, would belong here and is a seeded global setting, not a band:
ask-first. The notes themselves (Melody) and their shape (Envelope).

**Overlaps.** Takes `robot.rests` from every current theme but Classic (Calm's "stops short of the end of a phrase",
Bold's "little left out", Adventurous's spread, Perilous's "hardly a rest" are all lost under a Performance pick, so none
of those sentences may promise its rests), and from the Trench, Current, Open Water, Beacon and Squall candidates.
Takes `robot.dynamics` and `robot.accents` from Beacon (its flatness) and Squall (its surges and marks: the whole first
line).

**Distinct from.** Melody, which decides the notes; Performance decides how hard and how whole they are played.

**Promise.** How the probes play their lines.

### Steady  ·  option of performance  ·  status: candidate

**Character.** Even and plain. Every note carries the same weight, none is marked and almost none is cut short: the line
is played straight.

**Heard first.** Even and plain: every note the same weight, none marked, none cut short.
**Heard second.** No gaps.
**Heard third.** The line is all there is.

**Keys owned.**
- `robot.dynamics` — every note the same weight.
- `robot.accents` — none is marked.
- `robot.rests` — almost none is cut short.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides `robot.rests` in every current theme but Classic: Calm's gaps and Perilous's lack of them both
give way to "almost none". Agrees with Beacon; undoes Squall.

**Distinct from.** Dramatic, its opposite on dynamics and marks; Halting, its opposite on gaps.

**Promise.** Played straight.

### Dramatic  ·  option of performance  ·  status: candidate

**Character.** Acted. Every line is played loud and soft, nearly every note carries a mark and the hardest marks are
unlocked, and now and then a note is cut short for effect: the line is shaped rather than stated.

**Heard first.** Every line is acted: loud and soft, marked and shaped.
**Heard second.** Hard marks, the hardest included.
**Heard third.** An occasional cut for effect.

**Keys owned.**
- `robot.dynamics` — played loud and soft.
- `robot.accents` — nearly every note carries a mark, the hardest unlocked.
- `robot.rests` — now and then a note cut short for effect.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides `robot.rests` in every current theme but Classic; agrees with Squall and undoes Beacon's flatness.

**Distinct from.** Steady, as above; Halting, where the gaps lead and the marks are mild.

**Promise.** Acted: loud and soft, marked.

### Halting  ·  option of performance  ·  status: candidate

**Character.** Broken off. Most notes are cut short and the gaps are deep, so the line stutters; the weight varies a
little and the marks are the mild ones only, so the halting is heard as hesitation, not drama.

**Heard first.** Lines break off: notes cut short, gaps everywhere.
**Heard second.** Hesitant, not loud.
**Heard third.** Only the mildest marks.

**Keys owned.**
- `robot.rests` — most notes cut short, the gaps deep.
- `robot.dynamics` — the weight varies a little.
- `robot.accents` — the mild marks only.

**Leaves alone.** Nothing in its family.

**Overlaps.** Overrides `robot.rests` in every current theme but Classic: Perilous's "hardly a rest" and Bold's "little
left out" are lost; Calm's gaps deepen. Undoes Current's "no rests at all".

**Distinct from.** Steady, which has no gaps; Dramatic, which is loud where Halting is hesitant.

**Promise.** Halting: broken off, hesitant.

---

## Cut

### Adventurous  ·  theme  ·  status: cut

**Crawford's mark (2026-11-03).** Cut. Not a place: a spread, heard only across worlds, as the sheet itself says.

**Character.** Not a place: a dice cup. Every band it names is widened past Classic's, so one seed lands a crawl in a
cavern and the next a sprint in a cupboard. What a visitor hears in one world is one draw from that spread; the width is
heard only across worlds, which a first-time visitor does not do. Its one in-world trait is that more probes than usual
bend the start or the tail of a note.

**Heard first.** More probes than usual bend the start or the tail of a note.
**Heard second.** Whatever this seed drew: the pulse may be a crawl or a run, the room dry or drowned.
**Heard third.** Nothing a visitor can name as the theme's own.

**Keys owned.**
- `robot.shapedAttack` — more probes than usual bend the start of a note.
- `robot.shapedRelease` — or its tail.
- `bpm` — the pulse may be a crawl or a run.
- `robot.rests` — a probe may leave out almost nothing or almost everything.
- `reverbSend` — the fleet may be dry or drowned.
- `delaySend` — with no echo or a long one.
- `filterLPF.frequency` — the top may be shut down or wide open.

**Leaves alone.** Density, the plain attack and release: Classic's (a band equal to Classic's is a no-op the tests
forbid, so the placeholder could not widen them). Everything else: Classic's.

**Overlaps.** Envelope takes `robot.shapedAttack` and `robot.shapedRelease`, the one trait a visitor could name; Distance
takes `reverbSend` and `delaySend`. With both picked nothing of the character survives in a single world.

**Distinct from.** Classic. Both are wide; this one is wider in seven keys. Inside a minute, on most seeds, a visitor
cannot tell them apart. This sheet is written so that can be seen: the sentences above are statistics, not a character,
and the sheet expects the cut.

**Promise.** It cannot promise a sound; it can only promise a spread.
