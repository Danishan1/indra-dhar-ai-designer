'use client';

import { createTabStore, PanelTabContent, PanelTabs } from '../components/panel-tabs';
import { HierarchyPanel } from '../hierarchy/hierarchy-panel';

import { LibraryPanel } from './library-panel';

/** Which left tab is open (Parts = hierarchy, Library = artifacts, I18). */
export const useLeftTab = createTabStore<'parts' | 'library'>('parts');
const TABS = [
  { id: 'parts', label: 'Parts' },
  { id: 'library', label: 'Library' },
] as const;

export function LeftPanelTabs() {
  return <PanelTabs name="left" label="Left panel" tabs={TABS} store={useLeftTab} />;
}

export function LeftPanelContent() {
  return (
    <PanelTabContent
      name="left"
      store={useLeftTab}
      render={(tab) => (tab === 'parts' ? <HierarchyPanel /> : <LibraryPanel />)}
    />
  );
}
