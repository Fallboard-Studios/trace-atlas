import { memo, useMemo, type CSSProperties } from 'react';
import { useRobotMeta } from '../screens/useRobotMeta';
import { probeCountText } from '../probeCountText';
import type { SelectionLineRef } from './useSelectionLines';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getRobotColorStyle } from '@/utils/traitColors';
import { CONTENT, fill } from '@/content';
import type { Robot } from '@/types/Robot';
import './SelectionLines.css';

const NO_ROBOTS: readonly Robot[] = [];

interface ShellProps {
  accent: CSSProperties;
  caption: string;
  body: string;
}

function SelectionLineShell({ accent, caption, body }: ShellProps) {
  return (
    <span className="selection-line" style={accent}>
      <span className="selection-line__caption">{caption}</span>
      <span className="selection-line__body">{body}</span>
    </span>
  );
}

const ROBOT_CAPTION = CONTENT['nav.status.selectedRobot'].human;
const COMPANY_CAPTION = CONTENT['nav.status.selectedCompany'].human;

function RobotLineBody({ robot, localeId }: { robot: Robot; localeId: string }) {
  const meta = useRobotMeta(robot, localeId);
  const accent = useMemo(() => getRobotColorStyle(robot.identityColor), [robot.identityColor]);
  const body = fill('nav.status.selectedRobot', { name: robot.name || robot.id, job: meta.job, state: meta.dockingState });
  return <SelectionLineShell accent={accent} caption={ROBOT_CAPTION} body={body} />;
}

function RobotSelectionLine({ robotId }: { robotId: string }) {
  const localeId = getActiveLocaleId();
  const robot = useLocaleStore((s) => s.locales[localeId]?.robots?.find((r) => r.id === robotId));
  return robot ? <RobotLineBody robot={robot} localeId={localeId} /> : null;
}

function CompanySelectionLine({ companyId }: { companyId: string }) {
  const localeId = getActiveLocaleId();
  const company = useLocaleStore((s) => s.locales[localeId]?.companies?.find((c) => c.id === companyId));
  const count = useLocaleStore((s) => (s.locales[localeId]?.robots ?? NO_ROBOTS).filter((r) => r.companyId === companyId).length);
  const accent = useMemo(() => getRobotColorStyle(company?.color ?? ''), [company?.color]);
  if (!company) return null;
  return <SelectionLineShell accent={accent} caption={COMPANY_CAPTION} body={fill('nav.status.selectedCompany', { name: company.name, count: probeCountText(count) })} />;
}

/** One selection line: the robot's (name · job · state) or the company's (name · count), in its own colour. */
export const SelectionLine = memo(function SelectionLine({ kind, id }: SelectionLineRef) {
  return kind === 'robot' ? <RobotSelectionLine robotId={id} /> : <CompanySelectionLine companyId={id} />;
});
