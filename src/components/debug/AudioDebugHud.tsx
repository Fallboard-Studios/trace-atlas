// ========================================
// IMPORTS
// ========================================
import { useEffect, useSyncExternalStore } from 'react';

import {
  getDiagnosticsSnapshot,
  startAudioDiagnostics,
  subscribeDiagnostics,
} from '../../engine/audioDiagnostics';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '../../stores/attenuationStyleStore';
import { useLocaleStore } from '../../stores/localeStore';
import { getGlobalAttenuationStyleSeedOverride } from '../../utils/seedUtils';

import { buildHudLines, hudStatus } from './hudLines';
import './AudioDebugHud.css';

// ========================================
// COMPONENT
// ========================================

/**
 * Passive, read-only audio diagnostics overlay for `?debug` (docs/PERFORMANCE.md). It is not
 * interactive — no controls, not focusable, hidden from assistive tech — so it sits outside the
 * Sleeve & Glass shell rather than breaking the "interactive UI lives in ScreenViewport only" rule.
 * Built to diagnose the phone-only scratchy/cutting-out audio (docs/todo/scratchy-audio-phones.md):
 * it shows which failure signature is live — context state, audio-clock rate, UI frames, main-thread
 * lag — and logs when each begins and ends.
 */
export function AudioDebugHud() {
  useEffect(() => startAudioDiagnostics(), []);

  const snapshot = useSyncExternalStore(subscribeDiagnostics, getDiagnosticsSnapshot, getDiagnosticsSnapshot);

  // .coordinates specifically (not the whole locale) — same narrow selection Header.tsx uses, so this
  // doesn't re-render on every unrelated robot write.
  const currentLocaleId = useAttenuationStyleStore((s) => selectCurrentAttenuationStyle(s)?.currentLocaleId);
  const coordinates = useLocaleStore((s) => (currentLocaleId ? s.locales[currentLocaleId]?.coordinates : undefined));

  // Derived from the last sample (not performance.now() during render, which would be impure).
  const uptimeMs = Math.max(0, (snapshot.timing.last?.wallMs ?? snapshot.timing.startWallMs) - snapshot.timing.startWallMs);
  const lines = buildHudLines(
    snapshot,
    { seed: getGlobalAttenuationStyleSeedOverride(), x: coordinates?.x, y: coordinates?.y },
    uptimeMs,
  );
  const bad = hudStatus(snapshot) === 'bad';

  return (
    <div className={`audio-debug-hud${bad ? ' audio-debug-hud--bad' : ''}`} aria-hidden="true">
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

export default AudioDebugHud;
