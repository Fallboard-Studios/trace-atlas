# Intent: Robot Layer Markers (two always-present sockets, lit by layer gain)

Confirmed via a short `interview-me` on 2026-10-03 (four direct answers plus one question), ahead
of a `spec-driven-development` pass. Branch 3 of three in
[docs/ideas/robot-visual-rework.md](../ideas/robot-visual-rework.md) (live visuals → greebles →
layer markers). This is the **static** half of
[docs/ideas/layer-pods-and-follow-through.md](../ideas/layer-pods-and-follow-through.md); the
motion half (orbits, trailing, lean) stays a later branch on top of these markers. Depends on
branch 1 ([robot-live-visuals.md](robot-live-visuals.md)) for the lamp's glass/sheen and opacity
pattern, and on branch 2's sketch ([robot-greebles.md](robot-greebles.md)) for the two reserved
fixture positions per shape.

## Outcome

Every robot carries two small lamp-like sockets, one for its Coaxial layer and one for its
Harmonic layer, in the robot's identity colour. A socket is lit in proportion to its layer's gain
and goes dark when the layer is muted. Nothing appears or disappears on an edit: the hardware is
constant, only its light changes — the same language the battery dim already speaks on the window
and lamp. At a glance across twelve robots you can see which ones are running one, two or no
extra oscillator layers, and the card colour link gets two more carriers.

## Behavior

- **Two sockets, always present.** Each of the four shapes gets two fixed socket positions
  (Coaxial, Harmonic — `layers[1]`, `layers[2]`), chosen by eye during branch 2's sketch so the
  greeble slot tables reserve them as fixtures. They render at every detail level, on every
  shape, on every robot. The Baseline layer has no socket: it is the body.
- **A socket looks like the lamp.** Same glass + sheen fills from branch 1's `identityGlass`,
  a touch smaller than the lamp, with a dark housing ring (`colors.shadow`) so an unlit socket
  still reads as a fixture rather than a hole. Crawford: "a marker currently is the lamp hue and
  the glass."
- **Gain lights it; muted goes dark.** Socket brightness follows the layer's live gain
  (seeded 0.2..1.2, editable; 0 = muted) — lit opacity scales with gain over its range, and a
  muted layer's glass drops to a low "dark socket" floor that leaves the housing visible.
  Crawford, on a muted layer: "it goes dark." Battery dim multiplies through, as on the lamp.
- **Gain only, for now.** Detune and phase drive nothing static; they belong to the motion
  follow-up (orbit angle, wobble). Crawford: "gain for now."
- **Identity colour, by decision.** The sockets carry `identityColor`, not the layer's waveform
  hue. This widens branch 1's carve-out from "window glass and lamp" to "window glass, lamp and
  the two layer sockets" — amended in the same four places, same commit discipline.
- **Shown on the card.** Two lit or dark dots read at 64 px and say something true about the
  sound, so the card avatar renders them (unlike greebles). Crawford: "shown."
- **Live.** Layer gains sit in `audioAttributes.layers`, already a dependency of `RobotBody`'s
  audio memo, so a Robot Options or company-broadcast gain edit relights a socket immediately.
  Battery is read outside the memo, exactly as the lamp does it.

## Style / constraint

- **Existing flat style**; one or two elements per socket (housing ring + glass, optional sheen).
- **Guardrail amendment, narrow, one commit** — `CLAUDE.md`, `.github/copilot-instructions.md`,
  `docs/ROBOT_DESIGN.md` "Non-audio layers", the `identityColor` comment in `src/types/Robot.ts`.
  The *lit state* is audio-driven (gain); only the *hue* is identity. Everything else on the body
  stays as branches 1 and 2 leave it.
- **No new persisted data.** Sockets are derived entirely from `layers[1..2].gain`,
  `identityColor` and battery at render time; nothing is stored.
- **No motion, no GSAP, no timers.** The motion follow-up builds on these fixtures later.
- **Positions are branch 2's sketch output.** Each shape's two socket boxes are entered into
  `FIXTURE_BOXES` there, so greebles can never land on them.

## Out of scope

- **Sockets that appear or disappear with gain** — rejected ("it goes dark"), consistent with the
  greeble ruling against parts popping in and out.
- **Detune or phase mappings** — later, with motion.
- **Waveform-hue sockets** — rejected; identity colour.
- **A socket for the Baseline layer** — the body is the baseline.
- **Pods as separate orbiting bodies, trailing, lean, idle drift** — the motion branch.
- **Any change to how the lamp itself computes brightness** (branch 1's averaged-gain blend
  stays; the sockets are per-layer, the lamp is the whole voice).

## Known implementation note (not yet spec'd)

- Brightness curve: `socketOpacity = (gain === 0 ? SOCKET_DARK : SOCKET_MIN + (1 − SOCKET_MIN) ×
  clamp01(gain / 1.2)) × dimOpacity`, constants tuned by eye (e.g. `SOCKET_DARK` 0.15,
  `SOCKET_MIN` 0.4 to match `LAMP_MIN`). Pass two opacities to the shapes, or one small
  `<RobotLayerSockets>` node like the greebles — decide in the spec.
- Positions per shape come from the branch 2 sketch header; the spec transcribes them.
- Tests: socket count is always two regardless of layer gains; muted → `SOCKET_DARK × dim`;
  gain 1.2 → `1 × dim`; changing only `identityColor` recolours sockets and nothing else; card
  avatar contains two sockets.
- Docs: `docs/ROBOT_DESIGN.md` "Non-audio layers" gains the sockets; roadmap Phase 38.
