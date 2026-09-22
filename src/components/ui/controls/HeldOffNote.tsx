import './HeldOffNote.css';

/**
 * The short label shown next to an LFO (or drift) control the Audio Load dial is holding off
 * (docs/specs/AUDIO_LOAD_BUDGET.md §1.4, decision L). The controls themselves are disabled and keep their stored values —
 * this only says why, and that raising the dial brings them back.
 */
export function HeldOffNote() {
  return (
    <p className="held-off-note" role="note">
      Held off by Audio Load
    </p>
  );
}
