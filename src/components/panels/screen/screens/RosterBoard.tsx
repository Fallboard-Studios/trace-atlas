import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { selectEntity } from '../nav/navActions';
import { useEntityRoster, type RosterEntry } from '../nav/useEntityRoster';
import { useShell } from '../useShell';
import { RosterTile } from './RosterTile';
import { CompanyCreateForm } from '@/components/company/CompanyCrudControls';
import { Button } from '@/components/ui/controls/Button';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { rosterRows, type RosterRow } from '@/utils/rosterRows';
import { getRobotColorStyle, getTraitColorStyle } from '@/utils/traitColors';
import { CONTENT, fill, introProps, labels } from '@/content';
import type { ButtonSchema } from '@/types/controls';
import './RosterBoard.css';

const INTRO = introProps('probe.root');
const INTRO_NAME = CONTENT['probe.root'].human;
const BOARD_STYLE = getTraitColorStyle('output');
/** The sketch draws All Probes in the Deck's colour (the whole fleet), + New Company and Freelance in the
 *  companies trait — as the nav's entity list does. */
const ALL_PROBES_ACCENT = getTraitColorStyle('header');
const COMPANY_TRAIT_ACCENT = getTraitColorStyle('company');
const FREELANCE = CONTENT['company.assign'].options.freelance.human;

const ALL_PROBES = labels('probe.all');
const NEW_COMPANY = labels('nav.entity.newCompany');
// The phone head's faces are the entries' short forms, alone: the sketch's "All" and "+".
const HEAD_SCHEMAS = {
  desk: {
    all: { id: 'roster.allProbes', type: 'button', ...ALL_PROBES },
    create: { id: 'roster.newCompany', type: 'button', ...NEW_COMPANY },
  },
  phone: {
    all: { id: 'roster.allProbes', type: 'button', humanLabel: CONTENT['probe.all'].short },
    create: { id: 'roster.newCompany', type: 'button', humanLabel: CONTENT['nav.entity.newCompany'].short },
  },
} satisfies Record<'desk' | 'phone', Record<'all' | 'create', ButtonSchema>>;

const pickAllProbes = () => selectEntity('all');

interface MemberEntry {
  id: string;
  companyId?: string;
}

function membersEqual(a: readonly MemberEntry[], b: readonly MemberEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, i) => entry.id === b[i].id && entry.companyId === b[i].companyId);
}

/**
 * Which robots exist and which company each is in — all the board itself needs (spec §4's memo
 * boundary). `updateRobot` replaces the robots array on every battery tick and swell, so the previous
 * array is returned while ids and memberships are unchanged (the wrapping-selector technique
 * useEntityRoster uses; Zustand 5 takes no equality argument). The tiles read their own robots.
 */
function useMembership(): MemberEntry[] {
  const localeId = getActiveLocaleId();
  const prevRef = useRef<MemberEntry[]>([]);
  return useLocaleStore((s) => {
    const next = (s.locales[localeId]?.robots ?? []).map((robot) => ({ id: robot.id, companyId: robot.companyId }));
    if (membersEqual(prevRef.current, next)) return prevRef.current;
    prevRef.current = next;
    return next;
  });
}

const countText = (n: number) => (n === 1 ? CONTENT['probe.roster.count.one'].human : fill('probe.roster.count', { n: String(n) }));

interface RosterRowViewProps {
  row: RosterRow;
  /** The row's company, or undefined for Freelance. */
  company?: RosterEntry;
}

/** One group: the leading cell (the company's name box, which opens it, or the Freelance label) and its
 *  count, then the member tiles flowing right. Not memo'd: rosterRows builds fresh rows on every board
 *  render, and the board renders only when membership or a company changes; the tiles are memo'd. */
function RosterRowView({ row, company }: RosterRowViewProps) {
  const name = company ? (company.name ?? company.id) : FREELANCE;
  const accent: CSSProperties = useMemo(() => (company ? getRobotColorStyle(company.color) : COMPANY_TRAIT_ACCENT), [company]);
  const schema = useMemo<ButtonSchema | null>(
    () => (company ? { id: `roster.company.${company.id}`, type: 'button', humanLabel: name } : null),
    [company, name],
  );
  const timelineKey = `cabinet-roster-freelance-${useId()}`;

  return (
    <div className="roster-board__row" role="group" aria-label={name} style={accent}>
      <div className="roster-board__lead">
        {company && schema ? (
          <Button schema={schema} onClick={() => selectEntity({ companyId: company.id })} />
        ) : (
          // Not a company, so nothing to open: a flat box, the frame style (out = act, spec §3).
          <CabinetBox popped={false} timelineKey={timelineKey}>
            <span className="roster-board__name">{name}</span>
          </CabinetBox>
        )}
        <span className="roster-board__count">{countText(row.robotIds.length)}</span>
      </div>
      <ul className="roster-board__tiles">
        {row.robotIds.map((id) => <RosterTile key={id} robotId={id} />)}
      </ul>
    </div>
  );
}

/**
 * The roster board (docs/specs/LAYOUT_REWORK.md §1.5; docs/tasks/LAYOUT_REWORK.md Task 21), the Probes
 * and Companies branches' own page: the head (All Probes, + New Company disclosing the staged
 * CompanyCreateForm inline), the Probes intro as an expander, then one row per group in rosterRows()
 * order — the companies, then Freelance. No filter: the board is grouped already. Desk tiles flow right
 * and wrap; the phone stacks them in one column and the pane scrolls.
 */
export function RosterBoard() {
  const shell = useShell();
  const members = useMembership();
  const companies = useEntityRoster('companies');
  const [creating, setCreating] = useState(false);
  const formId = useId();

  // Called in the body, not memoised: rosterRows is a cheap pure pass, and the board re-renders only when
  // membership or a company changes.
  const rows = rosterRows({ robots: members, companies });
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const head = HEAD_SCHEMAS[shell];

  return (
    <div className={`roster-board roster-board--${shell}`} style={BOARD_STYLE}>
      <div className="roster-board__head">
        <span className="roster-board__action" style={ALL_PROBES_ACCENT}>
          <Button schema={head.all} accessibleName={ALL_PROBES.humanLabel} onClick={pickAllProbes} />
        </span>
        <span className="roster-board__action" style={COMPANY_TRAIT_ACCENT}>
          <Button
            schema={head.create}
            accessibleName={NEW_COMPANY.humanLabel}
            expanded={creating}
            controls={formId}
            onClick={() => setCreating((open) => !open)}
          />
        </span>
      </div>
      {/* The staged form mounts only while open, so each opening starts from a fresh suggestion. */}
      <div id={formId} className="roster-board__create" style={COMPANY_TRAIT_ACCENT} hidden={!creating}>
        {creating && <CompanyCreateForm />}
      </div>
      <IntroPanel {...INTRO} name={INTRO_NAME} trait="output" collapsible />
      <div className="roster-board__rows">
        {rows.map((row) => (
          <RosterRowView key={row.companyId ?? 'freelance'} row={row} company={row.companyId ? companyById.get(row.companyId) : undefined} />
        ))}
      </div>
    </div>
  );
}

export default RosterBoard;
