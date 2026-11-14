import { PowerRockerSwitch } from '@/components/ui/physical/PowerRockerSwitch';
import { CONTENT } from '@/content';

import './SleeveContainer.css';

function SleeveContainer() {

  return (
    <aside className={'sleeve-container sleeve-container--cutaway'} aria-label={CONTENT['ui.sleeve'].human}>

      <div className="sleeve-container__power-corner">
        <PowerRockerSwitch />
      </div>

    </aside>
  );
}

export default SleeveContainer;
