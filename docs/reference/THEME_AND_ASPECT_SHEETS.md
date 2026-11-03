# Theme and Aspect Character Sheets

The character sheets of roadmap [58](../todo/roadmap.md#58-themes-and-aspects-refinement) (spec
[THEME_AND_ASPECTS_REFINEMENT.md](../specs/THEME_AND_ASPECTS_REFINEMENT.md), the section on the character sheets; plan
[THEME_AND_ASPECTS_REFINEMENT.md](../tasks/THEME_AND_ASPECTS_REFINEMENT.md), the paper phase). One sheet for every
theme, aspect family and option that is live in `src/data/bands/themes.ts` and `src/data/bands/aspects.ts`, and one for
every candidate. The choice between them is made on this file, before any column is written.

## The rules

- **No numbers.** A sheet says what a visitor hears, never a band's edges. Numbers come at the column, each cited to a
  line here, and are measured and listened to afterwards. The only digit a sheet may carry is one inside a band key's
  own name.
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
  the key is the contract. The pedals and the colour nodes are lit by a seeded coin that is not a band, so a sheet
  that wants one heard in every world says so under "Leaves alone" as an ask-first rather than owning the pedal's rows:
  a theme can shape a lit pedal but cannot light it. The three effect rooms (Grit, Shimmer, Double) are different: they
  light when a probe's send feeds them, and the sends are bands.
- **Not bands:** the octave register, the fleet's size, pitch drift (the docking lifecycle's) and Humanize (a seeded
  global setting). A sheet that needs one of these names it under "Leaves alone" as an ask-first.

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

**Distinct from.** Adventurous. Both are wide; Classic is the surveyed width and Adventurous wider still in the handful
of keys it names. Inside a minute a visitor may not tell them apart on most seeds, and that is Adventurous's problem
(its sheet says so), not Classic's.

**Promise.** The receiver as it came: the whole range, every kind of probe at once.

### Calm  ·  theme  ·  status: candidate

**Character.** Slack water: a world where nothing hurries. The pulse is a slow walk, the master filter softens the top
off the whole fleet, and every probe sits in the room's wash with a faint echo behind it. Each probe speaks seldom and
often stops short of the end of a phrase, leaving the room to answer; notes arrive rather than strike and fade rather
than stop. No probe is dry, no probe is sharp, no probe is in a hurry.

**Heard first.** Nothing hurries: a slow pulse and long gaps.
**Heard second.** Every note arrives softly and fades rather than stops.
**Heard third.** The whole fleet is in the wash, with the top softened off.

**Keys owned.**
- `bpm` — nothing hurries: the pulse is a slow walk.
- `robot.rhythmicDensity` — each probe speaks seldom.
- `robot.rests` — and often stops short of the end of a phrase, leaving the room to answer.
- `robot.attack` — notes arrive rather than strike.
- `robot.release` — and fade rather than stop.
- `reverbSend` — every probe sits in the room's wash: none is dry.
- `delaySend` — with a faint echo behind most of them.
- `filterLPF.frequency` — the master filter softens the top off the whole fleet.

**Leaves alone.** The rooms' own size, the EQ, the colour and the pedals: Classic's, the room is ordinary and only the
probes are deep in it. The waveforms, filters and layers of a probe: Classic's. Dynamics and accents: Classic's.

**Overlaps.** Melody takes `robot.rhythmicDensity` (Hypnotic, Mechanical and Wandering each set it); Envelope takes
`robot.attack` and `robot.release` (Plucked makes the notes strike); Distance takes `reverbSend` and `delaySend` (Near
dries the fleet out). With all three picked, what survives is the slow pulse, the long gaps (`robot.rests` is no
family's today) and the softened top.

**Distinct from.** Bold. Calm is slow, soft, wet and sparse where Bold is quick, hard, dry and dense. Inside a minute the
pulse alone tells them apart. Honest note: the pair reads as two rungs of one ladder (soft to hard), and Perilous as a
third; this sheet gives Calm a place but does not change that.

**Promise.** Slow, soft and washed: nothing hurries and nothing is dry.

### Bold  ·  theme  ·  status: candidate

**Character.** The foreground. Every probe is close to the receiver, plain-spoken and dry, in a room kept small and
bright by an open master filter. The pulse is brisk, the probes talk often and over each other, and a note strikes and
stops. There is little wash and little echo: what a probe plays is heard as it plays it.

**Heard first.** The probes are right at the receiver, dry and close.
**Heard second.** They talk often and over each other.
**Heard third.** Each note strikes; nothing is softened.

**Keys owned.**
- `bpm` — the pulse is brisk.
- `robot.rhythmicDensity` — the probes talk often.
- `robot.rests` — and over each other, with little left out.
- `robot.attack` — a note strikes.
- `robot.release` — and stops.
- `reverbSend` — every probe is close: little wash.
- `delaySend` — and little echo.
- `filterLPF.frequency` — the room is bright: the master filter stays open.

**Leaves alone.** `robot.shapedAttack`: the placeholder raised the share of probes that curve their attack and kept the
curve short, for no reason this sheet can give; the plain attack band already makes the strike, and a visitor does not
hear a curve on a strike that short. The rooms' size, EQ, colour, pedals, voices, layers, dynamics and accents: Classic's.

**Overlaps.** Melody takes `robot.rhythmicDensity` (Wandering thins the talk); Envelope takes `robot.attack` and
`robot.release` (Swelling softens the strike); Distance takes `reverbSend` and `delaySend` (Remote pushes the fleet
away). With all three picked, what survives is the brisk pulse, the few rests and the bright filter.

**Distinct from.** Perilous. Both are brisk, dense, dry and bright; Perilous is faster, denser, drier and brighter still,
with hardly a rest. Inside a minute they are told apart only by degree, which is the rung problem this sheet cannot
solve: Bold's one claim of its own is the foreground, close and plain.

**Promise.** Close and plain: the probes are at the receiver, talking often, each note a strike.

### Adventurous  ·  theme  ·  status: candidate

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

### Perilous  ·  theme  ·  status: candidate

**Character.** A shoal in alarm. The world is fast, crowded and bright, and it never stops: the pulse runs, every probe
talks nearly all the time with hardly a rest, each note is a hard short strike that is gone at once, and the fleet is
dry and close in a room that gives nothing back. Nothing is soft and nothing is far.

**Heard first.** It is fast and it never stops.
**Heard second.** Every note is a hard short strike, bright-edged.
**Heard third.** It is dry: the room gives nothing back.

**Keys owned.**
- `bpm` — the pulse runs.
- `robot.rhythmicDensity` — every probe talks nearly all the time.
- `robot.rests` — with hardly a rest.
- `robot.attack` — each note is a hard strike.
- `robot.release` — gone at once.
- `reverbSend` — the fleet is dry and close.
- `delaySend` — the room gives nothing back.
- `filterLPF.frequency` — bright-edged: the master filter wide open.

**Leaves alone.** `robot.shapedAttack` and `robot.shapedRelease`: the placeholder raised both shaped shares and kept the
curves short, for no reason this sheet can give; the plain bands already make the strike and the stop. The rooms' size,
EQ, colour, pedals, voices, layers, dynamics and accents: Classic's.

**Overlaps.** Melody takes `robot.rhythmicDensity` (Wandering undoes the crowd); Envelope takes `robot.attack` and
`robot.release` (Held lets the notes ring); Distance takes `reverbSend` and `delaySend` (Remote drowns the fleet). With
all three picked, what survives is the running pulse, the missing rests and the open filter: it is still fast and it
still never stops.

**Distinct from.** Bold. Perilous is Bold pushed further on every key the two share, which is the rung problem; its
claim of its own is the never-stopping, the alarm. Inside a minute the tempo and the absent rests tell them apart on
most seeds, but not by kind.

**Promise.** Fast, crowded and bright, and it never stops.

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

## Cut

(Empty. Cut sheets move here at the cut, each with Crawford's reason.)
