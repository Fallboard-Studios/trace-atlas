import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  registerAccordion,
  unregisterAccordion,
  updateAccordionOpen,
  isAccordionOpen,
  subscribeAccordionOpen,
  openAccordionFromNav,
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
