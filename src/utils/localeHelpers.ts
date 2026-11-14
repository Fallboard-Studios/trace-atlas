import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';

/** The active locale's id, read once: for an event handler, an effect or a system. A component's render body reads
 *  `useActiveLocaleId()` instead, or its store selectors keep the id it mounted with. */
export function getActiveLocaleId(): string {
  const attenuationStyleState = useAttenuationStyleStore.getState();
  const p = selectCurrentAttenuationStyle(attenuationStyleState);
  return p?.currentLocaleId ?? '';
}

/** The active locale's id, subscribed: the component re-renders when the active locale changes, so every selector
 *  that closes over the id reads the new locale. `''` when no style is selected, as `getActiveLocaleId()`. */
export function useActiveLocaleId(): string {
  return useAttenuationStyleStore((s) => selectCurrentAttenuationStyle(s)?.currentLocaleId ?? '');
}
