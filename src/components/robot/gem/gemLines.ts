// ========================================
// GEM LINES (backlog 85)
// ========================================
// Every boundary line on a robot is one fixed width, drawn the same on every robot, at every setting and
// on every edit. Nothing here reads a robot: the widths once followed the gain-LFO depth (body) and Note
// Variance (orbiters) and flickered on an edit, and the change in size did not look good. Each is the top of
// the range it had. The lit strip down a line is a third of its width (`RobotGem`).

/** Top and Mid boundary-line width, in gem units. Was 0.3 to 0.7; 0.7 is where a stroke still clears the bevel at
 *  the generator's 0.35 line clearance (half of 0.7), so the generator is not touched. */
export const BODY_LINE_WIDTH = 0.7;

/** Strip opacity on the Top and Mid lines. */
export const BODY_STRIP_OPACITY = 0.6;

/** An orbiter's boundary-line width, in gem units. Was 0.3 to 1.1. */
export const ORBITER_LINE_WIDTH = 1.1;

/** Strip opacity on an orbiter's lines. Was 0.35 to 1; the strip is never battery-dimmed. */
export const ORBITER_STRIP_OPACITY = 1;
