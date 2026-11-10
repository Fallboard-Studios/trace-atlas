# Intent: The Desktop Crackles at Full — shrink the graph's standing cost, keep the audio

Confirmed via `interview-me` on 2026-11-06 (5 questions; one pre-interview remark withdrawn: "we're likely cutting
stuff" was said before the plan was clear and is not the direction), ahead of a `spec-driven-development` pass. Backlog
[67](../todo/archive/backlog-archive.md#67-audio-the-desktop-crackles-at-full--the-graphs-standing-cost-leaves-no-headroom), first
item of plan.md's Stage 1. The clean Full/Standard/Light A/B of 2026-11-05 (recorded on the backlog entry) is its step
zero: the cause is the standing floor, not the robot count.

## Outcome

The world `?seed=ez84fjmr&x=93&y=-146&theme=wreck` plays clean at Full on Crawford's 4K desktop with Chrome open, by
shrinking what the audio graph costs while it stands (about 0.5 of the audio thread's budget at Full before any robot
sounds), not by removing audio features. Full and Standard both get the lower floor; Light keeps its cuts.

## Behavior

- **The bar is Crawford's ear on his own machine, then a number.** Fixed means he hears it clean at full 4K. Only after
  that does the harness pin a figure (mean capacity at Full on this world, `npm run perf:audio`) as the regression line
  the graph must not creep back over. The number guards the result; it does not define it.
- **The method is backlog 27's, at every tier.** Decompose the ~1,800-node census (about 950 GainNodes and 340
  ConstantSourceNodes carry ~72 % of the handler time) into where the nodes come from: the per-robot chains, the send
  table, the pedals' bypass cells, the bank's links, Tone's Param and Signal plumbing. Ablate through `perf:audio`,
  rank through `perf:audio-handlers`, and cut what costs and is not heard. Backlog 27 did this for Light only; 67 does
  it for the graph itself, so Full and Standard carry less without turning anything off.
- **Inaudible plumbing goes first.** Candidates named at the interview, none measured yet: a pedal that is bypassed
  does not sit in the graph until it is lit; a static parameter holds a plain AudioParam value instead of a Tone Signal
  (a ConstantSource each); nodes the send table repeats per robot are shared where the routing allows. Each is a
  hypothesis for the spec to test, not a decision.
- **An audible trade is heard and decided one at a time.** If a cheap win changes the sound (a Reverb at a lower cost
  setting, a filter LFO at control rate), Crawford hears it on its own and says yes or no to that one. No blanket
  "Full gets lighter", no tier re-tuned by a number.
- **The audio is the core feature.** Crawford would rather keep as much of the audio as possible; a feature is removed
  only as a last resort and only by his say-so, and this intent names no such removal.

## Style / constraint

- **Pre-v1, the standing rule.** No "keep existing sound" clause goes into the spec. The sound is not protected for its
  own sake; it is protected because the audio is what the app is, and each change to it is a decision, not a drift.
- **Measurement hygiene as before.** Foreground, one harness call at a time, nothing but VS Code open, same-session
  interleaved A/B, code named by commit; see docs/PERFORMANCE.md and the A/B on the backlog entry.
- **Architecture holds.** AudioEngine owns the graph; whatever is lazily built or shared is built and shared there.
  No timers for musical timing, no state outside Zustand's serialisable set.

## Out of scope

- **Drawing less at 4K** (the backlog entry's direction 3). The headless audio thread reads ~0.6 at Full; the headed
  browser drawing at 4K takes the rest. The graph is shrunk first and Crawford's ear re-checked at full 4K; if drawing
  is then the remaining culprit it gets its own backlog entry. A note for that entry: 4K monitors are a few percent of
  desktops, but a Retina-class laptop at device pixel ratio 2 pushes about as many pixels on an integrated GPU, so the
  population paying the 4K raster cost is the high-DPI laptop, not the 4K tower.
- **Any automatic tier choice** (the backlog entry's direction 2, and the two shapes assessed at the interview: a
  static node-census estimate at boot, and a one-way reactive step-down on sustained underruns). Recorded as backlog
  [68](../todo/backlog.md#68-audio-automatic-tier-choice-for-weaker-desktops-revisit-with-the-lean-graph) to revisit
  with the lean graph in hand; its case gets weaker the leaner the graph is. The Audio Load dial as it stands remains
  the answer for weaker machines meanwhile.
- **Removing features from the product.** Not this work.
- **Standard's tuning.** Standard saved 0.05 on this world because its robot cap never binds and it keeps the effects;
  it gets the lower floor like Full and is not re-tuned here.

## Known implementation note (not yet spec'd)

- The census method: how the ~950 Gains and ~340 ConstantSources are attributed to their makers (a node-creation
  census by call site in a debug build, or ablations by subsystem through `perf:audio`), and which comes first.
- Lazy pedal construction crosses the bypass cells' routing (`wireGlobalFxChain` disconnects every node on a toggle
  flip, and the `?debug` output taps re-attach after it); the spec says what a pedal's "lit" state builds and tears
  down, and where the swell writes land while a pedal is unbuilt.
- Which Tone Signals are truly static (never automated, never swelled, never linked to an LFO) and so can become plain
  values; the LFO bank's links and the swell targets (backlog 37, 38, 40, 41) are the list to check against.
- The regression pin: where the Full-tier mean on this world is recorded (docs/PERFORMANCE.md's running table) and
  what a future change must re-measure.
