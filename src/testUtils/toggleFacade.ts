/**
 * Test-only helpers for reading a ToggleFacade (src/components/ui/controls/ToggleFacade.tsx).
 *
 * A facade renders EVERY state's content in the DOM (all but the current one visibility: hidden, as
 * sizers) so the box holds the size of its largest content. So `switch.textContent` is the text of all
 * states joined — a test that means "what the toggle currently shows" reads the current state instead.
 */

/** The facade's current state element (the visible one), or null if there is no facade under `root`. */
export function facadeCurrent(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('.sc-toggle-facade__state[data-current]');
}

/** Every state element, current or not, in DOM order (off, then on). */
export function facadeStates(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.sc-toggle-facade__state')];
}

/** The current state's text when it is plain text (the nav glyphs). */
export function facadeCurrentText(root: HTMLElement): string | null {
  return facadeCurrent(root)?.textContent ?? null;
}

/** The current state's DualLabel pair — what the Tempo Sync toggle shows ("Float" over "Free"). */
export function facadeCurrentLabels(root: HTMLElement): { lore: string | null; human: string | null } {
  const current = facadeCurrent(root);
  return {
    lore: current?.querySelector('.sc-dual-label__lore')?.textContent ?? null,
    human: current?.querySelector('.sc-dual-label__human')?.textContent ?? null,
  };
}
