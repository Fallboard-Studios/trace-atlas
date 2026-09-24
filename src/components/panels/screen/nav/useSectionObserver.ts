import { useEffect, useRef, useState } from 'react';
import { getSectionRef } from '@/utils/sectionRefs';

export interface UseSectionObserverResult {
  /** True the first time this id's anchor has intersected the viewport, and forever after —
   *  never flips back once true. The lazy-mount gate (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md
   *  §7 Q5/Q6): a caller only builds a section's real content once this is true. */
  hasApproached: (id: string) => boolean;
}

/**
 * One IntersectionObserver watching every id's registered scroll anchor (src/utils/sectionRefs.ts)
 * — doubles as scrollspy sync and the lazy-mount gate (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md
 * §1.6/§7 Q5). `onIntersect` fires with whichever intersecting section is closest to the top of
 * the viewport on each observer callback — the caller's job (not this hook's) is to turn that id
 * into whatever selection state a click on it would set, WITHOUT scrolling (a manual scroll driving
 * a scroll-to-section call right back would fight the user's own scroll). No timers/rAF anywhere —
 * IntersectionObserver only (CLAUDE.md).
 */
export function useSectionObserver(ids: string[], onIntersect: (id: string) => void): UseSectionObserverResult {
  const approachedRef = useRef<Set<string>>(new Set());
  const onIntersectRef = useRef(onIntersect);
  onIntersectRef.current = onIntersect;
  // Bumped only when a NEW id's hasApproached flips true, so a consumer reading hasApproached
  // during render (to decide whether to mount real content) re-renders when it matters.
  const [, forceRender] = useState(0);

  const idsKey = ids.join('|');

  useEffect(() => {
    const watched = ids
      .map((id) => ({ id, el: getSectionRef(id) }))
      .filter((entry): entry is { id: string; el: HTMLElement } => !!entry.el);
    if (watched.length === 0) return;

    const idByElement = new Map<Element, string>(watched.map(({ id, el }) => [el, id]));

    const observer = new IntersectionObserver((entries) => {
      let approachedChanged = false;
      const intersecting: { id: string; top: number }[] = [];
      for (const entry of entries) {
        const id = idByElement.get(entry.target);
        if (!id) continue;
        if (!entry.isIntersecting) continue;
        if (!approachedRef.current.has(id)) {
          approachedRef.current.add(id);
          approachedChanged = true;
        }
        intersecting.push({ id, top: entry.boundingClientRect.top });
      }
      if (approachedChanged) forceRender((n) => n + 1);
      if (intersecting.length > 0) {
        intersecting.sort((a, b) => a.top - b.top);
        onIntersectRef.current(intersecting[0].id);
      }
    });

    watched.forEach(({ el }) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return {
    hasApproached: (id: string) => approachedRef.current.has(id),
  };
}
