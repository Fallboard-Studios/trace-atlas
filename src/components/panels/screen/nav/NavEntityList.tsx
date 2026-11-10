import { NavBox } from './NavBox';
import { selectEntity } from './navActions';
import { useEntityRoster, type RosterEntry } from './useEntityRoster';
import { useUIStore } from '@/stores/uiStore';
import { getRobotColorStyle, getTraitColorStyle } from '@/utils/traitColors';
import { labels } from '@/content';
import './NavEntityList.css';

const ALL_PROBES = labels('probe.all');
/** The sketch draws All Probes in the Deck's colour (the whole fleet). */
const ALL_PROBES_ACCENT = getTraitColorStyle('header');

/** A name falls back to the id, as the breadcrumb's does. */
const nameOf = (entry: RosterEntry) => entry.name ?? entry.id;

/**
 * The entities under the open Probes box (docs/specs/LAYOUT_REWORK.md §1.2): All Probes then the robots
 * in their identity colours. A pick goes through navActions.selectEntity. The Companies box and its list
 * left the nav in docs/tasks/OFF_SCREEN_CONSOLE.md Task 18: a company opens from the roster board.
 */
export function NavEntityList() {
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

export default NavEntityList;
