import { useId, useState } from 'react';

import { NavBox } from './NavBox';
import { selectEntity, type ExpandingBranch } from './navActions';
import { useEntityRoster, type RosterEntry } from './useEntityRoster';
import { CompanyCreateForm } from '@/components/company/CompanyCrudControls';
import { useUIStore } from '@/stores/uiStore';
import { getRobotColorStyle, getTraitColorStyle } from '@/utils/traitColors';
import { labels } from '@/content';
import './NavEntityList.css';

const ALL_PROBES = labels('probe.all');
const NEW_COMPANY = labels('nav.entity.newCompany');
/** The sketch draws All Probes in the Deck's colour (the whole fleet) and + New Company in the branch's. */
const ALL_PROBES_ACCENT = getTraitColorStyle('header');
const NEW_COMPANY_ACCENT = getTraitColorStyle('company');

/** A name falls back to the id, as the breadcrumb's does. */
const nameOf = (entry: RosterEntry) => entry.name ?? entry.id;

function ProbeEntities() {
  const robots = useEntityRoster('robots');
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const allProbesSelected = useUIStore((s) => s.allProbesSelected);

  return (
    <ul className="nav-entity-list">
      <li>
        <NavBox
          id="all-probes"
          loreLabel={ALL_PROBES.loreLabel}
          humanLabel={ALL_PROBES.humanLabel}
          // A specific robot wins over All Probes, as ProbesContent routes.
          current={allProbesSelected && selectedRobotId === null}
          accentStyle={ALL_PROBES_ACCENT}
          onClick={() => selectEntity('all')}
        />
      </li>
      {robots.map((robot) => (
        <li key={robot.id}>
          <NavBox
            id={`robot-${robot.id}`}
            humanLabel={nameOf(robot)}
            current={robot.id === selectedRobotId}
            accentStyle={getRobotColorStyle(robot.color)}
            onClick={() => selectEntity({ robotId: robot.id })}
          />
        </li>
      ))}
    </ul>
  );
}

function CompanyEntities() {
  const companies = useEntityRoster('companies');
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const [creating, setCreating] = useState(false);
  const formId = useId();

  return (
    <>
      <ul className="nav-entity-list">
        <li>
          <NavBox
            id="new-company"
            loreLabel={NEW_COMPANY.loreLabel}
            humanLabel={NEW_COMPANY.humanLabel}
            expanded={creating}
            controls={formId}
            accentStyle={NEW_COMPANY_ACCENT}
            onClick={() => setCreating((open) => !open)}
          />
        </li>
        {companies.map((company) => (
          <li key={company.id}>
            <NavBox
              id={`company-${company.id}`}
              humanLabel={nameOf(company)}
              current={company.id === selectedCompanyId}
              accentStyle={getRobotColorStyle(company.color)}
              onClick={() => selectEntity({ companyId: company.id })}
            />
          </li>
        ))}
      </ul>
      {/* The staged form mounts only while open, so each opening starts from a fresh suggestion. */}
      <div id={formId} className="nav-entity-list__create" hidden={!creating}>
        {creating && <CompanyCreateForm />}
      </div>
    </>
  );
}

interface NavEntityListProps {
  branch: ExpandingBranch;
}

/**
 * The entities under the open Probes or Companies box (docs/specs/LAYOUT_REWORK.md §1.2): All Probes
 * then the robots in their identity colours, or + New Company then the companies in theirs. A pick
 * goes through navActions.selectEntity; + New Company is a disclosure for the existing staged
 * CompanyCreateForm, inline under the list.
 */
export function NavEntityList({ branch }: NavEntityListProps) {
  return branch === 'probes' ? <ProbeEntities /> : <CompanyEntities />;
}

export default NavEntityList;
