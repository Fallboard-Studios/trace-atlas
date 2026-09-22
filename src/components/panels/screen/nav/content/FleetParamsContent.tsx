import { AudioRigDrawer, AudioRigEffectPanel } from '../../console/AudioRigDrawer';
import { useUIStore } from '@/stores/uiStore';

/**
 * Fleet Params branch content (docs/specs/NAV_LAYOUT_REWRITE.md §2, Task 14) — routes on
 * uiStore.selectedFleetParamsEffect. When a specific effect leaf (EQ/HPF/LPF/Reverb/Delay/
 * Compression/Limiter) is selected, renders that one AudioRigEffectPanel standalone. Otherwise
 * (the bare Fleet Params category, or one of its 3 still-category-only groups — EQ & Filters/
 * Time & Space/Output, spec §7 Q5, no doc-content wired yet per Q4) falls back to AudioRigDrawer,
 * which by this point in the migration renders only Automatic Effects — mirrors SettingsContent's
 * own fallback-to-unmigrated-content pattern (Task 11).
 */
export function FleetParamsContent() {
  const selectedFleetParamsEffect = useUIStore((s) => s.selectedFleetParamsEffect);

  if (selectedFleetParamsEffect) {
    return <AudioRigEffectPanel effectKey={selectedFleetParamsEffect} />;
  }

  return <AudioRigDrawer />;
}

export default FleetParamsContent;
