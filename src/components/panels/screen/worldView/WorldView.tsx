import AttenuationStyleView from '@/components/panels/screen/worldView/AttenuationStyleView';
import { useAttenuationStyleStore } from '@/stores/attenuationStyleStore';
import { useUIStore } from '@/stores/uiStore';

import './WorldView.css'

function WorldView() {
  // Reactive, not hardcoded — Sector Settings' retransmit action can create
  // a brand-new Attenuation Style and discard the old one (including the
  // original 'pelagos' default), so this must follow whichever Attenuation
  // Style is actually current or AttenuationStyleView's lookup fails and the
  // whole world disappears.
  const currentAttenuationStyleId = useAttenuationStyleStore((s) => s.currentAttenuationStyleId);
  // The world dims under the opaque content surface (docs/specs/LAYOUT_REWORK.md §1.3), which
  // ContentPane renders exactly while a branch is open; the Deck has none and stays bright.
  const dimmed = useUIStore((s) => s.activeHubTile !== null);

  return (
    <div className="world-view" data-dimmed={dimmed ? '' : undefined}>
      <AttenuationStyleView attenuationStyleId={currentAttenuationStyleId} />
    </div>
  );
}

export default WorldView;
