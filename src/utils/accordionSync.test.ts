import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  registerAccordion,
  unregisterAccordion,
  updateAccordionOpen,
  isAccordionOpen,
  subscribeAccordionOpen,
  openAccordionFromNav,
  notifyAccordionAnimationComplete,
  hasPendingNavTargetFor,
  clearPendingNavTarget,
  attemptFulfillPendingNavTarget,
} from './accordionSync';

function makeEntry(initialOpen: boolean) {
  const open = vi.fn();
  return { isOpen: initialOpen, open };
}

describe('accordionSync — registerAccordion/unregisterAccordion/isAccordionOpen (docs/tasks/NAV_ACCORDION_SYNC.md Task 1)', () => {
  afterEach(() => {
    unregisterAccordion('probes.r1.volume.audioSettings');
    unregisterAccordion('probes.r1.melody.rhythm');
  });

  it('round-trips a registered entry\'s isOpen value', () => {
    const entry = makeEntry(true);
    registerAccordion('probes.r1.volume.audioSettings', entry);

    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(true);
  });

  it('returns false for an id that was never registered', () => {
    expect(isAccordionOpen('probes.never-registered.section')).toBe(false);
  });

  it('unregisterAccordion removes only its own entry, leaving others untouched', () => {
    registerAccordion('probes.r1.volume.audioSettings', makeEntry(true));
    registerAccordion('probes.r1.melody.rhythm', makeEntry(true));

    unregisterAccordion('probes.r1.volume.audioSettings');

    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(false);
    expect(isAccordionOpen('probes.r1.melody.rhythm')).toBe(true);
  });

  it('registering a second entry under the same id replaces the first — matches sectionRefs.ts\'s own silent-replace contract', () => {
    registerAccordion('probes.r1.volume.audioSettings', makeEntry(true));
    registerAccordion('probes.r1.volume.audioSettings', makeEntry(false));

    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(false);
  });

  it('unregisterAccordion is a no-op, not a throw, for an id that was never registered', () => {
    expect(() => unregisterAccordion('probes.r1.envelope.pingContour')).not.toThrow();
  });
});

describe('openAccordionFromNav (docs/tasks/NAV_ACCORDION_SYNC.md Task 1)', () => {
  afterEach(() => {
    unregisterAccordion('probes.r1.volume.audioSettings');
  });

  it('calls the registered entry\'s open(false) when closeSiblings is false', () => {
    const entry = makeEntry(false);
    registerAccordion('probes.r1.volume.audioSettings', entry);

    openAccordionFromNav('probes.r1.volume.audioSettings', { closeSiblings: false });

    expect(entry.open).toHaveBeenCalledWith(false);
  });

  it('calls the registered entry\'s open(true) when closeSiblings is true', () => {
    const entry = makeEntry(false);
    registerAccordion('probes.r1.volume.audioSettings', entry);

    openAccordionFromNav('probes.r1.volume.audioSettings', { closeSiblings: true });

    expect(entry.open).toHaveBeenCalledWith(true);
  });

  it('is a no-op, not a throw, for an id with no registered accordion — e.g. a leaf merged away like "Pitches"', () => {
    expect(() => openAccordionFromNav('probes.r1.melody.pitches', { closeSiblings: false })).not.toThrow();
    clearPendingNavTarget();
  });
});

describe('openAccordionFromNav — onSettled (docs: nav-click sequencing fix — scroll must wait for the accordion to actually finish opening)', () => {
  afterEach(() => {
    unregisterAccordion('probes.r1.volume.audioSettings');
    clearPendingNavTarget();
  });

  it('calls onSettled immediately when the target was already open — nothing will animate', () => {
    const entry = makeEntry(true);
    registerAccordion('probes.r1.volume.audioSettings', entry);
    const onSettled = vi.fn();

    openAccordionFromNav('probes.r1.volume.audioSettings', { closeSiblings: false, onSettled });

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onSettled immediately when the target was closed — waits for the animation-complete signal', () => {
    const entry = makeEntry(false);
    registerAccordion('probes.r1.volume.audioSettings', entry);
    const onSettled = vi.fn();

    openAccordionFromNav('probes.r1.volume.audioSettings', { closeSiblings: false, onSettled });

    expect(onSettled).not.toHaveBeenCalled();
  });

  it('calls onSettled once notifyAccordionAnimationComplete fires for the opened id', () => {
    const entry = makeEntry(false);
    registerAccordion('probes.r1.volume.audioSettings', entry);
    const onSettled = vi.fn();
    openAccordionFromNav('probes.r1.volume.audioSettings', { closeSiblings: false, onSettled });

    notifyAccordionAnimationComplete('probes.r1.volume.audioSettings');

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('calls onSettled against the resolved ANCESTOR id, not the original leaf id, when falling back', () => {
    registerAccordion('fleetParams.eqFilters', makeEntry(false));
    const onSettled = vi.fn();

    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false, onSettled });
    notifyAccordionAnimationComplete('fleetParams.eqFilters.eq'); // wrong id — must not fire
    expect(onSettled).not.toHaveBeenCalled();

    notifyAccordionAnimationComplete('fleetParams.eqFilters'); // the actual resolved ancestor
    expect(onSettled).toHaveBeenCalledTimes(1);

    unregisterAccordion('fleetParams.eqFilters');
  });
});

describe('accordionSync — pending nav target queue (bug: a nav click switching into a not-yet-mounted view found nothing registered and silently did nothing, opening only that view\'s own mount-time default instead)', () => {
  afterEach(() => {
    unregisterAccordion('fleetParams.eqFilters');
    clearPendingNavTarget();
  });

  it('hasPendingNavTargetFor is false with nothing queued', () => {
    expect(hasPendingNavTargetFor(['fleetParams.eqFilters'])).toBe(false);
  });

  it('queues the request when nothing in the id\'s ancestry is registered yet, reported via hasPendingNavTargetFor', () => {
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false });

    expect(hasPendingNavTargetFor(['fleetParams.eqFilters'])).toBe(true);
  });

  it('hasPendingNavTargetFor is false for an unrelated id list', () => {
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false });

    expect(hasPendingNavTargetFor(['fleetParams.pacing', 'fleetParams.timeSpace'])).toBe(false);
  });

  it('fulfills the queued request once attemptFulfillPendingNavTarget runs after a matching id registers, passing through closeSiblings', () => {
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: true });
    const entry = makeEntry(false);
    registerAccordion('fleetParams.eqFilters', entry);

    attemptFulfillPendingNavTarget();

    expect(entry.open).toHaveBeenCalledWith(true);
  });

  it('registerAccordion alone does NOT fulfill — fulfillment only happens via attemptFulfillPendingNavTarget, called once per batch (a chain\'s outer accordion can register after its inner one within the same batch)', () => {
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: true });
    const entry = makeEntry(false);

    registerAccordion('fleetParams.eqFilters', entry);

    expect(entry.open).not.toHaveBeenCalled();
  });

  it('clears the pending target once fulfilled — a later, unrelated registration is unaffected', () => {
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false });
    registerAccordion('fleetParams.eqFilters', makeEntry(false));
    attemptFulfillPendingNavTarget();

    const laterEntry = makeEntry(false);
    registerAccordion('probes.r1.volume.audioSettings', laterEntry);
    attemptFulfillPendingNavTarget();

    expect(laterEntry.open).not.toHaveBeenCalled();
    unregisterAccordion('probes.r1.volume.audioSettings');
  });

  it('a repeated attemptFulfillPendingNavTarget call with nothing (newly) queued is a safe no-op', () => {
    expect(() => attemptFulfillPendingNavTarget()).not.toThrow();
  });

  it('calls onSettled once the fulfilling registration\'s own animation completes', () => {
    const onSettled = vi.fn();
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false, onSettled });
    registerAccordion('fleetParams.eqFilters', makeEntry(false));
    attemptFulfillPendingNavTarget();
    expect(onSettled).not.toHaveBeenCalled();

    notifyAccordionAnimationComplete('fleetParams.eqFilters');

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('a fresh openAccordionFromNav call replaces (not stacks) an unfulfilled pending target', () => {
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false });
    openAccordionFromNav('fleetParams.pacing', { closeSiblings: false });

    expect(hasPendingNavTargetFor(['fleetParams.eqFilters'])).toBe(false);
    expect(hasPendingNavTargetFor(['fleetParams.pacing'])).toBe(true);
  });

  it('clearPendingNavTarget cancels a queued request without fulfilling it', () => {
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false });

    clearPendingNavTarget();
    const entry = makeEntry(false);
    registerAccordion('fleetParams.eqFilters', entry);

    expect(entry.open).not.toHaveBeenCalled();
  });
});

describe('openAccordionFromNav — ancestor fallback (bug: clicking a leaf with no accordion of its own, e.g. Fleet Params\' "3-Band EQ", did nothing instead of opening its parent group)', () => {
  afterEach(() => {
    unregisterAccordion('fleetParams.eqFilters');
    clearPendingNavTarget();
  });

  it('opens the nearest registered ancestor when the exact id has no accordion of its own', () => {
    const groupEntry = makeEntry(false);
    registerAccordion('fleetParams.eqFilters', groupEntry);

    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false });

    expect(groupEntry.open).toHaveBeenCalledWith(false);
  });

  it('passes closeSiblings through to the ancestor\'s open call', () => {
    const groupEntry = makeEntry(false);
    registerAccordion('fleetParams.eqFilters', groupEntry);

    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: true });

    expect(groupEntry.open).toHaveBeenCalledWith(true);
  });

  it('still no-ops when no ancestor in the chain has a registered accordion either', () => {
    expect(() => openAccordionFromNav('probes.r1.melody.pitches', { closeSiblings: false })).not.toThrow();
  });

  it('opens BOTH when the exact id and an ancestor are each independently registered — a genuinely nested accordion, not a fallback (bug: Source\'s own children have a real accordion each, but Source itself, their parent, was never told to open)', () => {
    const exactEntry = makeEntry(false);
    const ancestorEntry = makeEntry(true); // already open, so it settles immediately and the inner one opens next
    registerAccordion('fleetParams.eqFilters.eq', exactEntry);
    registerAccordion('fleetParams.eqFilters', ancestorEntry);

    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false });

    expect(ancestorEntry.open).toHaveBeenCalledWith(false);
    expect(exactEntry.open).toHaveBeenCalledWith(false);

    unregisterAccordion('fleetParams.eqFilters.eq');
  });
});

describe('accordionSync — nested accordion chains (bug: Source is a real accordion; its own children — the oscillators, Probe Drift — are each their own nested accordion too; clicking a child must open Source THEN the child, in that order, not just the one exact match)', () => {
  afterEach(() => {
    unregisterAccordion('probes.r1.source');
    unregisterAccordion('probes.r1.source.baselineOscillator');
    clearPendingNavTarget();
  });

  it('opens the outer (Source) accordion before the inner (child) one — never simultaneously', () => {
    const source = makeEntry(false);
    const child = makeEntry(false);
    registerAccordion('probes.r1.source', source);
    registerAccordion('probes.r1.source.baselineOscillator', child);

    openAccordionFromNav('probes.r1.source.baselineOscillator', { closeSiblings: false });

    expect(source.open).toHaveBeenCalledWith(false);
    // The child must NOT be told to open yet — Source hasn't settled (it was closed, so it needs
    // its own GSAP tween to complete first).
    expect(child.open).not.toHaveBeenCalled();
  });

  it('opens the inner (child) accordion only after the outer (Source) one settles', () => {
    const source = makeEntry(false);
    const child = makeEntry(false);
    registerAccordion('probes.r1.source', source);
    registerAccordion('probes.r1.source.baselineOscillator', child);
    openAccordionFromNav('probes.r1.source.baselineOscillator', { closeSiblings: false });

    notifyAccordionAnimationComplete('probes.r1.source');

    expect(child.open).toHaveBeenCalledWith(false);
  });

  it('opens the inner accordion immediately (no wait) when the outer one was already open', () => {
    const source = makeEntry(true);
    const child = makeEntry(false);
    registerAccordion('probes.r1.source', source);
    registerAccordion('probes.r1.source.baselineOscillator', child);

    openAccordionFromNav('probes.r1.source.baselineOscillator', { closeSiblings: false });

    expect(child.open).toHaveBeenCalledWith(false);
  });

  it('closeSiblings applies only to the outer link — the inner one never gets closeSiblings, which would immediately re-close the just-opened outer accordion (they share one useAccordionOpenState instance)', () => {
    const source = makeEntry(false);
    const child = makeEntry(false);
    registerAccordion('probes.r1.source', source);
    registerAccordion('probes.r1.source.baselineOscillator', child);
    openAccordionFromNav('probes.r1.source.baselineOscillator', { closeSiblings: true });

    expect(source.open).toHaveBeenCalledWith(true);

    notifyAccordionAnimationComplete('probes.r1.source');

    expect(child.open).toHaveBeenCalledWith(false);
  });

  it('onSettled fires only once BOTH links have settled, not after just the outer one', () => {
    const source = makeEntry(false);
    const child = makeEntry(false);
    registerAccordion('probes.r1.source', source);
    registerAccordion('probes.r1.source.baselineOscillator', child);
    const onSettled = vi.fn();
    openAccordionFromNav('probes.r1.source.baselineOscillator', { closeSiblings: false, onSettled });

    notifyAccordionAnimationComplete('probes.r1.source');
    expect(onSettled).not.toHaveBeenCalled();

    notifyAccordionAnimationComplete('probes.r1.source.baselineOscillator');
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('a pending nav target for a nested id, fulfilled once both levels have registered, opens outer then inner in order', () => {
    openAccordionFromNav('probes.r1.source.baselineOscillator', { closeSiblings: false });
    const source = makeEntry(false);
    const child = makeEntry(false);
    // Registered in the SAME order useAccordionOpenState's real accordionIds list uses — the child
    // leaf appears before the wrapping Source accordion (spread order in RobotOptionsTab.tsx).
    registerAccordion('probes.r1.source.baselineOscillator', child);
    registerAccordion('probes.r1.source', source);

    attemptFulfillPendingNavTarget();

    expect(source.open).toHaveBeenCalledWith(false);
    expect(child.open).not.toHaveBeenCalled(); // Source hasn't settled yet
  });
});

describe('isAccordionOpen — miss safety (docs/tasks/NAV_ACCORDION_SYNC.md Task 1)', () => {
  it('returns false, not undefined and not a throw, for an unregistered id', () => {
    expect(isAccordionOpen('probes.never-registered.section')).toBe(false);
  });
});

describe('subscribeAccordionOpen/updateAccordionOpen (docs/tasks/NAV_ACCORDION_SYNC.md Task 1)', () => {
  afterEach(() => {
    unregisterAccordion('probes.r1.volume.audioSettings');
  });

  it('notifies a subscriber exactly once when updateAccordionOpen fires for its id', () => {
    const cb = vi.fn();
    const unsubscribe = subscribeAccordionOpen('probes.r1.volume.audioSettings', cb);

    updateAccordionOpen('probes.r1.volume.audioSettings', true);

    expect(cb).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('the returned unsubscribe function stops further notifications', () => {
    const cb = vi.fn();
    const unsubscribe = subscribeAccordionOpen('probes.r1.volume.audioSettings', cb);
    unsubscribe();

    updateAccordionOpen('probes.r1.volume.audioSettings', true);

    expect(cb).not.toHaveBeenCalled();
  });

  it('does not notify a subscriber registered under a different id', () => {
    const cb = vi.fn();
    const unsubscribe = subscribeAccordionOpen('probes.r1.melody.rhythm', cb);

    updateAccordionOpen('probes.r1.volume.audioSettings', true);

    expect(cb).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('notifies multiple independent subscribers to the same id', () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    const unsubA = subscribeAccordionOpen('probes.r1.volume.audioSettings', cbA);
    const unsubB = subscribeAccordionOpen('probes.r1.volume.audioSettings', cbB);

    updateAccordionOpen('probes.r1.volume.audioSettings', true);

    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbB).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });

  it('updateAccordionOpen updates the value isAccordionOpen subsequently returns', () => {
    registerAccordion('probes.r1.volume.audioSettings', makeEntry(false));

    updateAccordionOpen('probes.r1.volume.audioSettings', true);

    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(true);
  });

  it('updateAccordionOpen for an unregistered id does not throw', () => {
    expect(() => updateAccordionOpen('probes.never-registered.section', true)).not.toThrow();
  });
});
