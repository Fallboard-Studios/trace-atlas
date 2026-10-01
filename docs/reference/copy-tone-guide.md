# Copy tone guide — Lore vs. Human

Trace Atlas's UI copy runs in two deliberately separate voices, keyed to `loreLabel`/`loreDescription` (Lore) and `humanLabel`/`humanDescription` (Human) throughout `ControlSchema`/`DualLabel` and `IntroPanel`. Anyone writing new copy — a new panel, a new control, a new intro block — should match one of these two voices exactly, never blend them.

Where the words live: every string is an entry in `src/content/` (`human`/`lore`/`intro` fields, one entry per concept) — see [docs/CONTENT_LAYER.md](../CONTENT_LAYER.md). This guide is about the voice; that one is about the plumbing.

## Lore tone

In-universe, addressed to characters in the Trace Atlas world (Meridia Telemetry/Comms/Power Group), never to the real person holding a web browser.

- Confident without being flashy; positive without being cutesy — a b2b enterprise-manual voice.
- Short: a headline plus a short blurb. It gives no usage instructions and never explains real-world mechanics (synth terms, UI behavior).
- Never describes what a control actually does — that's Human's job.

**Examples (homepage):**
> TRACE ATLAS
> A Meridia Telemetry Group product
> Locating the resources you need now.
> Trace Atlas is a tablet that allows users to monitor and control Meridia Telemetry Probes as they search for extractable resources. Using Meridia Power Group Perpetualish Battery Packs, they can search indefinitely for the resources you need.

**Examples (Fleet Params):**
> Fleet Params - your key to mesh location success!
> Fleets of probes connect to our networks with Meridia Comms Group Undersea Mesh Networks. Probes can globally send the data you need in the package you want.

## Human tone

Real-world documentation, not canon, addressed directly to a user who may not know synthesizers or music composition. Its job is to make the app's non-obvious interactive parts actually understandable — clear and concise, not cute.

**Examples (homepage):**
> As the probes move and work, they play single melodies from curated lists of notes. As they work, the probe's battery drains, and eventually the probe will shut down and recharge. During this time it stops playing its melody, and sometimes makes changes to it. Once the battery recharges, the probe turns back on and returns to work, playing its song as it does.

**Examples (Fleet Params):**
> The Fleet Params screen contains controls that effect the general sound of all robots.
>
> **Transport & Composition**
> Tempo: how fast the music plays.
> Automatic Effects: Different effects will come and go as the music plays, this slider controls how intense the effects can get. Set it to zero to turn the automatic effects off.
>
> **EQ & Filters & LFOs (& LFO Drift)**
> EQ: Three sliders to boost or reduce different bands (low, mid, and high) of frequencies.
> Low Pass Filter: acts like a thick wall or blanket for sound, cutting out harsh high pitches while letting deep, low frequencies pass through smoothly.
> High Pass Filter: acts like a tinny little smartphone speaker, shaving off the deep, thumping bass while letting bright, high frequencies pass through crisp and clear.
> LFO (Low Frequency Oscillator): an invisible, automatic hand turning a knob back and forth, where rate controls how fast it turns and depth controls how far it turns it.
> LFO Drift: A stacked LFO uses a secondary control wave to gently nudge the main LFO around, where setting rate drift or depth drift to a positive percentage causes the main speed or dial distance to wander higher, while a negative percentage pulls that baseline lower. A hand turning the hand that's turning the knob.

## Where this is actually implemented

The IntroPanel copy pass across every screen (homepage/Fleet Params/Settings/Probes/Companies/robot sections) shipped following this guide — see `FleetParamsContent.tsx`, `SettingsContent.tsx`, `ProbesContent.tsx`, `CompaniesContent.tsx`, and `RobotSectionAccordionStack.tsx`'s own `IntroContent` tables for the actual shipped strings. `docs/reference/text-content-tables.md` is the companion naming-decision reference (which label/heading got renamed to what); this file is the tone/voice reference for writing *new* copy in either style. See also `docs/COMPONENT_LIBRARY.md`'s note that casing is a per-string content decision, not a CSS rule — it applies equally to Lore and Human copy.

**Note:** any labels/concepts referenced above may drift from the current app as the app evolves — check the actual source files for current strings, not this doc, before assuming a specific label still exists.
