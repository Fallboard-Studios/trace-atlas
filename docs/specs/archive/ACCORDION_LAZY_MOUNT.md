# Phase Spec: Accordion Lazy Mount

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`
> - Profiling harness (roadmap 17.2.1): `npm run build && npx vite preview --port 4173`, then `npm run perf -- --throttle 1` and `npm run perf -- --throttle 4` in a second terminal — see [docs/PERFORMANCE.md](../PERFORMANCE.md)

Source of intent: [Roadmap 17.2.2](../todo/roadmap.md#1722-performance-lazy-mount-collapsed-accordion-content), requested by Crawford 2026-09-18 after profiling showed view switches stalling the main thread long enough to pause audio. No separate intent doc — the profiling data in [docs/PERFORMANCE.md](../PERFORMANCE.md) and §1.1 below is the motivation. **Status: implemented 2026-09-18** on `bug/view-change-slowdown` (Crawford approved the spec and every §7 decision the same day; one visual sign-off on a real device is still outstanding). §4.1's sketch is the *starting* design — §8 records what actually shipped and why it differs. Task breakdown: [docs/tasks/ACCORDION_LAZY_MOUNT.md](../tasks/ACCORDION_LAZY_MOUNT.md); measured results: [docs/PERFORMANCE.md](../PERFORMANCE.md).

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and why it's a problem

`AccordionContainer` (`src/components/ui/controls/AccordionContainer.tsx`) renders its content through Radix's `Accordion.Content` with `forceMount` (line ~195). Radix's collapsible content is `hidden={!isOpen}` / `children: isOpen && children` where `isOpen = context.open || isPresent`, and `forceMount` makes `isPresent` permanently true — so **every section's children are built the moment the section itself mounts, whether or not it's ever opened**. `forceMount` exists on purpose: the open/close animation is a hand-written GSAP height tween on the content wrapper (`animateTo()`), which needs the content in the DOM at all times so it can measure `scrollHeight` and tween a real element.

Every accordion in the app starts collapsed — no call site passes `defaultOpen` — so opening a Console tile builds every collapsed section's controls too. Measured with the 17.2.1 harness (production build, desktop 1280×900, 2026-09-18; the "in closed accordions" column counts `.sc-cabinet-box` elements inside a `.sc-accordion__content[data-state="closed"]`):

| Screen | `.sc-cabinet-box` on page | of which inside a closed accordion | Longest task opening it, 1× throttle |
|---|---|---|---|
| Fleet Params (Audio Rig tile) | 321 | **301** (94%) | 262 ms (192–339 across runs) |
| Probes list (Company options section) | 494 | **357** (72%) | 410 ms (373–537) |
| Robot detail | 403 | **358** (89%) | 275 ms |
| Nav & Comms | 26 | 0 | 81 ms |

Each of those boxes runs several `gsap.set()` calls on mount, and GSAP reads computed style before each first set — hundreds of forced layouts in one commit (the subject of roadmap 17.2.3). Every 300+ box screen exceeds Tone's 100 ms scheduling lookahead **even unthrottled**, which is the audible audio pause. Most of that work builds controls nobody has looked at.

### 1.2 What's changing

Content is mounted the **first time the section is opened** (or immediately when `defaultOpen`), and then **stays mounted** — closing a section hides it exactly as today, it does not unmount. A never-opened section costs one wrapper `div` and its trigger, not its whole control subtree.

Expected result, from the table above (the closed-accordion boxes simply aren't built): Fleet Params ≈ 20 boxes, Probes list ≈ 137, robot detail ≈ 45 — a 6–9× reduction on the two accordion-heavy screens, and a 3.6× reduction on the Probes list. Total work if a user opens every section is unchanged (slightly more, from one extra render per first open); it moves from "every tile open" to "the first open of each section," spread across separate, user-initiated interactions.

This does **not** fix per-box cost (17.2.3), and does nothing for the boxes outside accordions (Probes list's 137, Fleet Params' 20, the header's 12) or for idle paint cost (17.2.5).

### 1.3 The one real design problem: measuring a section that isn't there yet

`animateTo(true)` reads `el.scrollHeight` to know how tall to tween to. Today it's called synchronously from `handleValueChange`, and the content is always already in the DOM. With lazy mounting, calling it synchronously on a first open reads an **empty** wrapper (`scrollHeight` 0), tweens to height 0, and then `onComplete` sets `height: auto` — the section would snap open at the end of the animation instead of growing into it.

Resolution: on a first open, `handleValueChange` mounts the content (state) and **defers** the animation to a `useLayoutEffect` that runs after that commit — DOM updated, browser not yet painted — so `scrollHeight` is real and the tween starts in the same frame the user clicked. Every later open/close (content already mounted) takes today's synchronous path unchanged. See §4.

### 1.4 Why "keep mounted after first open," not "unmount on collapse"

Unmounting again on collapse would free more memory, but: (a) `useLfoTargetGroup` keeps its selected-target choice in component-local `useState` (its own doc comment: "never Zustand"), so unmounting would reset which LFO target an open Audio Rig section was showing every time it's collapsed and reopened; (b) the close animation fades the content out *before* collapsing (`animateTo(false)`), so content must still be present through the whole close sequence — unmounting would have to wait for the timeline's completion callback, more machinery for the same reason; (c) re-opening would replay the full mount cost each time, trading a one-time hitch for a recurring one. Kept mounted, a section that has ever been opened behaves exactly as every section does today.

### 1.5 Audited: nothing depends on closed content being mounted

Checked 2026-09-18 across all 6 call sites (`AudioRigDrawer` ×2 sites, `AudioSettingSection`, `PingContourDrawer`, `PingControlsDrawer`, `SignatureArrayDrawer`):

- **No accordion child registers engine/store side effects on mount.** The only `useEffect`s in those drawers (`PingContourDrawer.tsx:57`, `SignatureArrayDrawer.tsx:248`) are ref-caching effects in the drawer component itself — *outside* the accordion's children — so they are unaffected. `useLfoTargetGroup`'s effects are a timeline-cleanup and a `fields` fallback, both local.
- **No call site passes `defaultOpen`.** Kept supported (initial `hasOpened = defaultOpen`), but no production path exercises it today.
- **Radix's ARIA wiring is unchanged**: the content wrapper (with its `id`) still always renders and only its children are conditional. Radix's trigger sets `aria-controls` only while the section is open (`context.open ? contentId : undefined`) — existing behavior, so a never-opened section has none, before and after this change. (Corrected during implementation: the first draft said it "stays valid" on a closed section.)
- **Accessibility side effect, noted not fixed:** because the wrapper is `forceMount`ed with `height: 0; overflow: hidden` rather than `hidden`, controls inside an *opened-then-collapsed* section still appear to be reachable by keyboard today. Lazy mounting improves this for never-opened sections (nothing to focus) but does not change it for reopened ones. Recorded for roadmap 18's accessibility pass; out of scope here.

### 1.6 What the change breaks: tests, mechanically

A throwaway prototype (children rendered only while `open`; reverted) was run against the full suite to size the blast radius: **129–130 of 2,716 tests failed across 5–6 files, all of them files that render an accordion-wrapped drawer.** Not every failure was individually inspected; the ones read (e.g. the Audio Rig render-count cascade tests seeing zero calls from a section that never mounted) are all of the form "queries into a section that was never opened," and the single `CompanyCrudControls` failure below is unverified and may be unrelated. The same prototype left `AccordionContainer.test.tsx`, `RobotOptionsTab.test.tsx`, and `CompanyOptionsSection.test.tsx` passing.

| File | Failing under the prototype |
|---|---|
| `AudioRigDrawer.test.tsx` | 61 of 74 |
| `SignatureArrayDrawer.test.tsx` | 23 of 28 |
| `PingControlsDrawer.test.tsx` | 18 of 23 |
| `AudioSettingSection.test.tsx` | 16 of 20 |
| `PingContourDrawer.test.tsx` | 11 of 14 |
| `CompanyCrudControls.test.tsx` | 1 of 45 (appeared in one of two runs — likely timing-dependent; investigate during implementation) |

The fix is mechanical and honest: those tests open the sections they assert against via one shared helper (§4.3) rather than the component gaining a test-only escape hatch.

---

## 2. Target File Structure

```text
src/
├── components/
│   ├── ui/controls/
│   │   ├── AccordionContainer.tsx        # MODIFIED — hasOpened state, deferred first-open animation (§4.1)
│   │   └── AccordionContainer.test.tsx   # MODIFIED — new describe('lazy mount'), see §5.2
│   ├── panels/screen/console/
│   │   └── AudioRigDrawer.test.tsx       # MODIFIED — open sections before asserting (§4.3)
│   ├── robot/
│   │   ├── AudioSettingSection.test.tsx  # MODIFIED — same
│   │   ├── PingContourDrawer.test.tsx    # MODIFIED — same
│   │   ├── PingControlsDrawer.test.tsx   # MODIFIED — same
│   │   └── SignatureArrayDrawer.test.tsx # MODIFIED — same
│   └── company/
│       └── CompanyCrudControls.test.tsx  # INVESTIGATE — 1 intermittent failure under the prototype (§1.6)
└── testUtils/
    ├── openAccordions.ts                 # NEW — shared helper (§4.3); alongside cssRuleBody.ts
    └── openAccordions.test.tsx            # NEW — the helper's own test, matching cssRuleBody's precedent
scripts/perf/
└── profile.mjs                           # MODIFIED — "boxes in closed accordions" metric + robot-detail steps
                                          # (both already in the working tree, see §6) + a first-open-of-a-section step (§5.3)
docs/
├── COMPONENT_LIBRARY.md                  # MODIFIED — AccordionContainer contract + Phase 11.1.7 "byte-for-byte unchanged" claim (§6)
├── PERFORMANCE.md                        # MODIFIED — dated post-change baseline section (§5.3)
└── todo/roadmap.md                       # MODIFIED — 17.2.2 marked done with a shipped-vs-drafted note
```

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files above. `CabinetBox.tsx`, `accordionAnimation.ts`, `AccordionContainer.css`, and every consumer *component* (not test) are **not** modified — the change is internal to `AccordionContainer` and needs no call-site edit.
* **Always:**
  * Keep `forceMount` on `Accordion.Content` and the content wrapper always rendered — the height tween and Radix's `aria-controls` both depend on it. Only the *children* become conditional.
  * Keep existing animation behavior **by default**: same two-step sequencing (height then fade on open, fade then height on close), same durations, same `prefers-reduced-motion` snap, same `timelineMap` registration and `killTimeline` cleanup. **Exception, approved by Crawford 2026-09-18:** he is open to adjusting animation timing, easing, or sequencing if the smoothness pass (task doc, Task 8) shows it makes first opens read smoother. Any such change stays inside `AccordionContainer.tsx`/`accordionAnimation.ts`, updates the tests and docs it touches, and never removes the `prefers-reduced-motion` snap.
  * Use `useLayoutEffect` (not `useEffect`, not a timer) for the deferred first-open animation — an effect that runs after paint would show one frame of an open-but-empty section.
  * Add or update tests alongside the code change, per repo TDD expectations.
* **Ask first:** anything that reopens a decision made in §7 — unmounting on collapse (decided: keep mounted), an `eagerMount`/`mountWhenClosed` prop (decided: shared test helper instead), or mounting closed sections during idle time (decided: out of scope, record and ship).
* **Never:**
  * Never use `setTimeout`/`requestAnimationFrame`/`queueMicrotask` to stage the mount or the animation (`CLAUDE.md` forbids timer-driven animation; the layout effect makes it unnecessary).
  * Never store the GSAP timeline, a ref, or the DOM node in state (unchanged repo rule; `hasOpened` is a plain boolean).
  * Never weaken or delete a failing test to get green — the six test files above are updated to *open the section*, not to stop asserting on its contents.
  * Never make the change conditional on a per-consumer flag to dodge test churn.

---

## 4. Code Style & Architecture Conventions

### 4.1 `AccordionContainer.tsx`

```tsx
function AccordionContainerInner({ schema, children, defaultOpen = false, style }: AccordionContainerProps) {
  const [open, setOpen] = useState(defaultOpen);
  // Whether this section has ever been opened. Never goes back to false: once its content is
  // mounted it stays mounted (collapsing only hides it) — see docs/specs/ACCORDION_LAZY_MOUNT.md §1.4.
  // A section mounted already-open (defaultOpen) mounts its content immediately, as it always did.
  const [hasOpened, setHasOpened] = useState(defaultOpen);
  // Set by handleValueChange on a FIRST open, consumed by the layout effect below. A ref, not
  // state: it's a one-shot handoff between an event handler and the next commit, never rendered.
  const pendingFirstOpenAnimation = useRef(false);

  // ...existing timelineKey / killTimeline cleanup / useGSAP({ dependencies: [] }) /
  // defaultOpen mount effect / animateTo, all unchanged...

  // First open only: the content wasn't in the DOM when the click happened, so animateTo() —
  // which reads el.scrollHeight — must wait until React has committed it. useLayoutEffect runs
  // after the DOM update and before paint, so the tween still starts in the frame the user
  // clicked, with no flash of an open-but-empty section. Deps are [hasOpened] only: animateTo is
  // a fresh closure each render and this must fire exactly once per first open.
  useLayoutEffect(() => {
    if (!pendingFirstOpenAnimation.current) return;
    pendingFirstOpenAnimation.current = false;
    animateTo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOpened]);

  function handleValueChange(value: string) {
    const nextOpen = value === schema.id;
    setOpen(nextOpen);
    if (nextOpen && !hasOpened) {
      // Content not mounted yet — mount it now, animate after the commit (layout effect above).
      pendingFirstOpenAnimation.current = true;
      setHasOpened(true);
      return;
    }
    animateTo(nextOpen); // content already mounted: today's synchronous path, unchanged
  }

  // ...
  <Accordion.Content ref={contentRef} className="sc-accordion__content" forceMount>
    <div className="sc-accordion__content-inner" ref={contentInnerRef}>
      {hasOpened ? children : null}
    </div>
  </Accordion.Content>
```

`setOpen` and `setHasOpened` in the same event handler batch into a single render, so the layout effect sees the committed content.

### 4.2 Naming and conventions

Plain named function component (unchanged), `hasOpened`/`pendingFirstOpenAnimation` in the same camelCase-boolean style as `open`/`defaultOpen`, comments that state *why* (this file's own convention — every non-obvious line already carries a dated rationale). No new file, prop, or export in the component itself.

### 4.3 The shared test helper

```ts
// src/testUtils/openAccordions.ts
import { act, fireEvent, within } from '@testing-library/react';

/** Expands every collapsed AccordionContainer under `root` (default: document.body) by clicking
 *  its trigger, so a test can assert against controls that lazy mounting
 *  (docs/specs/ACCORDION_LAZY_MOUNT.md) no longer renders while a section is closed. Returns
 *  nothing; assert on the now-mounted content afterward as before. */
export function openAllAccordions(root: HTMLElement = document.body): void {
  const triggers = within(root).queryAllByRole('button', { expanded: false })
    .filter((el) => el.classList.contains('sc-accordion__trigger'));
  act(() => { triggers.forEach((t) => fireEvent.click(t)); });
}
```

Drawer tests call `openAllAccordions()` right after `render(...)`. A test that specifically asserts a *closed* section renders nothing simply doesn't call it. (Signature is illustrative; the implementation task confirms the exact Testing Library query against Radix's rendered trigger.)

---

## 5. Testing & Verification Requirements

### 5.1 Framework and location

Vitest + React Testing Library, colocated (`AccordionContainer.test.tsx` next to the component; the helper's test next to the helper, as `cssRuleBody.test.ts` already is). jsdom mocks GSAP (`vitest.setup.ts`), so tests here prove *mount/measure/ordering* behavior, not real animation frames.

### 5.2 New tests (in `AccordionContainer.test.tsx`, `describe('lazy mount')`)

Written first, per the repo's TDD workflow, each failing before the change:

1. **Closed by default renders no children.** A probe child (a component with a mount counter) is absent from the DOM and its counter is 0 while the section is closed and never opened.
2. **First open mounts children and animates after the commit.** Stub `HTMLElement.prototype.scrollHeight` to a non-zero value; open the section; assert the height tween's target is that value — proving it was measured *after* the content mounted (a synchronous-measure implementation would tween to 0 in jsdom where nothing is measured, and fails this).
3. **First open registers a timeline** (`setTimeline` called once) and is a single render pass — the layout effect does not double-fire `animateTo`.
4. **Collapsing keeps children mounted.** Local state inside a probe child (a clicked counter) survives open → close → open; mount count stays 1.
5. **Reopening does not remount and takes the synchronous path** (no layout-effect detour — `animateTo` runs in the click's own tick).
6. **`defaultOpen` mounts children immediately** and still sets the wrapper `height: auto` (existing test at line ~178 stays green untouched).
7. **`prefers-reduced-motion` first open** still mounts and snaps (duration 0), matching the existing reduced-motion test's contract.
8. **Trigger ARIA unchanged:** `aria-expanded` correct on a never-opened section; once opened, `aria-controls` resolves to the always-rendered content wrapper (Radix omits `aria-controls` while closed, before and after this change).

Plus the helper's own test (`openAccordions.test.tsx`): opens all collapsed sections, ignores already-open ones, ignores non-accordion buttons.

Plus one integration guard in `AudioRigDrawer.test.tsx`: **rendering the drawer mounts no slider controls from never-opened sections, and opening one section mounts only that section's controls** — the regression test the whole item exists for, since it's what would silently revert if someone re-adds an eager mount.

### 5.3 Success criteria

Every criterion below is checkable, and the performance ones use the 17.2.1 harness (`npm run perf`, 3 runs each, compare medians — run-to-run variance is large, see `docs/PERFORMANCE.md`). Targets are **proposed** (§7 Q4) — derived from the box-count reduction and the baseline table, not yet validated:

1. **Deterministic (harness, any run):** immediately after opening each tile, `boxes in closed accordions` is **0** for every never-opened section, and total `.sc-cabinet-box` counts fall to approximately: Fleet Params **≤ 25** (was 321), Probes list **≤ 150** (was 494), robot detail **≤ 55** (was 403), Nav & Comms unchanged (26).
2. **Performance at 1× throttle (medians of 3):** opening Fleet Params and opening a robot's detail produce **no task ≥ 100 ms** (baseline: 2 tasks, longest 262 ms / 275 ms). The Probes list's longest task is **≤ 50%** of baseline (baseline 410 ms → ≤ ~205 ms) — it keeps ~137 boxes this item can't touch.
3. **Performance at 4× throttle (medians of 3):** total time in ≥100 ms tasks for Fleet Params open and robot-detail open drops **≥ 60%** vs `docs/PERFORMANCE.md`'s baseline.
4. **First-open cost is recorded:** the harness opens every accordion on Fleet Params and on a robot's detail page once, in turn, and reports each first-open cost (longest task, boxes added) at 1× and 4×; the maximum is the number that matters. Target **< 100 ms at 1×**, but per §7 Q5 this is **recorded, not gated** — a section that exceeds it is documented in `docs/PERFORMANCE.md` and the change still ships.
5. **Behavior preserved:** every existing test in the suite passes after the mechanical §1.6 updates, none deleted, none weakened; `AccordionContainer.test.tsx`'s existing tests pass unmodified.
6. `npm run lint`, `npm run build:types`, `npm test`, `npm run build` all clean.
7. **Manual browser check (jsdom can't see this):** open, close, reopen a section on Fleet Params and a robot detail page at mobile, tablet, and desktop widths — no frame of an open-but-empty section, no visible height jump at the end of the first open (see Risk R1), no change in open/close feel, `prefers-reduced-motion` still snaps.

### 5.4 Verification order

`npm run build:types` → `npm run lint` → targeted tests (`AccordionContainer.test.tsx`, the helper's test) → the five drawer test files → full `npm test` → `npm run build` → harness runs at 1× and 4× → manual browser pass (§5.3.7).

---

## 6. Documentation & Git/Workflow Context

* **Docs to update in the same change:**
  * `docs/COMPONENT_LIBRARY.md` — the `AccordionContainer` contract (line ~208) gains the mount-on-first-open, stays-mounted contract; the Phase 11.1.7 section (line ~161) currently states `handleValueChange`/`animateTo`/`contentRef` are "byte-for-byte unchanged," which this change makes false for `handleValueChange` — reword rather than leave a stale claim.
  * `docs/PERFORMANCE.md` — add a **dated post-change section** beside the 2026-09-18 baseline (don't overwrite it), and extend the step-table description for the new columns/steps.
  * `docs/todo/roadmap.md` — mark 17.2.2 done, noting anything that differs from this draft (same convention as the other items).
* **Harness state:** `scripts/perf/profile.mjs`'s "boxes in closed accordions" metric and the "open first robot (detail)" / "back to robot list" steps were added while writing this spec (they produced §1.1's table) and are **uncommitted in the working tree**; they get their own commit ahead of the implementation. The new first-open step (§5.3.4) is implementation work.
* **Git handling:** stacked commits on `bug/view-change-slowdown` (Crawford's call, 2026-09-18), one per task, no push until Crawford says so. No enforced conventional-commit format — short, imperative sentences.
* **Explicitly deferred:** Tone `lookAhead` (17.2.4) is **not** changed as a stopgap — Crawford chose to hold it so the profiling data stays clean while 17.2.2/17.2.3 land.

---

## 7. Open Questions & Risks

### Decisions (resolved 2026-09-18, Crawford)

* **Q1 — Keep mounted after first open, or unmount on collapse?** **Keep mounted** (§1.4).
* **Q2 — Shared `openAllAccordions` test helper, or an `eagerMount` prop?** **The helper** (§4.3). No new public API on `AccordionContainer`.
* **Q3 — Scope: `AccordionContainer` only?** **Yes.** The remaining 137 Probes-list boxes belong to 17.2.3/17.2.5.
* **Q4 — Are the §5.3 thresholds right?** **Yes**, as written — they are fixed before implementation so success isn't decided after the fact. If a threshold is missed, that is reported, not retroactively re-tuned.
* **Q5 — If one section's first open exceeds 100 ms at 1×?** **Record it and ship** (§5.3.4). Idle-time mounting stays out of scope.
* **Added scope — animation timing.** Crawford is open to adjusting animations and animation times if it helps things appear smoother (§3). This does not change the mount design; it widens what the smoothness pass may adjust if Risk R1 or a visible first-open hitch shows up.

### Risks

* **R1 — Measuring unsettled content.** Today a section is measured after its content has long since settled (controls' `ResizeObserver`s and orientation/box-count hooks already ran while it sat closed). With lazy mounting, the first open measures content in its **first-commit** state; a control that resizes itself one frame later (e.g. a `useAutoSliderOrientation` 'auto' slider flipping axis, a `useVoxelTrackBoxCount` fit) could make the section slightly taller than the tween's target. Effect if it happens: `animateTo`'s `onComplete` sets `height: auto`, so it corrects at the end — potentially a small visible jump. Mitigation: the smoothness pass (§5.3.7 — now scripted frame sampling at all three breakpoints plus Crawford's own look); if a jump or hitch shows, re-measure inside the tween's `onComplete` before releasing to `auto`, and/or adjust timing/easing (approved latitude, §3). Most Audio Rig sliders declare an explicit orientation/`verticalHeight` (roadmap 13), which narrows the exposure.
* **R2 — First-open hitch moves to the click.** The cost isn't eliminated, it's relocated to the first open of each section. Bounded by §5.3.4's measurement; see Q5.
* **R3 — Extra render on first open.** `hasOpened` adds one state change (batched with `open`, so one render) and the newly mounted controls' `ResizeObserver`s each fire once. Negligible against what's removed; included so it isn't a surprise in the profile.
* **R4 — Test churn is large but mechanical.** ~130 tests across 5–6 files change by one helper call each. Risk is a reviewer skimming past a test that quietly stopped asserting something — mitigated by §3's "never weaken a test" boundary and by reviewing the diff for *only* `openAllAccordions()` additions in those files.
* **R5 — Anything outside `src/` that expects closed content in the DOM.** Audited none in `src/` (§1.5); the harness's "boxes in closed accordions" metric will count 0 by design after this change, so that column's meaning shifts from "waste" to "regression alarm" — noted in `docs/PERFORMANCE.md` with the post-change section.

---

## 8. As Shipped (2026-09-18)

What landed matches §1.2–§1.6 and §4.3 exactly. §4.1's code sketch changed in three ways, all found by measuring in real Chrome (jsdom can't see frames), all within the animation latitude §3 granted:

1. **The first-open animation waits for the content to settle, on GSAP's own ticks.** §4.1 called `animateTo(true)` from the layout effect. That measured the right height at the right time in jsdom, but in Chrome the mount task ran while the tween's clock was already ticking (GSAP stamps a new timeline with its *last tick's* time), so the two heaviest sections (EQ & Filters, Source) opened in 3 tween frames instead of the ~12 they had before this change. Deferring by a single tick was not enough — the controls' ResizeObservers do a second wave of work after first paint, and Source got *worse* (1 frame, a 15 px snap). The layout effect now starts a short timeline whose `.call()` polls each tick until two consecutive ticks read the same height (capped at `FIRST_OPEN_MAX_SETTLE_TICKS` = 8), then runs `animateTo(true)`. It is registered under `${timelineKey}-start` in `timelineMap` so a toggle or unmount cancels it; `animateTo` itself kills any pending start. No timers, so the repo's no-`setTimeout`-for-timing rule holds. Reopens and closes are unchanged.
2. **The tween targets the inner wrapper's laid-out height, not `scrollHeight`.** Every open — before this change too — ended by snapping 2–2.5 px shorter, because `scrollHeight` counts the last box's popped-out overhang (a transform) that `height: auto` drops. `measureContentHeight()` (inner wrapper's `getBoundingClientRect().height`) is now shared by the tween target and the settle check. Snap: 2–2.5 px → 0–0.5 px.
3. **No duration, easing, or sequencing was changed** — only when the tween is built and what height it lands on.

**Corrections to the draft:** §1.5's claim that Radix's `aria-controls` "stays valid" on a closed section was wrong — Radix sets it only while open (fixed in place above). §5.3.7's "manual browser check" became scripted frame sampling (`npm run perf -- --smoothness`) plus a still-outstanding human look.

**Known residual (not fixed):** at 820 px wide, EQ & Filters sometimes (~36% of runs; 0 of 5 pre-change) grows ~15 px about 120 ms after its open completes — a late re-layout of the freshly-mounted content after the settle check has passed. Recorded in `docs/PERFORMANCE.md`; the cause is not identified.
