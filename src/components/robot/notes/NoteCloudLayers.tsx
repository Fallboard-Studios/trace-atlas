// ========================================
// IMPORTS
// ========================================
import { isNoteCloudEnabled } from '../../../utils/debugParams';
import { prefersReducedMotion } from '../../../utils/reducedMotion';
import './NoteCloud.css';

// ========================================
// TYPES
// ========================================
interface NoteCloudLayerProps {
  /** `behind` is rendered before the robot's `<svg>`, `front` after it (z-index −1 and 1). */
  side: 'behind' | 'front';
}

// ========================================
// COMPONENT
// ========================================
/**
 * One of the note cloud's two layers (docs/specs/ROBOT_NOTE_CLOUD.md §1.5): a wrapper (the roll's
 * box, masked, `pointer-events: none`, `aria-hidden`) holding an empty belt. The box that holds a
 * pair of these carries `data-note-cloud`; `useNoteCloud` finds the pair from inside the robot's svg
 * with `closest('[data-note-cloud]')`, sizes the wrappers and appends the notes to the belts. React
 * renders no children in a belt and never reconciles what the hook appends there.
 *
 * Renders nothing under `?notes=off` or a reduced-motion preference: the cloud is decorative motion.
 */
export function NoteCloudLayer({ side }: NoteCloudLayerProps) {
  if (!isNoteCloudEnabled() || prefersReducedMotion()) return null;
  return (
    <div className={`note-layer note-layer--${side}`} aria-hidden="true">
      <div className="note-layer__belt" />
    </div>
  );
}
