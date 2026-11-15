// ========================================
// GEM LINES (backlog 85)
// ========================================
// Every boundary line on a robot is one fixed width, drawn the same on every robot, at every setting and
// on every edit. Nothing here reads a robot: the widths once followed the gain-LFO depth (body) and Note
// Variance (orbiters) and flickered on an edit, and the change in size did not look good. Each is the top of
// the range it had. The lit strip down a line is half its width (`STRIP_WIDTH_FRACTION`).

/** Top and Mid boundary-line width, in gem units. Was 0.3 to 0.7; 0.7 is where a stroke still clears the bevel at
 *  the generator's 0.35 line clearance (half of 0.7), so the generator is not touched. */
export const BODY_LINE_WIDTH = .8;

/** Strip opacity on the Top and Mid lines. */
export const BODY_STRIP_OPACITY = .6;

/** An orbiter's boundary-line width, in gem units. Was 0.3 to 1.1. */
export const ORBITER_LINE_WIDTH = 1;

/** Strip opacity on an orbiter's lines. Was 0.35 to 1; the strip is never battery-dimmed. */
export const ORBITER_STRIP_OPACITY = .8;

/** The lit strip down a line, as a fraction of the line's width. Was a third. */
export const STRIP_WIDTH_FRACTION = .5;
