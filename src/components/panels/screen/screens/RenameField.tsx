import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { TextInput } from '@/components/ui/controls/TextInput';
import { labels } from '@/content';
import type { TextInputSchema } from '@/types/controls';

/** The input: the save's name, up to the same 128 characters as the New Transmission editor's style name. */
const RENAME_INPUT_SCHEMA: TextInputSchema = {
  id: 'offRenameInput',
  type: 'textInput',
  ...labels('home.off.rename'),
  maxLength: 128,
};

/**
 * The off screen's Rename input (docs/specs/OFF_SCREEN_CONSOLE.md §1.5), in RadioButton's trailing slot on the save's
 * row: prefilled, focused and selected on mount. Enter commits, Escape cancels (null), and a blur out of it commits,
 * caught on the wrapper as the New Transmission editor catches its own (TextInput takes no key or blur props, and both
 * bubble). It reports once: the input unmounting after a commit is no second one. Bare in the row: no cabinet box.
 */
export function RenameField({
  name,
  onDone,
}: {
  name: string;
  onDone: (from: string, to: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const finish = (to: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name, to);
  };
  useEffect(() => {
    const input = ref.current?.querySelector('input');
    input?.focus();
    input?.select();
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') finish(draft);
    else if (e.key === 'Escape') finish(null);
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)))
      finish(draft);
  };
  return (
    <div className="off-screen__rename" ref={ref} onKeyDown={onKeyDown} onBlur={onBlur}>
      <TextInput schema={RENAME_INPUT_SCHEMA} value={draft} onChange={setDraft} facade={false} />
    </div>
  );
}
