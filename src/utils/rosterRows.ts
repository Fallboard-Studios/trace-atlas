/**
 * The roster board's rows (docs/specs/LAYOUT_REWORK.md §1.5, docs/tasks/LAYOUT_REWORK.md Task 20): one
 * per company in the locale's own `companies` order, then Freelance last. `companyId: null` is the
 * Freelance row.
 *
 * - An empty company keeps its row (zero tiles), and so does an empty Freelance row: both are Move
 *   targets, and a row that came and went with its last member would make the board jump.
 * - Membership reads `Robot.companyId` (as `getCompanyMembers` does), members in the locale's robot
 *   order. A `companyId` naming no company files the robot under Freelance, so every robot sits in
 *   exactly one row.
 *
 * Structural over the narrow `{ id, companyId }` / `{ id }` shapes so the board can call it on a
 * narrow roster slice rather than full `Robot` objects (backlog item 27's re-render discipline).
 */
export interface RosterRow {
  companyId: string | null;
  robotIds: string[];
}

export interface RosterSource {
  robots: readonly { id: string; companyId?: string | null }[];
  companies: readonly { id: string }[];
}

export function rosterRows({ robots, companies }: RosterSource): RosterRow[] {
  const rows: RosterRow[] = companies.map((company) => ({ companyId: company.id, robotIds: [] }));
  const byCompany = new Map(rows.map((row) => [row.companyId, row]));
  const freelance: RosterRow = { companyId: null, robotIds: [] };
  for (const robot of robots) {
    (byCompany.get(robot.companyId || null) ?? freelance).robotIds.push(robot.id);
  }
  return [...rows, freelance];
}
