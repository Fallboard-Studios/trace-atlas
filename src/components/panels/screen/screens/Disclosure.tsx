import { useId, useMemo, type ReactNode } from 'react';
import { Button } from '@/components/ui/controls/Button';
import type { ButtonSchema } from '@/types/controls';

interface DisclosureProps {
  /** The header's schema: its id. The face is `title`, and the header is always muted. */
  schema: ButtonSchema;
  /** The header's one line, its face and its accessible name. */
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * One of the off screen's two collapsible sections (docs/specs/OFF_SCREEN_CONSOLE.md §1.4): a muted, single-face header
 * Button carrying aria-expanded and aria-controls over a body that is in the DOM only while open, the lazy mount
 * SectionTabs uses. An expander, not an accordion (IntroPanel is the precedent): no Radix Collapsible, and the open
 * state is the caller's component state, never persisted (spec assumption 6). The root carries the schema id as a
 * modifier, so the screen can find a section's header.
 */
export function Disclosure({ schema, title, open, onToggle, children }: DisclosureProps) {
  const bodyId = useId();
  // The face is the title: a single face reads the schema's human label.
  const header = useMemo<ButtonSchema>(() => ({ ...schema, humanLabel: title, appearance: 'muted' }), [schema, title]);
  return (
    <div className={`disclosure disclosure--${schema.id}`}>
      <Button schema={header} face="single" onClick={onToggle} expanded={open} controls={bodyId} accessibleName={title} />
      {open && (
        <div id={bodyId} className="disclosure__body">
          {children}
        </div>
      )}
    </div>
  );
}
