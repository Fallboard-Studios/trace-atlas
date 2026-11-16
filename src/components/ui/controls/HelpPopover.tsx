import { memo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import * as Popover from '@radix-ui/react-popover';

import { CONTENT, fill } from '@/content';
import { getScreenViewportDomNode } from '@/utils/helpers';
import type { ControlHelp } from '@/types/controls';
import './HelpPopover.css';

interface HelpPopoverProps {
  help: ControlHelp;
  /** The control's names: the popover's title and lore line, and the "?"'s accessible name. */
  humanLabel?: string;
  loreLabel?: string;
}

/**
 * The "?" on a control's label (docs/specs/LAYOUT_REWORK.md §1.4), rendered by DualLabel when the
 * schema carries `help`. It opens a recessed well (in = read) with the control's name, the human
 * description, and the lore name over the lore description. The well has no cabinet walls and no glow;
 * the "?" itself is a plain outlined glyph, not cabinetry, so a label row stays a label row.
 *
 * A modal Radix Popover, because spec §3 has popovers trap focus. Escape and a press outside close it,
 * and focus goes back to the "?".
 *
 * With `help.link` (docs/specs/HELP_POPOVER_LINKS.md §1.2) the well ends in one plain button, "View {name}
 * settings": a press closes the popover, keeps focus from going back to the "?", and runs the link's `go()` once.
 *
 * It portals into ScreenViewport itself: never document.body (the UI Shell guardrail), and never left
 * in place either. In place it opened inside its panel, and every panel's popped facade is its own
 * stacking context, so the next panel down painted over it (measured in Chrome at 1280 and 375 px).
 * With no ScreenViewport on the page (a component test) it opens in place. The screen is also its
 * collision boundary: left to the window, it ran 8 px past the screen's edge into the sleeve at 375 px.
 */
function HelpPopoverInner({ help, humanLabel, loreLabel }: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const controlName = humanLabel ?? loreLabel;
  const name = controlName ? fill('ui.help', { name: controlName }) : CONTENT['ui.help'].human;
  // Resolved whether open or not, so the tree is the same shape on both sides of a close (a Portal on
  // one side and in-place content on the other would remount the focus scope as it hands focus back).
  const screen = getScreenViewportDomNode();
  const link = help.link;
  // A link press hands focus to where the jump lands, not back to the "?": Radix's focus scope would return it on
  // close (after a zero-delay timer when the "?" unmounts too), so the press marks itself for onCloseAutoFocus.
  // The close is committed first (flushSync): while the content is mounted its focus trap pulls any focus outside it
  // back in, so a jump focusing its page in the same commit would lose focus to <body> once the content left.
  const linkPressed = useRef(false);
  const followLink = () => {
    linkPressed.current = true;
    flushSync(() => setOpen(false));
    link?.go();
  };
  const onCloseAutoFocus = (event: Event) => {
    if (linkPressed.current) event.preventDefault();
    linkPressed.current = false;
  };

  const content = (
    <Popover.Content
      className="sc-help__content"
      side="bottom"
      align="start"
      sideOffset={6}
      collisionPadding={8}
      collisionBoundary={screen}
      aria-label={name}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {humanLabel && <p className="sc-help__title">{humanLabel}</p>}
      <p className="sc-help__human">{help.human}</p>
      {(loreLabel || help.lore) && (
        <div className="sc-help__lore">
          {loreLabel && <p className="sc-help__lore-name">{loreLabel}</p>}
          {help.lore && <p className="sc-help__lore-description">{help.lore}</p>}
        </div>
      )}
      {link && (
        <button type="button" className="sc-help__link" onClick={followLink}>
          {fill('ui.help.link', { name: link.name })}
        </button>
      )}
    </Popover.Content>
  );

  return (
    <Popover.Root modal open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="sc-help__trigger" aria-label={name}>
        <span className="sc-help__glyph" aria-hidden="true">?</span>
      </Popover.Trigger>
      {screen ? <Popover.Portal container={screen}>{content}</Popover.Portal> : content}
    </Popover.Root>
  );
}

// React.memo (docs/COMPONENT_LIBRARY.md's memo boundary) — `help` is the content entry's own object,
// stable for the app's life, and the labels are strings.
export const HelpPopover = memo(HelpPopoverInner);
