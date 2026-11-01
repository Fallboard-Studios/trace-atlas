import { useCallback, useRef } from 'react';
import { useGSAP } from '@gsap/react';

import { registerDeckScroller } from '@/animation/deckCamera';
import { WORLD_WASH_REF_KEY, startSceneWash } from '@/animation/sceneWash';
import AttenuationStyleView from '@/components/panels/screen/worldView/AttenuationStyleView';
import { MetaBox } from '@/components/panels/screen/worldView/MetaBox';
import { useAttenuationStyleStore } from '@/stores/attenuationStyleStore';
import { useUIStore } from '@/stores/uiStore';
import { deleteRef, setRef } from '@/utils/refs';

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

  // Hands the scroller to the camera module (Mobile Deck Camera, spec §1.1) and centres it once,
  // on mount (spec assumption 3): an unpanned phone sees the same middle slice it always has, and
  // scrollWidth is read once here, not watched. A stable `useCallback` so React doesn't re-fire
  // this on every render — only on mount/unmount, which is also when the camera module needs to
  // learn about it.
  const registerScroller = useCallback((el: HTMLDivElement | null) => {
    registerDeckScroller(el);
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);

  // The scene wash (docs/tasks/OFF_SCREEN_REVISIONS.md Task 13): its element registered for the animation module, which
  // follows uiStore.sceneWash from mount and stops on unmount. The callback's return is that stop: useGSAP's
  // gsap.context keeps a returned function and runs it on revert, which is the unmount.
  const washRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!washRef.current) return;
      setRef(WORLD_WASH_REF_KEY, washRef.current);
      const stopWash = startSceneWash();
      return () => {
        stopWash();
        deleteRef(WORLD_WASH_REF_KEY);
      };
    },
    { dependencies: [] },
  );

  return (
    <div className="world-view" data-dimmed={dimmed ? '' : undefined}>
      <div className="world-view__scroller" ref={registerScroller}>
        <AttenuationStyleView attenuationStyleId={currentAttenuationStyleId} />
      </div>
      {/* The scene wash: the sea over the scene while a world change happens under it, transparent at rest. */}
      <div className="world-view__wash" ref={washRef} aria-hidden="true" />
      {/* The world's own readout, top of the Deck, right of the nav (spec §1.7). */}
      <MetaBox />
    </div>
  );
}

export default WorldView;
