import { create } from 'zustand';

import type { AttenuationStyle } from '../types/attenuationStyle';
import { generateRandomAttenuationStyleName } from '../utils/seedUtils';
import { getAttenuationStyleNoiseMap, evictAttenuationStyleNoiseMap, evictLocaleNoiseMap } from '../utils/noiseMaps';
import { devWarn } from '../utils/helpers';
import { getSessionSharePayload } from '../utils/sessionShareUtils';

export const DEFAULT_LOCALE_ID = 'pelagos-default';

// The default Attenuation Style's *id* stays a stable literal — nothing
// downstream keys off the name (localeStore.ts, WorldView.tsx, etc. all
// reference the id). The *name* is what actually feeds the procedural seed
// (deriveAttenuationStyleSeed), so it's resolved once per module load: a
// shareable link's exact, unsanitized name (docs/specs/
// SECTOR_SETTINGS_SHARABLE_LINK.md §4.4/§7 item 1) takes priority when
// `?session=` is present, otherwise a fresh random name — deliberately NOT
// routed through deriveAttenuationStyleSeed's override mechanism (removed
// from URL-boot entirely, roadmap Phase 21), which would both sanitize the
// name and persist for the rest of the session. Exported so localeStore.ts's
// own noise-map priming call uses the same name instead of a second
// hardcoded literal that could silently drift from this one.
export const DEFAULT_ATTENUATION_STYLE_NAME = getSessionSharePayload()?.attenuationStyleName ?? generateRandomAttenuationStyleName();

export const DEFAULT_PELAGOS: AttenuationStyle = {
  id: 'pelagos',
  name: DEFAULT_ATTENUATION_STYLE_NAME,
  locales: [DEFAULT_LOCALE_ID],
  currentLocaleId: DEFAULT_LOCALE_ID,
};

getAttenuationStyleNoiseMap('pelagos', DEFAULT_ATTENUATION_STYLE_NAME);

export interface AttenuationStyleStore {
  attenuationStyles: AttenuationStyle[];
  currentAttenuationStyleId: string;
  addAttenuationStyle: (attenuationStyle: AttenuationStyle) => boolean;
  removeAttenuationStyle: (attenuationStyleId: string) => void;
  setCurrentLocale: (attenuationStyleId: string, localeId: string) => void;
  setCurrentAttenuationStyleId: (attenuationStyleId: string) => void;
}

/**
 * Resolve the actively-selected Attenuation Style from
 * `currentAttenuationStyleId`. Returns `undefined` (never throws) if
 * `currentAttenuationStyleId` doesn't match any entry in `attenuationStyles`
 * — e.g. the selected Attenuation Style was removed, or none has been
 * selected yet.
 */
export function selectCurrentAttenuationStyle(state: AttenuationStyleStore): AttenuationStyle | undefined {
  return state.attenuationStyles.find((p) => p.id === state.currentAttenuationStyleId);
}

export const useAttenuationStyleStore = create<AttenuationStyleStore>((set) => ({
  attenuationStyles: [DEFAULT_PELAGOS],
  currentAttenuationStyleId: DEFAULT_PELAGOS.id,

  addAttenuationStyle: (attenuationStyle) => {
    let added = false;
    set((state) => {
      const nameTaken = state.attenuationStyles.some(
        (p) => p.name.toLowerCase() === attenuationStyle.name.toLowerCase()
      );
      if (nameTaken) {
        devWarn(
          `[attenuationStyleStore] addAttenuationStyle: name "${attenuationStyle.name}" is already taken. Not added.`
        );
        return state;
      }
      added = true;
      getAttenuationStyleNoiseMap(attenuationStyle.id, attenuationStyle.name);
      return { attenuationStyles: [...state.attenuationStyles, attenuationStyle] };
    });
    return added;
  },

  removeAttenuationStyle: (attenuationStyleId) =>
    set((state) => {
      const attenuationStyle = state.attenuationStyles.find((p) => p.id === attenuationStyleId);
      if (attenuationStyle) {
        attenuationStyle.locales.forEach((localeId) => evictLocaleNoiseMap(localeId));
        evictAttenuationStyleNoiseMap(attenuationStyleId);
      }
      return { attenuationStyles: state.attenuationStyles.filter((p) => p.id !== attenuationStyleId) };
    }),

  setCurrentLocale: (attenuationStyleId, localeId) =>
    set((state) => ({
      attenuationStyles: state.attenuationStyles.map((p) =>
        p.id === attenuationStyleId ? { ...p, currentLocaleId: localeId } : p
      ),
    })),

  setCurrentAttenuationStyleId: (attenuationStyleId) => set({ currentAttenuationStyleId: attenuationStyleId }),
}));

export default useAttenuationStyleStore;
