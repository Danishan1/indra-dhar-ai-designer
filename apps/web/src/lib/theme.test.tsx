// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { parseThemePreference, resolveTheme, ThemeProvider, useTheme } from './theme';

function Probe() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="pref">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      <button type="button" onClick={() => setPreference('light')}>
        light
      </button>
    </div>
  );
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = (query: string) =>
      ({
        matches: true,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
  });

  it('parses and resolves preferences', () => {
    expect(parseThemePreference('nonsense')).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('applies the stored preference and persists changes', async () => {
    localStorage.setItem('aid.theme', 'system');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('pref')).toHaveProperty('textContent', 'system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await act(() => userEvent.click(screen.getByRole('button', { name: 'light' })));
    expect(localStorage.getItem('aid.theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
