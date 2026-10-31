// ========================================
// IMPORTS
// ========================================
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '../stores/attenuationStyleStore';
import { useLocaleStore } from '../stores/localeStore';
import type { WorldIdentity } from './seedBaseline';

// ========================================
// FUNCTIONS
// ========================================

/**
 * The loaded world's identity — the current Attenuation Style's name and its current locale's coordinates — or
 * undefined when the stores hold no current world. What the address bar mirrors (docs/specs/OFF_SCREEN.md
 * assumption 12) after a retransmit (worldTransition.ts) and after a bare boot (worldBoot.ts). Its own module, with
 * no dependency but the two stores, so a test that mocks worldTransition or localeHelpers wholesale never loses it.
 */
export function currentWorldIdentity(): Pick<WorldIdentity, 'attenuationStyleName' | 'coordinates'> | undefined {
  const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  const locale = style?.currentLocaleId ? useLocaleStore.getState().getLocaleById(style.currentLocaleId) : undefined;
  if (!style || !locale) return undefined;
  return { attenuationStyleName: style.name, coordinates: locale.coordinates };
}
