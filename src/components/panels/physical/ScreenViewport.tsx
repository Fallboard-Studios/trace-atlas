import Header from '@/components/panels/screen/Header';
import WorldView from '@/components/panels/screen/worldView/WorldView';
import ContentPane from '@/components/panels/screen/console/ContentPane';
import NavPanel from '@/components/panels/screen/nav/NavPanel';
import NavBreadcrumb from '@/components/panels/screen/nav/NavBreadcrumb';
import PhoneBar from '@/components/panels/screen/PhoneBar';
import { useShell } from '@/components/panels/screen/useShell';
import { SCREEN_VIEWPORT_ID } from '@/utils/helpers';
import './ScreenViewport.css';

interface ScreenViewportProps {
  isPoweredOn: boolean;
}

function ScreenViewport({ isPoweredOn }: ScreenViewportProps) {
  // The shell, for stylesheets: `[data-shell='phone']` reads useShell(), the one switch, so no CSS
  // carries a media query of its own for it (docs/specs/LAYOUT_REWORK.md Assumption 1).
  const shell = useShell();

  return (
    <main id={SCREEN_VIEWPORT_ID} className="screen-viewport" data-shell={shell}>
      <div className="screen-occlusion" aria-hidden="true" />

      <svg className="screen-rail right-light-beam" viewBox="0 0 100 2" width="100%" height="2" aria-hidden="true" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"></svg>

      <div className="screen-content">
        {isPoweredOn && <Header />}
        {/* Mounted in both power states (docs/specs/LAYOUT_REWORK.md §1.9): the world is built before
            power-on and is the off screen's backdrop. Its systems start on the rocker, not here. */}
        <WorldView />
        {isPoweredOn && <NavPanel />}
        {isPoweredOn && <ContentPane />}
        {isPoweredOn && <NavBreadcrumb />}
        {isPoweredOn && <PhoneBar />}
      </div>

      <svg className="screen-rail left-light-beam" viewBox="0 0 100 2" width="100%" height="2" aria-hidden="true" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"></svg>
    </main>
  );
}

export default ScreenViewport;
