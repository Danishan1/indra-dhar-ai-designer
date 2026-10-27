'use client';

import { useShortcut } from '@/lib/shortcuts-provider';

import { useEditorStore } from '../store-context';

/**
 * Editor keyboard shortcuts (FR-EDT-125…127). The registry ignores them while typing in a field
 * (native text undo keeps working there); Ctrl/Cmd+S also works in fields so the browser's "Save page"
 * never opens.
 */
export function useEditorShortcuts() {
  const store = useEditorStore();
  const s = store.getState;
  useShortcut({
    id: 'editor.undo',
    combo: 'mod+z',
    description: 'Undo',
    handler: () => void s().undo(),
  });
  useShortcut({
    id: 'editor.redo',
    combo: 'mod+shift+z',
    description: 'Redo',
    handler: () => void s().redo(),
  });
  useShortcut({
    id: 'editor.redo-alt',
    combo: 'mod+y',
    description: 'Redo',
    handler: () => void s().redo(),
  });
  useShortcut({
    id: 'editor.save',
    combo: 'mod+s',
    description: 'Save now',
    allowInInputs: true,
    handler: () => void s().flush(),
  });
  useShortcut({
    id: 'editor.clear-selection',
    combo: 'escape',
    description: 'Clear selection',
    handler: () => s().clearSelection(),
  });
  useShortcut({
    id: 'editor.tool-select',
    combo: 'v',
    description: 'Select tool',
    handler: () => s().setTool('select'),
  });
  useShortcut({
    id: 'editor.zoom-in',
    combo: '=',
    description: 'Zoom in',
    handler: () => s().zoomIn(),
  });
  useShortcut({
    id: 'editor.zoom-out',
    combo: '-',
    description: 'Zoom out',
    handler: () => s().zoomOut(),
  });
  useShortcut({
    id: 'editor.fit',
    combo: 'shift+1',
    description: 'Fit to view',
    handler: () => s().fitToView(),
  });
  useShortcut({
    id: 'editor.zoom-reset',
    combo: 'shift+0',
    description: 'Zoom to 100%',
    handler: () => s().zoomReset(),
  });
  useShortcut({
    id: 'editor.tool-pan',
    combo: 'h',
    description: 'Pan tool',
    handler: () => s().setTool('pan'),
  });
}
