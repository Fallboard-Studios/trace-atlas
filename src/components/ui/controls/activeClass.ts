/**
 * Shared implementation behind the `isActive` CSS hook documented in
 * docs/COMPONENT_LIBRARY.md — appends a plain `isActive` class when a
 * component's represented state is "on", so a consumer can write
 * `.sc-toggle.isActive { ... }` instead of a `:has()` attribute selector.
 * Used by every primitive with on/off state (Toggle, StepperWithToggle,
 * Lfo, AccordionContainer).
 */
export function withActiveClass(base: string, active: boolean): string {
  return active ? `${base} isActive` : base;
}

/**
 * Audio Load Budget: appends `sc-held-off` (HeldOffNote.css) when a control wrapper is currently
 * greyed out by the dial — the flat white/black look, in place of whatever trait/robot accent
 * color it would otherwise inherit. `Lfo.tsx` handles its own case directly (it also has to
 * suppress `isActive` at the same time); this helper is for the plain per-row wrappers around a
 * standalone slider (the drift-slider rows in AudioRigDrawer.tsx and SignatureArrayDrawer.tsx).
 */
export function withHeldOffClass(base: string, heldOff: boolean): string {
  return heldOff ? `${base} sc-held-off` : base;
}
