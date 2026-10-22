'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { PreferenceKeys, readPreference, writePreference } from './local-preferences';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Dark is the default: dense "design software" look (I04 §6). */
export const DEFAULT_THEME: ThemePreference = 'dark';

const THEME_VALUES: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return THEME_VALUES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : DEFAULT_THEME;
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * Inline script for <head>: applies the saved theme before first paint (no flash; see
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  PreferenceKeys.theme,
)})||${JSON.stringify(DEFAULT_THEME)};var d=p==='system'?window.matchMedia('(prefers-color-scheme: dark)').matches:p!=='light';document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})()`;

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference(preference: ThemePreference): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersDarkMedia(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Server and first client render use the defaults (no hydration mismatch); the stored preference
  // is read after mount. The inline THEME_INIT_SCRIPT already painted the right theme meanwhile.
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME);
  const [prefersDark, setPrefersDark] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPreferenceState(parseThemePreference(readPreference(PreferenceKeys.theme)));
    const media = prefersDarkMedia();
    if (media) setPrefersDark(media.matches);
    setLoaded(true);
    if (!media) return;
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    if (loaded) document.documentElement.setAttribute('data-theme', resolved);
  }, [loaded, resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writePreference(PreferenceKeys.theme, next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
