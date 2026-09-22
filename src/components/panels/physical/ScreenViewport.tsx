import Header from '@/components/panels/screen/Header';
import WorldView from '@/components/panels/screen/worldView/WorldView';
import ContentPane from '@/components/panels/screen/console/ContentPane';
import { SCREEN_VIEWPORT_ID } from '@/utils/helpers';
import './ScreenViewport.css';

interface ScreenViewportProps {
  isPoweredOn: boolean;
}

function ScreenViewport({ isPoweredOn }: ScreenViewportProps) {
  return (
    <main id={SCREEN_VIEWPORT_ID} className="screen-viewport">
      <div className="screen-occlusion" aria-hidden="true" />

      <svg className="screen-rail right-light-beam" viewBox="0 0 100 2" width="100%" height="2" aria-hidden="true" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"></svg>

      <div className="screen-content">
        {isPoweredOn && <Header />}
        {isPoweredOn && <WorldView />}
        {isPoweredOn && <ContentPane />}
      </div>

      <svg className="screen-rail left-light-beam" viewBox="0 0 100 2" width="100%" height="2" aria-hidden="true" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"></svg>
    </main>
  );
}

export default ScreenViewport;
