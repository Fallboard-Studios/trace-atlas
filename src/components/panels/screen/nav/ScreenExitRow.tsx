import { back, goHome } from './navActions';
import { Button } from '@/components/ui/controls/Button';
import type { ButtonSchema } from '@/types/controls';
import { labels } from '@/content';
import './ScreenExitRow.css';

const BACK_SCHEMA: ButtonSchema = { id: 'navBack', type: 'button', ...labels('nav.back') };
const CLOSE_SCHEMA: ButtonSchema = { id: 'navClose', type: 'button', ...labels('nav.close') };

/**
 * The way out of every open screen (docs/specs/NAVIGATION_CLOSE_AND_BACK.md §1.5; Task 7): Back at the left runs
 * navActions.back() (the screen before, on the tabs it showed), Close at the right runs goHome() (the deck, as a
 * step, so a Back after it returns here). Stateless: the trail and every rule about it are navActions'. The faces are
 * the plain words, single-line, with no lore (Gate 2). Both handlers are module functions, so Button's memo holds.
 */
export function ScreenExitRow() {
  return (
    <div className="screen-exit-row">
      <Button schema={BACK_SCHEMA} face="single" onClick={back} />
      <Button schema={CLOSE_SCHEMA} face="single" onClick={goHome} />
    </div>
  );
}

export default ScreenExitRow;
