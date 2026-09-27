# Intent: Consolidated LFO Display

Confirmed via `/interview-me`. Applies across every LFO-tied slider in the console: the global effect chain (`audioRigConfig.ts` → `AudioRigDrawer` — EQ3, Low-Pass Filter, High-Pass Filter) and the robot oscillator/volume controls (`robotOptionsConfig.ts` → `SignatureArrayDrawer`, `AudioSettingSection` — shared by both the single-robot screen and the company bulk-edit panel).

## Outcome

Replace the current one-nested-"Modulation"-accordion-per-slider pattern with a single shared LFO display per group:

- Sliders in a group render bare — no more per-slider nested LFO accordion.
- Exactly one shared LFO display sits immediately below the group's sliders, showing whichever slider's LFO is currently **targeted**.
- Targeting is driven by clicking on/around a slider's row, clicking the slider itself, or keyboard-focusing it — all three select that slider's LFO into the shared display. Mouse and keyboard are equivalent; there is no separate keyboard-only affordance.
- The shared LFO display shows the targeted param's own name as a label (e.g. "Mid", "Coaxial Gain") so it's always clear what it's editing.
- The targeted slider's own row gets a plain selection CSS class, independent of the `Lfo` component's existing `isActive` class (which reflects the LFO's on/off toggle, not selection) — a pure "this is the one currently shown below" hook for future styling.
- Swapping the target (e.g. Low → Mid) goes through an explicit transition state: the shared display shows neither the previous nor the next target's values while in it, classed separately (e.g. a transitioning hook) so a real animation has something to animate into and out of later. Today this state is effectively instantaneous/imperceptible — no GSAP timeline yet, just the class/state scaffold.
- Where a **drift** control already exists for a group (EQ3, Low-Pass Filter, High-Pass Filter each have one shared Rate Drift/Depth Drift pair — see [lfo-drift-groups.md](lfo-drift-groups.md)), it moves from its current standalone block (rendered after all 7 effect blocks in `AudioRigDrawer`) to sit directly beneath that group's shared LFO display, inside that same parent accordion.
- **Grouping granularity:** one shared LFO display per functionally-independent unit, not one per parent accordion. EQ3/LPF/HPF each count as one unit (matching their existing one-accordion-per-effect structure). Within the Signature Array's single parent accordion, each oscillator layer — Baseline, Coaxial, Harmonic — is its own unit with its own shared LFO display (3 displays total in that one accordion), since the layers are functionally separate oscillators, not one pool of 12 interchangeable targets.
- A group with a non-LFO param alongside LFO ones (e.g. a layer's Type radio, which has no LFO) keeps that param inline among the group's other sliders — never relocated elsewhere.
- **This also applies to single-target spots, not just multi-slider groups.** Volume (`AudioSettingSection`) has exactly one LFO-tied slider today — it still loses its own nested "Modulation" accordion wrapper and gets the same bare-slider-plus-shared-LFO-display shape, with that one slider always targeted (nothing else to click between yet). This is for visual consistency and so future additions to that section (more sliders) slot into the same pattern automatically.
- No new accordions nested inside existing accordions anywhere — the shared LFO display and its drift control are plain content inside the one parent accordion that already exists.

## User

You (Crawford), building and styling this console UI going forward.

## Why now

The current per-slider nested accordion pattern doesn't scale: EQ3 alone already shows 3 near-identical "Modulation" accordions, and it'll only get more repetitive as more LFO-bearing sliders are added (e.g. Volume's section is expected to grow).

## Success

- EQ3, Low-Pass Filter, High-Pass Filter (global, `AudioRigDrawer`), all 3 oscillator layers on both the single-robot screen and the company bulk-edit panel (`SignatureArrayDrawer`), and Volume (`AudioSettingSection`) all present as: bare sliders → one shared LFO display (labeled with the current target, targeted-row class present, transition-state class present) → drift control directly below where one exists for that group — all still inside their one existing parent accordion, no new accordion nesting introduced.
- Clicking/click-around/keyboard-focusing any slider in a group updates the shared display to that slider's LFO settings, defaulting to the group's first param on initial render/open.
- The targeted-row class and the transition-state class exist and are wired correctly (verifiable in markup/dev tools) even though neither has real animation or bespoke styling yet.

## Constraint

- Purely presentational restructuring of existing shared components (`AudioRigDrawer`, `SignatureArrayDrawer`, `AudioSettingSection`, and the config files feeding them) — the same components already shared between single-robot and company bulk-edit screens, so building this once in the shared component covers both automatically.
- Any new selection state (which param is currently targeted) is plain, ephemeral, serializable component state — not Zustand, following the same "open/closed is local `useState`" precedent `AccordionContainer` already sets (docs/COMPONENT_LIBRARY.md).
- No GSAP timeline work in this pass — only the class/state scaffolding a future animation will hook into.
- Respects existing guardrails: no interactive UI outside `ScreenViewport`, no accordions nested inside accordions, no new Tone synths or scheduling touched at all (this is control-surface layout only, not audio engine behavior).

## Out of scope

- Actually animating the target-swap transition — deferred to a future pass.
- Changing the standalone global "Robot Drift" knob's placement or behavior — it stays exactly where it is today in `AudioRigDrawer`, since (unlike EQ3/LPF/HPF) it isn't scoped to one effect's accordion; it covers every robot LFO target collectively.
- Delay, Reverb, Compressor, Limiter — none have LFO-tied params, untouched by this feature.
- Any change to `WorldView`, robot visuals, or console theming (Phase 11).
