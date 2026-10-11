import { memo, useCallback, useId, useMemo, type CSSProperties } from 'react';
import { selectEntity } from '../nav/navActions';
import { useShell } from '../useShell';
import { RobotSectionTabs } from './RobotScreen';
import { RobotBody } from '@/components/robot/RobotBody';
import { getRobotGem, gemViewBox } from '@/components/robot/gem/polygon';
import { CompanyRenameDeleteForm } from '@/components/company/CompanyCrudControls';
import { companyTraitStyle, useCompanySubsectionRenderer } from '@/components/company/CompanyOptionsSection';
import { ALL_TARGET, useCompanyOptions } from '@/components/company/useCompanyOptions';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { type RobotOptionsTrait } from '@/data/robotSubsectionConfig';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getRobotColorStyle, getTraitColorStyle } from '@/utils/traitColors';
import { CONTENT, fill, introProps, labels, optionsRecord } from '@/content';
import type { Robot } from '@/types/Robot';
// The column, the band, the wells and the controls column are the robot screen's, unchanged (spec §1.6:
// "the robot screen with the column swapped"); this file adds only what a company needs.
import './RobotScreen.css';
import './CompanyScreen.css';

/** The All form wears the Deck's colour: it is the whole fleet, which no company colour stands for. */
const ALL_STYLE = getTraitColorStyle('header');

const ALL_NAME = CONTENT['probe.all'].human;
const SHARE_LABELS = labels('company.detail.share');
const SIGNAL_LABELS = labels('company.detail.signal');
const SIGNAL_VALUES = optionsRecord('company.detail.signal');
const COMPANY_EYEBROW = CONTENT['company.assign'].lore;
const ALL_EYEBROW = CONTENT['company.detail.allForm'].human;

const countText = (n: number) => (n === 1 ? CONTENT['probe.roster.count.one'].human : fill('probe.roster.count', { n: String(n) }));

/** The broadcast, stated once. One member and none read differently from the plural. */
function broadcastNote(n: number): string {
  if (n === 0) return CONTENT['company.detail.broadcastNote.none'].human;
  if (n === 1) return CONTENT['company.detail.broadcastNote.one'].human;
  return fill('company.detail.broadcastNote', { n: String(n) });
}

/**
 * The company screen (docs/specs/LAYOUT_REWORK.md §1.6; docs/tasks/LAYOUT_REWORK.md Task 23): the robot
 * screen with its avatar column swapped for a company column — the name as a popped box in the company's
 * colour, the share and signal wells, the members as gem tiles that open that robot, the broadcast note
 * and Rename / Delete. The controls are the robot screen's SectionTabs over the same four sections, their
 * values and handlers from `useCompanyOptions`: an edit reaches every member once (COMPANIES.md —
 * broadcast, not link). On the phone the column becomes the robot screen's small band, then the members
 * and Rename / Delete, then the tabs.
 *
 * Which entity it is for comes from the selection: the selected company, else the whole fleet (the All
 * form, true after "All Probes" and after a delete, which selects it). The All form has twelve tiles, the
 * Deck's colour, no halo and no Rename / Delete. A selected id that names no company renders nothing.
 */
export function CompanyScreen() {
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  return <CompanyScreenPanel target={selectedCompanyId ?? ALL_TARGET} />;
}

function CompanyScreenPanel({ target }: { target: string }) {
  const shell = useShell();
  const localeId = getActiveLocaleId();
  const all = target === ALL_TARGET;
  const { company, members, options } = useCompanyOptions(target);
  const renderSubsection = useCompanySubsectionRenderer(options);
  const total = useLocaleStore((s) => s.locales[localeId]?.robots?.length ?? 0);
  const active = options.active;
  const traitStyle = useCallback((trait: RobotOptionsTrait): CSSProperties => companyTraitStyle(trait, active), [active]);
  const color = company?.color;
  const style = useMemo<CSSProperties | undefined>(() => (all || !color ? ALL_STYLE : getRobotColorStyle(color)), [all, color]);

  if (!all && !company) return null;
  const name = all ? ALL_NAME : company!.name;
  const intro = all ? 'probe.all' : 'company.profile';

  return (
    <div className={`company-screen company-screen--${shell} robot-screen robot-screen--${shell}`} style={style}>
      {shell === 'desk' ? (
        <CompanyColumn all={all} name={name} members={members} total={total} />
      ) : (
        <CompanyBand all={all} name={name} members={members} />
      )}
      <div className="robot-screen__controls">
        <IntroPanel {...introProps(intro)} name={CONTENT[intro].human} trait={all ? 'header' : 'company'} collapsible />
        <RobotSectionTabs label={name} renderSubsection={renderSubsection} traitStyle={traitStyle} />
      </div>
    </div>
  );
}

interface IdentityProps {
  all: boolean;
  name: string;
  members: readonly Robot[];
}

/** Desk: the name box, the two wells, the member tiles, the broadcast note and Rename / Delete. */
function CompanyColumn({ all, name, members, total }: IdentityProps & { total: number }) {
  const timelineKey = `cabinet-company-name-${useId()}`;
  return (
    <div className="robot-screen__avatar-column company-screen__column">
      <div className="company-screen__title">
        {/* Static: the popped facade panels keep (spec §3); nothing here is pressed. */}
        <CabinetBox popped skipMountAnimation autoHeight timelineKey={timelineKey}>
          <span className="company-screen__eyebrow">{all ? ALL_EYEBROW : COMPANY_EYEBROW}</span>
          <h2 className="company-screen__name">{name}</h2>
        </CabinetBox>
      </div>
      <div className="robot-screen__meta">
        <div className="robot-screen__well">
          <DualLabel {...SHARE_LABELS} />
          <span className="robot-screen__meta-value">{fill('company.detail.share', { n: String(members.length), total: String(total) })}</span>
        </div>
        <div className="robot-screen__well">
          <DualLabel {...SIGNAL_LABELS} />
          <span className="robot-screen__meta-value">{SIGNAL_VALUES[all ? 'all' : 'company'].humanLabel}</span>
        </div>
      </div>
      <MemberTiles members={members} />
      <div className="robot-screen__well company-screen__note">{broadcastNote(members.length)}</div>
      {!all && <CompanyRenameDeleteForm showSummary={false} />}
    </div>
  );
}

/** Phone: the small band — a flat swatch of the screen's colour, the name and the count — then the member
 *  tiles and Rename / Delete. The sketch's tail "edits reach every member" is not here: the task names
 *  the name and the count. */
function CompanyBand({ all, name, members }: IdentityProps) {
  return (
    <>
      <div className="robot-screen__band">
        <span className="company-screen__swatch" aria-hidden="true" />
        <div className="robot-screen__band-text">
          <h2 className="robot-screen__name">{name}</h2>
          <span className="robot-screen__status-line">{countText(members.length)}</span>
        </div>
      </div>
      <div className="company-screen__phone-members">
        <MemberTiles members={members} />
        {!all && <CompanyRenameDeleteForm showSummary={false} />}
      </div>
    </>
  );
}

function MemberTiles({ members }: { members: readonly Robot[] }) {
  return (
    <ul className="company-screen__members">
      {members.map((robot) => (
        <li key={robot.id}>
          <MemberTile robot={robot} />
        </li>
      ))}
    </ul>
  );
}

const openRobot = (robotId: string) => selectEntity({ robotId });

/** One member: its gem in the card render context and its name, on a button that opens the robot. */
const MemberTile = memo(function MemberTile({ robot }: { robot: Robot }) {
  const label = robot.name || robot.id;
  const style = useMemo(() => getRobotColorStyle(robot.identityColor), [robot.identityColor]);
  return (
    <button type="button" className="company-screen__member" style={style} aria-label={label} onClick={() => openRobot(robot.id)}>
      <svg className="company-screen__member-gem" viewBox={gemViewBox(getRobotGem(robot.gemSeed))} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <RobotBody robot={robot} ignoreDaylight ignoreScale />
      </svg>
      <span className="company-screen__member-name">{label}</span>
    </button>
  );
});

export default CompanyScreen;
