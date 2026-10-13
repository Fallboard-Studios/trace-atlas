import { useState } from 'react';
import type { CSSProperties } from 'react';

import Tablet from './components/tablet/Tablet';
import AudioDebugHud from './components/debug/AudioDebugHud';

import { generateRealWorldGradients } from '@/utils/realWorldGradient';
import { isDebugEnabled } from '@/utils/debugParams';

import './App.css';

function App() {
  // Lazy initializer — runs once, during the very first render, so the
  // randomized backdrop is present from first paint (no flash of the
  // CSS-default gradient a useEffect would leave visible for a tick first).
  const [realWorldGradients] = useState(() => generateRealWorldGradients());
  const realWorldStyle = {
    '--real-world-gradient-before': realWorldGradients.before,
    '--real-world-gradient-after': realWorldGradients.after,
  } as CSSProperties;

  return (
    <div className="app-root">
      <div className="real-world" style={realWorldStyle}>
        <Tablet />
      </div>
      {isDebugEnabled() && <AudioDebugHud />}
    </div>
  );
}

export default App;
