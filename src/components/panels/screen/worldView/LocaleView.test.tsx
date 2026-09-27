import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const oceanSceneSpy = vi.fn((_props: { localTime: number }) => <div data-testid="ocean-scene-stub" />);
vi.mock('./OceanScene', () => ({
  OceanScene: (props: { localTime: number }) => oceanSceneSpy(props),
}));

let mockLocales: Record<string, unknown> = {};
vi.mock('@/stores/localeStore', () => ({
  useLocaleStore: (selector: (s: { locales: Record<string, unknown> }) => unknown) =>
    selector({ locales: mockLocales }),
}));

import LocaleView from './LocaleView';

describe('LocaleView', () => {
  it('renders the wrapper and OceanScene, passing localTime through, when the locale exists', () => {
    mockLocales = { 'locale-1': {} };
    const { container } = render(<LocaleView localeId="locale-1" localTime={14.5} />);

    expect(container.querySelector('.locale-view')).not.toBeNull();
    expect(oceanSceneSpy).toHaveBeenCalledWith(expect.objectContaining({ localTime: 14.5 }));
  });

  it('renders nothing and never invokes OceanScene when the locale does not exist', () => {
    mockLocales = {};
    oceanSceneSpy.mockClear();
    const { container } = render(<LocaleView localeId="missing-locale" localTime={14.5} />);

    expect(container.firstChild).toBeNull();
    expect(oceanSceneSpy).not.toHaveBeenCalled();
  });
});
