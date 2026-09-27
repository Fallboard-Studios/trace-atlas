# Intent: Nav Panel — Scrollable Views + New Section Depth

Confirmed via `/interview-me` on 2026-09-24. Follow-up to the Navigation & Layout Rewrite
(`docs/specs/NAV_LAYOUT_REWRITE.md`, all 22 tasks shipped on `feature/nav-layout-rewrite`). That
rewrite gave each top-level branch (Settings/Fleet Params/Probes/Companies) a tree nav whose
clicks *swap* the content pane to exactly one section at a time. This intent replaces that
swap-model with a single continuous scrollable "view" per branch (or per selected robot/company),
plus adds a new 4th tree level under Probes/Companies. Doc content itself (the "docs" referenced
throughout) is a separate, later pass — not written yet.

## Outcome

### 1) View model replaces content-swapping

Each top-level branch's content pane becomes one scrollable page holding every section for the
current context (the whole branch for Settings/Fleet Params; the selected robot, "All Probes," or
selected company for Probes/Companies), instead of swapping to render only the clicked section.

**Accordions, reused:** the pre-existing accordion component collapses/expands each section within
the view. A "section" is whatever tree depth is the *lowest child shown in the nav panel tree* for
that branch — e.g. 3-Band EQ/High-Pass Filter/etc. under Fleet Params (currently the grandchild
level), or Rhythm/Coaxial Oscillator/etc. under Probes/Companies (the new great-grandchild level
added below). Nodes above that leaf level (branches, robots/companies, Melody/Source-style
grandchildren, Fleet Params' EQ & Filters/Time & Space/Output groups) are not accordions
themselves — they're just headings/positions within the page.

**Exactly one accordion open at a time, view-wide** — never per-group. Opening one closes every
other open accordion anywhere else in the same view, no matter how far apart in the tree.

**Selection → scroll + accordion state:**
- Clicking a top-level branch node (Settings/Fleet Params/Probes/Companies) jumps to the *top* of
  that view. Its first leaf-descendant (in tree order) opens; everything else closes.
- Clicking anything deeper (a mid-level node or a leaf) scrolls to that item's section position
  within the same view — "the top of the appropriate section," regardless of how many levels
  deep. If the clicked node is itself a leaf, only its own accordion opens. If it's a mid-level
  node (e.g. "Melody," "EQ & Filters," a selected robot/company itself), its first
  leaf-descendant opens instead. Either way, every other open accordion in the view closes first.
- The scroll itself is an instant jump — no animation, no GSAP timeline.
- **Scrollspy:** as the user manually scrolls a view (not via a nav click), the nav tree's
  highlighted/selected row updates live to track whichever section is currently in view, and the
  tree auto-expands whatever ancestor rows are needed so the highlighted row is always visible.

**Individual robot views** keep their existing metadata block (name/id/etc.) at the top, above the
accordion sections — unchanged from today's `RobotOptionsTab` layout, just without the swap.

**Unchanged, still not part of the view/accordion/scroll model:** the bare "Probes" branch (robot
list) and the bare "Companies" branch (create-company form). Those keep their current
single-purpose rendering; the view model only applies once a robot, "All Probes," or a company is
selected.

### 2) Doc placeholders, reserved but empty

Docs per section haven't been written yet (next pass). This pass reserves an empty/placeholder doc
slot in each section's layout now, so wiring in real doc content later is a content fill, not a
layout change.

### 3) New 4th tree level — Probes and Companies

Both `probes.all`/per-robot and per-company subtrees (`useNavTree.ts`'s shared
`sectionChildNodes`/`SECTION_CHILDREN`) gain a great-grandchild layer under each of their 4
existing sections:

| Grandchild (renamed where noted) | New great-grandchildren |
|---|---|
| **Output** (renamed from *Volume* — label only) | Audio Settings |
| Melody | Rhythm, Frequency |
| Envelope | Ping Contour |
| Source | Baseline Oscillator, Coaxial Oscillator, Harmonic Oscillator, **Probe Drift** (renamed from *Robot Drift* — label only) |

Both renames are nav-label-only. Internal identifiers stay as they are today: `RobotSection`'s
`'volume'` value, `CompanyOptionsSection`'s `section` prop, `AudioSettingSection`, `RobotDriftPanel`,
`globalAudio.lfoDrift.robots`, etc. are all unaffected — only the tree's `humanLabel` text changes.
Settings' own "Volume" leaf and Header's Volume/Mute controls are untouched; only the Probes/
Companies section is being renamed.

Tree selection/expand state currently only tracks 3 levels (branch/entity/section). This pass adds
real state for the 4th level — a genuine selection + expand field, not just decorative nodes — so
clicking/expanding a great-grandchild behaves correctly within the view/scroll/accordion model
above.

## Out of scope

- Actual doc copy/content — placeholder slots only.
- Any GSAP-animated or otherwise eased scrolling — instant jump only.
- Renaming internal code identifiers (`'volume'`, `RobotDriftPanel`, `lfoDrift.robots`, and
  similar) — nav labels only.
- Any change to the bare "Probes" (robot list) or bare "Companies" (create form) screens.
- Fleet Params' own tree depth/labels — unchanged; it already has the group → leaf structure this
  intent's accordion/scroll rules apply to.
