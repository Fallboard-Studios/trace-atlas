# Intent: Themes and Aspects Refinement — character sheets first, then the set

Confirmed via `interview-me` on 2026-11-02 (8 questions; one pre-interview guess corrected: a theme is not only the
world, it is also every robot's guardrails when no aspect is picked; and one term narrowed: "covered" means a theme's
column sets every band its character needs, not coverage of some space of moods), ahead of a `spec-driven-development`
pass. Roadmap [58](../todo/roadmap.md#58-themes-and-aspects-refinement), first item of plan.md's Stage 1. Backlog 47
(even draws, merged 2026-11-02 as PR #596) was its step zero: every audio draw is even, so a band is heard as written.

**Status: spec'd and planned** on `docs/intent-themes-aspects-58`, 2026-11-02 (spec
[THEME_AND_ASPECTS_REFINEMENT.md](../specs/THEME_AND_ASPECTS_REFINEMENT.md), plan
[THEME_AND_ASPECTS_REFINEMENT.md](../tasks/THEME_AND_ASPECTS_REFINEMENT.md)). Next: the sheets (plan T1).

## Outcome

A set of themes and aspect families on the off screen's Loading axis, each one a distinct character that a first-time
visitor can hear in a minute, chosen by Crawford on paper from character sheets Claude writes, and only then given
numbers by the measured sketch and settled by listens. The five themes (`src/data/bands/themes.ts`) and the four
families of three options (`src/data/bands/aspects.ts`) that roadmap 57 shipped as placeholders are the starting
material, not a protected set: names, identities, Classic's standing as the neutral table, and the Distance family are
all open, and a fifth family may be proposed.

## Behavior

- **A theme is a place, not a rung.** Calm, Bold and Perilous read today as steps on one intensity ladder and
  Adventurous as "wider in everything", which is a statistical property and not a character. The set Crawford wants
  is distinct places that sound unlike each other, so a new theme is a new character and never a new rung, and the
  ladder is a thing to refine away.
- **A theme is the world and the default probe.** The world side is what no single robot decides: tempo, the rooms'
  size, the master filter and EQ, the crowdedness, the colour and the pedals. The robot side is the guardrail set that
  holds on every robot band when no aspect is picked; without it a theme's robots would fall through to Classic's
  bands or to no band, and neither suits most themes. An aspect replaces one family's guardrails when picked, and only
  then.
- **The listener is a first-time visitor** on a tablet who reads the one line under the row, picks, and listens with
  no guide. Two themes must therefore sound unmistakably different inside a minute, and a character sheet is written
  as what that visitor notices first, second and third. That is what the one-line description has to promise and what
  the listen has to deliver.
- **An aspect family is an axis of robot variation a visitor can hear**: what a probe plays, how its note is shaped,
  what it sounds like, where it sits, how it moves. Distance is the weak family on that test: two sends that move only
  how deep a probe sits in rooms the theme sizes. The two uncovered axes are **Motion** (a probe's LFO links,
  portamento, pitch drift, the pedals it is sent to) and **Performance** (dynamics, accents, humanize). Both are
  proposed as candidates, either as a fifth family or as Distance's replacement.
- **The two tests on the finished set are coverage and importance.** Covered: every band a theme's character needs is
  set in its column, so nothing falls through to Classic by accident. Important: a column moves no key its sheet does
  not need. Every key a column moves is justified by a sentence on its sheet.
- **The choice is made on paper.** Claude writes a character sheet for each of the current nine themes and aspects
  and for the candidates (on the order of eight to ten theme candidates, two or three extra options per family, and
  the Motion and Performance families), each sheet saying what the character is, what a visitor hears first, second
  and third, and which keys it must own, with no numbers. Crawford cuts and renames on paper. Only the survivors get
  columns in the measured sketch and a place in the listens. Building every candidate first would spend listens on
  things a sentence could have cut.
- **The listens run one axis at a time** from a fixed sheet, as roadmap 58's method says: three worlds across the
  themes, then each family against none, then the risky pairs. Copy comes last.

## Style / constraint

- **A theme may move any key in the band table.** Roadmap 57's ten-key list (`ThemeBandKey`) was a narrow first cut,
  not an artistic position; this phase widens it to the whole table, with the type still refusing a key that does not
  exist. The sheet's "important" test is what stops the widening turning every column into a rewrite of Classic.
- **An aspect stays inside its family and wins on overlap.** `resolveBands` replaces whole bands, the aspect last,
  and that stays. Theme copy must not promise what an aspect can override.
- **Sheets carry no numbers.** Numbers with no sentence to check them against are how the placeholders happened.
- **UI capacity does not steer the set.** The theme row is one pick and each family row is a multi-select; the desk
  column already scrolls at four family rows. If the set needs the row to wrap or the column to scroll a little more,
  that is the layout's problem and a reason to cut a good character. Crawford has no minimum or maximum and expects
  no axis to pass eight.
- **The set is open.** Crawford does not dislike the current batch and is not sold on any of it. Nothing is protected
  for an old sound's sake (pre-v1, the standing rule).

## Out of scope

- **Mood** is backlog [7](../todo/backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter)'s: only
  the harmony note options, post-launch. Whether a theme presets a Mood is undecided and later.
- **The world and visual draws** go even on their own branch, backlog
  [46](../todo/backlog.md#46-world-seeded-draws-are-welded-and-centre-heavy-names-colours-gems-companies-placement),
  plan.md's Stage 4.
- **The off screen's layout.** No row, column or scroll change is designed here; the set is decided first and the
  layout follows it, in a task of its own if one is needed.
- **The copy.** The theme and option sentences, labels and names in `src/content/copy/home.ts` are the method's last
  step, written once the listens have settled what each character is.
- **A new band kind or a key outside the table.** Widening the theme key list to the whole table is this phase's
  decision; inventing a key or a band shape the table does not have is still ask-first.

## Known implementation note (not yet spec'd)

- The character sheets themselves: where they live (a sketch page in `docs/sketches/`, a reference doc, or the spec's
  own section), and their fixed shape (character, first/second/third thing heard, the keys owned, the overlaps an
  aspect can take). The spec decides; the sheets are written before any column moves.
- The measured sketch's shape (roadmap 58's method step 2): the live-harness recipe from
  [docs/tasks/EVEN_SEEDED_DRAWS.md](../tasks/EVEN_SEEDED_DRAWS.md) T18 against the written bands, and the theme ×
  aspect override grid, so every overlap is seen before it is heard.
- Widening `ThemeBandKey` to `BandKey`, and what `resolveBands.test.ts`'s key-list pin becomes.
- If a family is added or Distance is replaced: `ASPECT_FAMILY_IDS`, the deal (`aspectDeal.ts`), the pick lists on
  the payload and the link (`canonicalAspects`), the off screen's rows, and the "loaded under" lines all follow the
  family list; the spec names what moves and what a saved payload or an old link with a `distance` list does.
