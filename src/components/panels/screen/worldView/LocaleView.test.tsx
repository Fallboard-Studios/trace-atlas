import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const oceanSceneSpy = vi.fn(() => <div data-testid="ocean-scene-stub" />);
vi.mock('./OceanScene', () => ({
  OceanScene: () => oceanSceneSpy(),
}));

let mockLocales: Record<string, unknown> = {};
vi.mock('@/stores/localeStore', () => ({
  useLocaleStore: (selector: (s: { locales: Record<string, unknown> }) => unknown) =>
    selector({ locales: mockLocales }),
}));

import LocaleView from './LocaleView';

describe('LocaleView', () => {
  it('renders the wrapper and OceanScene when the locale exists', () => {
    mockLocales = { 'locale-1': {} };
    const { container } = render(<LocaleView localeId="locale-1" />);

    expect(container.querySelector('.locale-view')).not.toBeNull();
    expect(oceanSceneSpy).toHaveBeenCalled();
  });

  it('renders nothing and never invokes OceanScene when the locale does not exist', () => {
    mockLocales = {};
    oceanSceneSpy.mockClear();
    const { container } = render(<LocaleView localeId="missing-locale" />);

    expect(container.firstChild).toBeNull();
    expect(oceanSceneSpy).not.toHaveBeenCalled();
  });
});
