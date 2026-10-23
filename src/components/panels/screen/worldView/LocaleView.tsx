import { OceanScene } from './OceanScene';
import { useLocaleStore } from '@/stores/localeStore';

import './LocaleView.css';

interface LocaleViewProps {
  localeId: string;
  /** Was currentHour — computeLocalTime's longitude-offset step is retired,
   *  this IS the final, already-resolved local time (see AttenuationStyleView.tsx and
   *  docs/specs/archive/ATTENUATION_STYLE.md §1.1). */
  localTime: number;
}

function LocaleView({ localeId, localTime }: LocaleViewProps) {
  // A boolean, not the whole locale object (bugfix, found live — same class as Header.tsx's own
  // fix): this component never reads anything off the locale beyond "does it still exist" —
  // OceanScene re-derives its own localeId/robots/actors independently rather than receiving them
  // from here. Selecting the whole object meant a fresh reference — and a re-render here — on
  // every unrelated robot/actor/measure write anywhere in the locale.
  const localeExists = useLocaleStore((s) => localeId in s.locales);

  if (!localeExists) return null;

  return (
    <div className="locale-view">
      <OceanScene localTime={localTime} />
    </div>
  );
}

export default LocaleView;
