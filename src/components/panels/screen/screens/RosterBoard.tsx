import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import gsap from 'gsap';
// gsap/dist/Flip, not gsap/Flip: gsap's exports map types 'gsap/Flip' as types/Flip.d.ts while its index.d.ts
// references types/flip.d.ts, and on a case-insensitive disk tsc rejects the pair (TS1149). The dist path
// types through gsap's own ambient declare module "gsap/dist/Flip" and is Flip alone.
import { Flip } from 'gsap/dist/Flip';
import { selectEntity } from '../nav/navActions';
import { useEntityRoster, type RosterEntry } from '../nav/useEntityRoster';
import { useShell } from '../useShell';
import { probeCountText } from '../probeCountText';
import { RosterTile, type RosterMoveHandler } from './RosterTile';
import { CompanyCreateForm } from '@/components/company/CompanyCrudControls';
import { Button } from '@/components/ui/controls/Button';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { killTimeline, setTimeline, timelineMap } from '@/animation/timelineMap';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { prefersReducedMotion } from '@/utils/reducedMotion';
import { rosterRows, type RosterRow } from '@/utils/rosterRows';
import { getRobotColorStyle, getTraitColorStyle } from '@/utils/traitColors';
import { CONTENT, introProps, labels } from '@/content';
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

gsap.registerPlugin(Flip);

/** The glide (spec Assumption 8): long enough to follow a tile to its new row, short enough not to wait on. */
export const ROSTER_GLIDE_DURATION = 0.45;
const TILE_SELECTOR = '.roster-tile';

interface PendingMove {
  robotId: string;
  /** The tiles' rects before the store write; null under reduced motion (no glide, focus only). */
  state: Flip.FlipState | null;
}

/**
 * A Move pick (docs/specs/LAYOUT_REWORK.md §1.5, Assumption 8): record every tile's rect, write the store
 * through `assignRobotToCompany` (the one transition the app has), and once React has re-rendered the
 * rows, `Flip.from` the recorded state — the moved tile remounts in its new row, and Flip matches it by
 * its `data-flip-id`. The timeline lives in timelineMap as `roster-move-<id>`, one glide at a time (a
 * second pick finishes the first), and dies with the board. Reduced motion skips it.
 *
 * Focus follows the moved tile to its face in the new row: the panel hands focus back to its opener,
 * and the opener unmounted with the tile's old row. The face, not the new chip — a freshly mounted desk
 * tile swaps its chip element once just after mount (Radix's Popover.Trigger wraps itself in a Popper
 * anchor until Popover.Anchor registers), which would take the focus with it.
 */
function useRosterGlide(members: readonly MemberEntry[]) {
  const boardRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingMove | null>(null);
  const activeKeyRef = useRef<string | null>(null);

  const finishGlide = useCallback(() => {
    const key = activeKeyRef.current;
    if (key === null) return;
    // To the end first, so its tiles drop their in-flight transforms before the next is measured from.
    timelineMap.get(key)?.progress(1);
    killTimeline(key);
    activeKeyRef.current = null;
  }, []);

  const onMove = useCallback<RosterMoveHandler>((robotId, companyId) => {
    const board = boardRef.current;
    let state: Flip.FlipState | null = null;
    if (board && !prefersReducedMotion()) {
      state = Flip.getState(board.querySelectorAll(TILE_SELECTOR));
      finishGlide();
    }
    pendingRef.current = { robotId, state };
    useLocaleStore.getState().assignRobotToCompany(getActiveLocaleId(), robotId, companyId);
  }, [finishGlide]);

  // On the row order: runs after the commit that put the moved tile in its new row, before paint.
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    const board = boardRef.current;
    pendingRef.current = null;
    if (!pending || !board) return;
    board.querySelector<HTMLElement>(`${TILE_SELECTOR}[data-flip-id="${pending.robotId}"] .roster-tile__face`)?.focus();
    if (!pending.state) return;
    const key = `roster-move-${pending.robotId}`;
    const timeline = Flip.from(pending.state, {
      targets: board.querySelectorAll(TILE_SELECTOR),
      duration: ROSTER_GLIDE_DURATION,
      ease: 'power2.inOut',
      onComplete: () => {
        if (activeKeyRef.current === key) activeKeyRef.current = null;
        if (timelineMap.get(key) === timeline) timelineMap.delete(key);
      },
    });
    setTimeline(key, timeline);
    activeKeyRef.current = key;
  }, [members]);

  useEffect(() => finishGlide, [finishGlide]);

  return { boardRef, onMove };
}

interface RosterRowViewProps {
  row: RosterRow;
  /** The row's company, or undefined for Freelance. */
  company?: RosterEntry;
  onMove: RosterMoveHandler;
}

/** One group: the leading cell (the company's name box, which opens it, or the Freelance label) and its
 *  count, then the member tiles flowing right. Not memo'd: rosterRows builds fresh rows on every board
 *  render, and the board renders only when membership or a company changes; the tiles are memo'd. */
function RosterRowView({ row, company, onMove }: RosterRowViewProps) {
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
        <span className="roster-board__count">{probeCountText(row.robotIds.length)}</span>
      </div>
      <ul className="roster-board__tiles">
        {row.robotIds.map((id) => <RosterTile key={id} robotId={id} onMove={onMove} />)}
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
  const { boardRef, onMove } = useRosterGlide(members);
  const companies = useEntityRoster('companies');
  const [creating, setCreating] = useState(false);
  const formId = useId();

  // Called in the body, not memoised: rosterRows is a cheap pure pass, and the board re-renders only when
  // membership or a company changes.
  const rows = rosterRows({ robots: members, companies });
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const head = HEAD_SCHEMAS[shell];

  return (
    <div ref={boardRef} className={`roster-board roster-board--${shell}`} style={BOARD_STYLE}>
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
          <RosterRowView key={row.companyId ?? 'freelance'} row={row} company={row.companyId ? companyById.get(row.companyId) : undefined} onMove={onMove} />
        ))}
      </div>
    </div>
  );
}

export default RosterBoard;
