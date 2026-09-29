# Intent: Sector Settings — Shareable Link Import/Export

Confirmed via `interview-me` on 2026-09-28, ahead of a `spec-driven-development` pass. Roadmap
[Phase 21](../todo/roadmap.md#21-sector-settings-shareable-linkimportexport). Depends on
[Session Storage (20)](session-storage.md) and
[World Clock (20.5)](world-clock-deterministic-lifecycle-replay.md), both shipped.

**Correction to the roadmap's own "About" framing:** that section describes reusing
`urlSerializer.ts`'s "compression/encoding" and `stateResolver.ts`'s "URL-priority resolution" —
neither file exists in this codebase. The only prior art is `src/utils/seedUtils.ts`, which reads
`?seed=`/`?x=`/`?y=` into module-level overrides at boot to pin Attenuation Style name and locale
coordinates for reproducible bug reports. This phase is new work, grounded in that pattern, not a
wiring-up of an existing primitive.

## Outcome

Any `SessionPayload` — a saved session or the current live session — can be turned into a single
URL that, when opened, reproduces that exact world: same locale (Attenuation Style, coordinates),
same robot/company audio tuning, same global audio settings. No separate import UI: the only way
to load a shared world is opening a link that carries one.

## Behavior

- **Two "Share Session" entry points**, both producing the same kind of link:
  - One button per row in the "Load Sessions" list (`SessionListItem.tsx`), placed between the
    existing Load and Delete buttons. Shares that row's *stored* `entry.payload` — unaffected by
    whatever the live app state currently is.
  - One button next to the existing Save Session button (`SessionsPanel.tsx`). Shares the
    *current live state*, built the same way Save does (`buildSessionPayload()`) — not whatever
    is in local storage.
- **Encoding: plain base64-encoded JSON of the `SessionPayload`, in one URL query param.** No
  compression library — CLAUDE.md requires asking before adding a dependency, and this is a fixed
  12-robot world, not open-ended data; a base64 JSON param is small enough in practice. Everything
  a share needs to reproduce (`attenuationStyleName`, `coordinates`, `globalAudio`,
  `robotOverrides`, `companyDiffs`, `userCreatedCompanies`) already lives in `SessionPayload` — no
  new payload shape.
- **One combined param, not several.** Rejected splitting across the existing `?seed=`/`?x=`/`?y=`
  params plus a new one for the audio/robot diff: those existing params are a separate,
  independently-editable debug/repro tool: mixing them with this feature risks them drifting out
  of sync if someone hand-edits a URL. A single opaque param is also simplest to generate and copy.
- **Clicking either Share button:** builds the payload, base64-encodes it into the URL param,
  writes the full link (origin + pathname + that one param — not preserving whatever other query
  params happen to be present, e.g. `?debug`) to the clipboard via `navigator.clipboard`, and shows
  a transient "Link copied" note near the button that triggered it — same category of transient
  status feedback `SessionsPanel.tsx`'s existing post-Save `saveStatus` note already uses.
- **Opening a link with the param present, at boot, in two phases — to avoid a flash of the wrong
  world:**
  1. **Before the default locale is created:** decode the param and feed `attenuationStyleName`/
     `coordinates` into the same early-override mechanism `seedUtils.ts` already uses for
     `?seed=`/`?x=`/`?y=` (module-level, read before `localeStore` builds its default locale). This
     guarantees the correct locale — which robots exist, where they are — renders from the very
     first paint. No spawn-then-replace.
  2. **Shortly after mount:** apply `robotOverrides`/`companyDiffs`/`globalAudio`/
     `userCreatedCompanies` via the existing `applySessionPayload()` — the same function
     `SessionListItem`'s Load button already calls. This is allowed to visibly settle in a moment
     after first paint, the same way clicking Load does today; only the locale itself needs to be
     right from frame one.
- **A loaded shared session behaves like a Load, not a read-only preview.** The Session Name input
  keeps its normal freshly-generated suggestion (`suggestSessionName()` — a shared link's payload
  carries no name), and the user can hit Save Session to persist it locally under a name, same as
  after any other Load.
- **The link is durable and bookmarkable, not one-time-use.** The URL param stays in the address
  bar after it's applied — no `history.replaceState` clearing. Reopening or refreshing the same
  link reproduces the same world every time.

## Style / constraint

- No new dependency (no compression library).
- Reuse `applySessionPayload()` and `buildSessionPayload()` as-is for the post-mount half; reuse
  `seedUtils.ts`'s early-override pattern (not its exact functions, which are seed/coordinate-only
  today) for the pre-spawn half.
- `SessionPayload`'s existing `version` field (already present, "unused by this phase's own code"
  per its own doc comment in `types/session.ts` — written in anticipation of exactly this phase)
  is the mechanism for a future importer to distinguish payload shapes; this phase is that future
  importer.

## Out of scope

- **No manual "paste a link or raw payload" import UI.** The roadmap's original "About" framing
  described explicit Export *and* Import controls in `SectorSettingsDrawer`; this pass narrows
  that to auto-load-on-URL-param only. Revisit a manual paste-in affordance later if it turns out
  to be wanted.
- **No compression.** Plain base64 JSON only.
- **No changes to Session Storage's own local CRUD, diff model, or payload shape** beyond reusing
  what already exists.
- **No `history.replaceState` / one-time-link behavior.** Links are durable by design (confirmed).
- **Phase 32's scrubber UI** — unaffected, still fully separate future work.

## Known implementation note (not yet spec'd)

- Exact query param name (e.g. `?session=`) — left for the spec pass.
- Where the boot-time decode-and-override step lives (likely alongside or inside `seedUtils.ts`,
  given it needs the same "read before the store initializes" timing) — left for the spec pass.
- Clipboard-write failure handling (e.g. permission denied) — likely mirrors `SessionsPanel.tsx`'s
  existing success/failure `saveStatus` pattern, but left for the spec pass to confirm the exact
  UI.
