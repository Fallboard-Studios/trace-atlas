import { useState } from 'react';
import { TextInput } from '@/components/ui/controls/TextInput';
import { Button } from '@/components/ui/controls/Button';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { generateCompanyName } from '@/systems/spawnSystem';
import { COMPANY_NAME_INPUT_SCHEMA, CREATE_COMPANY_SCHEMA, RENAME_COMPANY_SCHEMA, DELETE_COMPANY_SCHEMA } from '@/data/companyConfig';
import { MAX_COMPANIES } from '@/constants';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '@/constants/accentColors';
import type { Company } from '@/types/Company';
import { generateUUID } from '@/utils/randomId';

import './CompanyCrudControls.css';

// Distinct schema clones for the Create/Rename inputs — same shared COMPANY_NAME_INPUT_SCHEMA
// shape, but each needs its own humanLabel: both inputs are mounted simultaneously, so sharing
// one accessible name ("Company Name") would make them ambiguous to query and to a screen reader.
const CREATE_NAME_SCHEMA = { ...COMPANY_NAME_INPUT_SCHEMA, id: 'company.name.create', humanLabel: 'New Company Name' };
const RENAME_NAME_SCHEMA = { ...COMPANY_NAME_INPUT_SCHEMA, id: 'company.name.rename', humanLabel: 'Rename Company' };

/**
 * A fresh "Adjective Noun" suggestion, reusing generateCompanyName's exact word-list logic
 * (Roadmap Phase 10 spawn generation) but fed by Math.random() instead of a seeded noise map —
 * this is a live, user-triggered suggestion, not part of replayable world generation, the same
 * "Random" precedent SectorSettingsDrawer's coordinate presets already establish (Math.random(),
 * not getSeededVal, for a one-off UI convenience roll rather than reproducible world state).
 */
function suggestCompanyName(): string {
  return generateCompanyName(() => Math.random() * 2 - 1, 0);
}

/**
 * A random, currently-unused company color (docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.2) —
 * re-rolls against every color already in use by an existing company in this locale, the same
 * Math.random()-for-a-live-UI-roll precedent suggestCompanyName above already establishes (not
 * reproducible world generation — spawnSystem.ts's own generateCompanyIdentityColor covers that
 * path, seeded). Bounded at ROBOT_IDENTITY_COLOR_NAMES.length attempts, never an unbounded loop —
 * MAX_COMPANIES (6) is always well under the 18-hue palette, so this always finds a free color in
 * practice; the fallback return only matters if that invariant is ever broken.
 */
function pickRandomCompanyColor(existingColors: string[]): string {
  const used = new Set(existingColors);
  for (let attempt = 0; attempt < ROBOT_IDENTITY_COLOR_NAMES.length; attempt++) {
    const name = ROBOT_IDENTITY_COLOR_NAMES[Math.floor(Math.random() * ROBOT_IDENTITY_COLOR_NAMES.length)];
    if (!used.has(ACCENT_COLORS[name])) return ACCENT_COLORS[name];
  }
  return ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[Math.floor(Math.random() * ROBOT_IDENTITY_COLOR_NAMES.length)]];
}

/**
 * Create/Rename/Delete for Companies (Roadmap Phase 10). Both Create's and Rename's name fields
 * are local, staged component state — neither commits to the store until its own button is
 * clicked. Create's is pre-filled with a generated suggestion the user can accept as-is or edit
 * first; Rename's is pre-filled with the selected company's current name (was bound live,
 * updating the store on every keystroke, until a Submit button was added to match Create).
 * Unlike every seeded ID elsewhere in this app, a user-created company's id has no seed to derive
 * from (the user's choice to create it isn't reproducible world generation) —
 * crypto.randomUUID() is the right tool here, not a violation of the app's seeded-generation
 * rule.
 *
 * Was wrapped in its own AccordionContainer, collapsed by default (docs/specs/
 * COMPANY_SECTION_ENHANCEMENTS.md §1.1); that wrap was removed (Roadmap: Robot Selection Filter
 * Panel) — Create/Rename/Delete now render directly, always visible, no toggle. CompanyButtonRow
 * stays outside this component regardless, rendered by CompanyManager above.
 */
export function CompanyCrudControls() {
  const localeId = getActiveLocaleId();
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const selectAllRobots = useUIStore((s) => s.selectAllRobots);
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  const [createNameDraft, setCreateNameDraft] = useState(suggestCompanyName);

  // Rename's own staged draft (Create's own pattern, extended here) — not committed to the store
  // until Submit is clicked, matching Create's own "not live" behavior instead of Rename's old
  // one (a TextInput bound live to the selected company's name, updating the store on every
  // keystroke). Reset to a FRESH generated suggestion (suggestCompanyName — the same generator
  // Create's own draft uses), never the selected company's own current name (docs/tasks/
  // COMPANY_CRUD_BUTTON_PREVIEW.md Task 1) — so the Rename button can always preview two
  // different names without the user typing anything first. Reset whenever the SELECTION itself
  // changes (tracked by id, not the resolved Company object) — narrower than that would mean an
  // unrelated update to the same company elsewhere (e.g. a robot reassigned into/out of it via
  // RobotSelectionCard, which also produces a new Company object reference) clobbers an
  // in-progress, not-yet-submitted rename edit — this only resets on an actual switch of which
  // company is selected, done during render rather than a useEffect, same reasoning
  // SectorSettingsDrawer's own draft-reset comment gives (avoids an extra, avoidable render pass).
  const [renameDraft, setRenameDraft] = useState(() => (selectedCompany ? suggestCompanyName() : ''));
  const [lastSeenSelectedCompanyId, setLastSeenSelectedCompanyId] = useState(selectedCompanyId);
  if (selectedCompanyId !== lastSeenSelectedCompanyId) {
    setLastSeenSelectedCompanyId(selectedCompanyId);
    setRenameDraft(selectedCompany ? suggestCompanyName() : '');
  }

  const atCap = companies.length >= MAX_COMPANIES;
  // A "visible string" — not blank, not whitespace-only. The input itself is never disabled for
  // this reason (only the cap disables the input) — disabling it on blank would make it
  // impossible to type a first character back in.
  const nameIsBlank = createNameDraft.trim().length === 0;
  // selectedCompany, not selectedCompanyId — uiStore isn't reset by a locale reseed, so
  // selectedCompanyId can point at a company that no longer exists (regenerated with a fresh id,
  // or simply gone) even when the id itself is non-null. Gating on the resolved company object
  // covers both "nothing selected" and "selection is stale" in one check.
  const hasSelectedCompany = Boolean(selectedCompany);
  // Same "visible string" rule as Create's nameIsBlank, plus a no-op guard: Submit disabled when
  // the trimmed draft exactly matches the selected company's current name, so a no-change click
  // (or a stray click right after a successful rename, before the draft's own reset above lands)
  // never fires a pointless store write.
  const renameIsBlank = renameDraft.trim().length === 0;
  const renameUnchanged = hasSelectedCompany && renameDraft.trim() === selectedCompany?.name;

  // Previews what clicking Create will do (docs/tasks/COMPANY_CRUD_BUTTON_PREVIEW.md Task 2) — the
  // raw, as-typed draft, not trimmed (matches nameIsBlank's own trim-only-for-the-blank-check
  // convention: what's displayed once non-blank is "as typed"). A per-render clone, not a mutation
  // of the shared CREATE_COMPANY_SCHEMA constant — same pattern CREATE_NAME_SCHEMA/RENAME_NAME_SCHEMA
  // already use above, just computed per-render here since it depends on component state.
  // Button.tsx's own resolveAccessibleName/DualLabel both read schema.humanLabel directly, so this
  // one field drives both the accessible name and the visible text with no other change needed.
  const createSchema = {
    ...CREATE_COMPANY_SCHEMA,
    humanLabel: nameIsBlank ? CREATE_COMPANY_SCHEMA.humanLabel : `${CREATE_COMPANY_SCHEMA.humanLabel} ${createNameDraft}`,
  };
  // Same pattern as createSchema above (docs/tasks/COMPANY_CRUD_BUTTON_PREVIEW.md Task 3).
  // renameIsBlank already coincides with "nothing selected," since the draft is forced to '' on
  // deselect — no separate hasSelectedCompany branch needed in the condition itself.
  // selectedCompany?.name ?? '' in the true branch is defensive typing only (TypeScript can't
  // otherwise prove selectedCompany is defined whenever !renameIsBlank, even though it always is
  // by construction) — not a reachable '' case in practice.
  const renameSchema = {
    ...RENAME_COMPANY_SCHEMA,
    humanLabel: renameIsBlank
      ? RENAME_COMPANY_SCHEMA.humanLabel
      : `${RENAME_COMPANY_SCHEMA.humanLabel} ${selectedCompany?.name ?? ''} > ${renameDraft}`,
  };
  // Same pattern once more (docs/tasks/COMPANY_CRUD_BUTTON_PREVIEW.md Task 4).
  const deleteSchema = {
    ...DELETE_COMPANY_SCHEMA,
    humanLabel: selectedCompany ? `${DELETE_COMPANY_SCHEMA.humanLabel} ${selectedCompany.name}` : DELETE_COMPANY_SCHEMA.humanLabel,
  };

  const handleCreate = () => {
    const color = pickRandomCompanyColor(companies.map((c) => c.color));
    const company: Company = { id: generateUUID(), name: createNameDraft.trim(), color, robotIds: [] };
    useLocaleStore.getState().addCompany(localeId, company);
    setCreateNameDraft(suggestCompanyName());
  };

  const handleRenameSubmit = () => {
    if (!selectedCompany) return;
    useLocaleStore.getState().updateCompany(localeId, selectedCompany.id, { name: renameDraft.trim() });
    // Reroll to a fresh suggestion immediately, mirroring handleCreate's own post-create reroll —
    // keeps the "always two different names" promise true on the very next render, not just
    // before submit (docs/tasks/COMPANY_CRUD_BUTTON_PREVIEW.md Task 1).
    setRenameDraft(suggestCompanyName());
  };

  const handleDelete = () => {
    if (!selectedCompany) return;
    useLocaleStore.getState().removeCompany(localeId, selectedCompany.id);
    selectAllRobots();
  };

  return (
    <div className="company-crud-controls">
      <div className="company-crud-controls__create">
        <TextInput schema={CREATE_NAME_SCHEMA} value={createNameDraft} onChange={setCreateNameDraft} disabled={atCap} />
        <Button schema={createSchema} onClick={handleCreate} disabled={atCap || nameIsBlank} />
      </div>

      <div className="company-crud-controls__rename">
        <TextInput
          schema={RENAME_NAME_SCHEMA}
          value={renameDraft}
          onChange={setRenameDraft}
          disabled={!hasSelectedCompany}
        />
        <Button
          schema={renameSchema}
          onClick={handleRenameSubmit}
          disabled={!hasSelectedCompany || renameIsBlank || renameUnchanged}
        />
      </div>

      <Button schema={deleteSchema} onClick={handleDelete} disabled={!hasSelectedCompany} />
    </div>
  );
}

export default CompanyCrudControls;
