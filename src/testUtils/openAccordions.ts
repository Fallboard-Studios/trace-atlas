import { act, fireEvent } from '@testing-library/react';

const COLLAPSED_TRIGGER = '.sc-accordion__trigger[aria-expanded="false"]';

/** Enough for any realistic nesting depth; only ever reached if a trigger refuses to open. */
const MAX_PASSES = 10;

/**
 * Test-only helper (docs/specs/ACCORDION_LAZY_MOUNT.md §4.3) — expands every collapsed AccordionContainer under `root`
 * by clicking its trigger, so a test can assert against controls that an accordion no longer renders while it has never
 * been opened. Already-open sections are left alone, and only real accordion triggers are clicked (never an unrelated
 * `aria-expanded` button).
 *
 * Runs in passes because a section nested inside another's content only exists once its parent has opened: each pass
 * opens whatever is collapsed right now, inside one `act` so React commits the newly-mounted content before the next
 * pass looks again. Throws if sections are still collapsed after MAX_PASSES, rather than letting a test silently
 * assert against content that never mounted.
 */
export function openAllAccordions(root: ParentNode = document.body): void {
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const collapsed = Array.from(root.querySelectorAll<HTMLElement>(COLLAPSED_TRIGGER));
    if (collapsed.length === 0) return;
    act(() => {
      collapsed.forEach((trigger) => fireEvent.click(trigger));
    });
  }
  if (root.querySelector(COLLAPSED_TRIGGER)) {
    throw new Error(`openAllAccordions: sections still collapsed after ${MAX_PASSES} passes.`);
  }
}
