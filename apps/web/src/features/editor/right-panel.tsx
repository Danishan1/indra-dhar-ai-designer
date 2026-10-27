'use client';

import { createTabStore, PanelTabContent, PanelTabs } from './components/panel-tabs';
import { PropertiesPanel } from './properties/properties-panel';
import { HistoryPanel } from './revisions/history-panel';

/** Which right tab is open (Properties / History, I19). */
export const useRightTab = createTabStore<'properties' | 'history'>('properties');
const TABS = [
  { id: 'properties', label: 'Properties' },
  { id: 'history', label: 'History' },
] as const;

export function RightPanelTabs() {
  return <PanelTabs name="right" label="Right panel" tabs={TABS} store={useRightTab} />;
}

export function RightPanelContent() {
  return (
    <PanelTabContent
      name="right"
      store={useRightTab}
      render={(tab) => (tab === 'properties' ? <PropertiesPanel /> : <HistoryPanel />)}
    />
  );
}
