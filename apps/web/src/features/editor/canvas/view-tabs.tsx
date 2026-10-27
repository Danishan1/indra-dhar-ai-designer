'use client';

import { CanvasLayers, LAYER_LABELS, VIEW_MODE_LABELS, ViewModes } from '@ai-designer/editor-core';
import { LayersIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { useEditor } from '../store-context';

/** Front / Back / Split switch and layer visibility (view state only — FR-EDT-009, FR-EDT-012). */
export function ViewTabs() {
  const mode = useEditor((s) => s.viewMode);
  const layers = useEditor((s) => s.layers);
  const setMode = useEditor((s) => s.setViewMode);
  const toggle = useEditor((s) => s.toggleLayer);
  return (
    <div className="flex items-center gap-1 rounded-md border bg-panel/95 p-0.5 shadow-sm">
      <div role="group" aria-label="View" className="flex">
        {ViewModes.map((m) => (
          <Button
            key={m}
            size="sm"
            variant="ghost"
            aria-pressed={mode === m}
            className={cn('h-6 px-2 text-xs', mode === m && 'bg-accent text-accent-foreground')}
            onClick={() => setMode(m)}
          >
            {VIEW_MODE_LABELS[m]}
          </Button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" className="size-6" aria-label="Layers">
            <LayersIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Layers</DropdownMenuLabel>
          {CanvasLayers.map((l) => (
            <DropdownMenuCheckboxItem
              key={l}
              checked={layers[l]}
              onCheckedChange={() => toggle(l)}
              onSelect={(e) => e.preventDefault()}
            >
              {LAYER_LABELS[l]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
