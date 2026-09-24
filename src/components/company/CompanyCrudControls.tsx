import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
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
// shape, but each needs its own humanLabel: CompanyCreateForm and CompanyRenameDeleteForm render
// at different tree nodes (the bare "Companies" node vs. a specific "Company X" node) and are
// never mounted simultaneously, but keep distinct ids/labels anyway — matches every other schema
// clone in this file (RENAME_COMPANY_SCHEMA etc.), and keeps each accessible name unambiguous if
// that ever changes.
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
 * Create half of Companies CRUD (Roadmap Phase 10; relocated into the nav tree by
 * docs/tasks/NAV_LAYOUT_REWRITE.md Task 20, spec §2 — this is the bare "Companies" tree node's
 * own content). Split out of the old combined CompanyCrudControls (which rendered Create AND
 * Rename/Delete together, gated on whether a company was selected) since the tree now shows one
 * or the other depending on which node is selected, never both. The name field is local, staged
 * component state — it doesn't commit to the store until Create is clicked. Pre-filled with a
 * generated suggestion the user can accept as-is or edit first. Unlike every seeded id elsewhere
 * in this app, a user-created company's id has no seed to derive from (the user's choice to
 * create it isn't reproducible world generation) — crypto.randomUUID() (via generateUUID) is the
 * right tool here, not a violation of the app's seeded-generation rule.
 */
export function CompanyCreateForm() {
  const localeId = getActiveLocaleId();
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);

  const [createNameDraft, setCreateNameDraft] = useState(suggestCompanyName);

  const atCap = companies.length >= MAX_COMPANIES;
  // A "visible string" — not blank, not whitespace-only. The input itself is never disabled for
  // this reason (only the cap disables the input) — disabling it on blank would make it
  // impossible to type a first character back in.
  const nameIsBlank = createNameDraft.trim().length === 0;

  // Previews what clicking Create will do (docs/tasks/COMPANY_CRUD_BUTTON_PREVIEW.md Task 2) — the
  // raw, as-typed draft, not trimmed (matches nameIsBlank's own trim-only-for-the-blank-check
  // convention: what's displayed once non-blank is "as typed"). A per-render clone, not a mutation
  // of the shared CREATE_COMPANY_SCHEMA constant. Button.tsx's own resolveAccessibleName/DualLabel
  // both read schema.humanLabel directly, so this one field drives both the accessible name and
  // the visible text with no other change needed.
  const createSchema = {
    ...CREATE_COMPANY_SCHEMA,
    humanLabel: nameIsBlank ? CREATE_COMPANY_SCHEMA.humanLabel : `${CREATE_COMPANY_SCHEMA.humanLabel} ${createNameDraft}`,
  };

  const handleCreate = () => {
    const color = pickRandomCompanyColor(companies.map((c) => c.color));
    const company: Company = { id: generateUUID(), name: createNameDraft.trim(), color, robotIds: [] };
    useLocaleStore.getState().addCompany(localeId, company);
    setCreateNameDraft(suggestCompanyName());
  };

  return (
    <div className="company-create-form">
      <TextInput schema={CREATE_NAME_SCHEMA} value={createNameDraft} onChange={setCreateNameDraft} disabled={atCap} />
      <Button schema={createSchema} onClick={handleCreate} disabled={atCap || nameIsBlank} />
    </div>
  );
}

/**
 * A read-only glance at the selected company — name, its own identity color swatch, and current
 * member count — the "RobotDisplaySection-equivalent summary" spec §2's Node -> Content Mapping
 * table calls for on a bare "Company X" tree node. Genuinely needed, not just decorative: Rename's
 * own input below is pre-filled with a fresh SUGGESTED name (docs/tasks/
 * COMPANY_CRUD_BUTTON_PREVIEW.md Task 1), never the company's actual current name, so without this
 * summary there would be no visible read-only display of what the company is actually called
 * right now (Delete's own button label is the only other place it survives). Minimal by design —
 * the spec names no further fields, and this mirrors RobotDisplaySection's own scope (a handful of
 * read-only identity rows, not a full editor).
 */
function CompanySummary({ company }: { company: Company }) {
  const robotCount = company.robotIds.length;
  return (
    <div className="company-summary">
      <span className="company-summary__swatch" style={{ backgroundColor: company.color }} aria-hidden="true" />
      <span className="company-summary__name">{company.name}</span>
      <span className="company-summary__count">{robotCount} {robotCount === 1 ? 'robot' : 'robots'}</span>
    </div>
  );
}

/**
 * Rename/Delete half of Companies CRUD (Roadmap Phase 10; relocated into the nav tree by
 * docs/tasks/NAV_LAYOUT_REWRITE.md Task 20, spec §2 — this is a specific "Company X" tree node's
 * own content, rendered only once a company is actually selected). Split out of the old combined
 * CompanyCrudControls the same way CompanyCreateForm was — see that component's own doc comment.
 *
 * Rename's draft is local, staged component state (not committed until Submit is clicked),
 * reset to a FRESH generated suggestion — never the selected company's own current name — whenever
 * the selection itself changes (tracked by id, not the resolved Company object, so an unrelated
 * update to the same company elsewhere, e.g. a robot reassigned into/out of it, never clobbers an
 * in-progress unsubmitted edit).
 *
 * Delete gains a confirmation step here (spec §7 Q2, the app's first confirmation dialog) — a
 * Radix AlertDialog, since no existing Dialog/Modal primitive exists in
 * src/components/ui/controls/ to reuse. Its Cancel/Action buttons are Radix's own plain rendered
 * `<button>`s (not the schema-driven Button component): Button.tsx neither forwards a ref nor
 * spreads arbitrary props, so it can't compose with Radix's `asChild` slot pattern — a deliberate,
 * narrow deviation from the app's ControlSchema convention at this one boundary, not a precedent
 * for skipping it elsewhere. The outer Delete trigger itself IS the normal schema-driven Button;
 * only opening state (never itself calling removeCompany) — confirming or cancelling inside the
 * dialog is what actually commits or discards.
 */
export function CompanyRenameDeleteForm() {
  const localeId = getActiveLocaleId();
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const selectAllRobots = useUIStore((s) => s.selectAllRobots);
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  // See CompanyCrudControls' own pre-split history for why this resets on SELECTION change
  // (tracked by id) rather than on every render where the resolved Company object differs.
  const [renameDraft, setRenameDraft] = useState(() => (selectedCompany ? suggestCompanyName() : ''));
  const [lastSeenSelectedCompanyId, setLastSeenSelectedCompanyId] = useState(selectedCompanyId);
  if (selectedCompanyId !== lastSeenSelectedCompanyId) {
    setLastSeenSelectedCompanyId(selectedCompanyId);
    setRenameDraft(selectedCompany ? suggestCompanyName() : '');
  }

  const [confirmOpen, setConfirmOpen] = useState(false);

  // selectedCompany, not selectedCompanyId — uiStore isn't reset by a locale reseed, so
  // selectedCompanyId can point at a company that no longer exists even when the id itself is
  // non-null. Gating on the resolved company object covers both "nothing selected" and "selection
  // is stale" in one check.
  const hasSelectedCompany = Boolean(selectedCompany);
  const renameIsBlank = renameDraft.trim().length === 0;
  const renameUnchanged = hasSelectedCompany && renameDraft.trim() === selectedCompany?.name;

  const renameSchema = {
    ...RENAME_COMPANY_SCHEMA,
    humanLabel: renameIsBlank
      ? RENAME_COMPANY_SCHEMA.humanLabel
      : `${RENAME_COMPANY_SCHEMA.humanLabel} ${selectedCompany?.name ?? ''} > ${renameDraft}`,
  };
  const deleteSchema = {
    ...DELETE_COMPANY_SCHEMA,
    humanLabel: selectedCompany ? `${DELETE_COMPANY_SCHEMA.humanLabel} ${selectedCompany.name}` : DELETE_COMPANY_SCHEMA.humanLabel,
  };

  const handleRenameSubmit = () => {
    if (!selectedCompany) return;
    useLocaleStore.getState().updateCompany(localeId, selectedCompany.id, { name: renameDraft.trim() });
    setRenameDraft(suggestCompanyName());
  };

  const handleConfirmDelete = () => {
    if (!selectedCompany) return;
    useLocaleStore.getState().removeCompany(localeId, selectedCompany.id);
    selectAllRobots();
    setConfirmOpen(false);
  };

  return (
    <div className="company-rename-delete-form">
      {selectedCompany && <CompanySummary company={selectedCompany} />}

      <div className="company-rename-delete-form__rename">
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

      <Button schema={deleteSchema} onClick={() => setConfirmOpen(true)} disabled={!hasSelectedCompany} />

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="company-delete-confirm__overlay" />
          <AlertDialog.Content className="company-delete-confirm__content">
            <AlertDialog.Title className="company-delete-confirm__title">
              Delete {selectedCompany?.name}?
            </AlertDialog.Title>
            <AlertDialog.Description className="company-delete-confirm__description">
              Its member robots become Freelance. This can&apos;t be undone.
            </AlertDialog.Description>
            <div className="company-delete-confirm__actions">
              <AlertDialog.Cancel className="company-delete-confirm__cancel">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action className="company-delete-confirm__confirm" onClick={handleConfirmDelete}>
                Delete
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
