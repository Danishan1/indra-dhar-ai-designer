/**
 * Non-sensitive UI preferences only (theme, panel sizes, sidebar state). Never store tokens,
 * identifiers of other users or business data here (SPEC-009 FR-SEC-052).
 */
export const PreferenceKeys = {
  theme: 'aid.theme',
  sidebarCollapsed: 'aid.sidebar.collapsed',
  editorLayoutPrefix: 'aid.editor.layout',
  /** Last selected organization id (re-validated against my memberships on every load). */
  activeOrganization: 'aid.activeOrg',
  /** Projects dashboard layout: grid | list. */
  projectsView: 'aid.projects.view',
} as const;

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode, quota); preferences are best effort.
  }
}

/** Storage adapter for libraries that persist layouts (react-resizable-panels). */
export const preferenceStorage = {
  getItem: (key: string) => readPreference(key),
  setItem: (key: string, value: string) => writePreference(key, value),
};
