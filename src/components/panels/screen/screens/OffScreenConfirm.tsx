import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { getScreenViewportDomNode } from '@/utils/helpers';
import { labels } from '@/content';

const CANCEL = labels('ui.cancel').humanLabel;

interface OffScreenConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  /** The confirming button's words: the action it confirms. */
  action: string;
  onAction: () => void;
  /** Where the focus goes on close: a modal Radix dialog gives it back only to its own Trigger, and neither opener is
   *  one. */
  onCloseAutoFocus: (event: Event) => void;
}

/**
 * A modal confirm on the off screen (docs/specs/OFF_SCREEN_CONSOLE.md §1.4, §1.5): Factory Reset's and Delete's, in the
 * clear-storage confirm's look. Portalled into the screen, never <body> (the UI Shell guardrail), or in place when there
 * is no screen (a component test).
 */
export function OffScreenConfirm({
  open,
  onOpenChange,
  title,
  body,
  action,
  onAction,
  onCloseAutoFocus,
}: OffScreenConfirmProps) {
  const screenNode = open ? getScreenViewportDomNode() : null;
  const content = (
    <>
      <AlertDialog.Overlay className="clear-storage-confirm__overlay" />
      <AlertDialog.Content
        className="clear-storage-confirm__content"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <AlertDialog.Title className="clear-storage-confirm__title">{title}</AlertDialog.Title>
        <AlertDialog.Description className="clear-storage-confirm__description">
          {body}
        </AlertDialog.Description>
        <div className="clear-storage-confirm__actions">
          <AlertDialog.Cancel className="clear-storage-confirm__cancel">
            {CANCEL}
          </AlertDialog.Cancel>
          <AlertDialog.Action className="clear-storage-confirm__confirm" onClick={onAction}>
            {action}
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </>
  );
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {screenNode ? (
        <AlertDialog.Portal container={screenNode}>{content}</AlertDialog.Portal>
      ) : (
        content
      )}
    </AlertDialog.Root>
  );
}
