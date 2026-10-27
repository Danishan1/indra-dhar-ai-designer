'use client';

import { AlertTriangleIcon, ShapesIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useEditor } from '../store-context';

import { useScene } from './scene-context';

/**
 * Geometry capability of the flat (FR-RV-049) and the components drawn with default values
 * (FR-RV-004/053) — a structured preview, not a production pattern.
 */
export function CapabilityBadge() {
  const scene = useScene();
  const components = useEditor((s) => s.display.components);
  const select = useEditor((s) => s.select);
  const placeholders = Object.values(scene.components).filter((c) => c.placeholders.length);
  const name = (id: string) => components.find((c) => c.componentId === id)?.displayName ?? id;
  const other = scene.warnings.filter(
    (w) => w.code !== 'PLACEHOLDER_GEOMETRY' && w.code !== 'BACK_VIEW_NOT_AVAILABLE',
  );
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 bg-panel/95" data-testid="capability-badge">
            <ShapesIcon aria-hidden />
            {scene.capability === 'G2' ? 'Structured 2D (G2)' : 'No 2D geometry'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          {scene.capability === 'G2'
            ? 'A parametric technical flat drawn from the garment model — a visual reference, not a production pattern. Fabric fills do not guarantee physical colour.'
            : (scene.warnings[0]?.message ?? 'No template for this garment category yet.')}
        </TooltipContent>
      </Tooltip>
      {placeholders.length || other.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 bg-panel/95 px-2 text-xs"
              data-testid="placeholder-chip"
            >
              <AlertTriangleIcon className="text-status-needs-review" aria-hidden />
              {placeholders.length
                ? `${placeholders.length} drawn with defaults`
                : `${other.length} note${other.length === 1 ? '' : 's'}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-80">
            {placeholders.length ? (
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                No value yet — drawn with template defaults:
              </DropdownMenuLabel>
            ) : null}
            {placeholders.map((c) => (
              <DropdownMenuItem key={c.componentId} onSelect={() => select(c.componentId)}>
                <span className="font-medium">{name(c.componentId)}</span>
                <span className="truncate text-muted-foreground">
                  {c.placeholders
                    .map((k) => (k.split('.')[1] ?? k).replaceAll('_', ' '))
                    .join(', ')}
                </span>
              </DropdownMenuItem>
            ))}
            {other.map((w, i) => (
              <DropdownMenuItem
                key={`${w.code}-${String(i)}`}
                disabled={!w.componentId}
                onSelect={() => w.componentId && select(w.componentId)}
              >
                <span className="text-xs">{w.message}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
