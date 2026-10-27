'use client';

import {
  GALLERY_VARIANTS,
  galleryArtifact,
  layoutViews,
  listTemplates,
  renderGarment,
  viewBoxOf,
} from '@ai-designer/garment-render';
import { useMemo } from 'react';

import { PageHeader } from '@/components/shell/page-header';

import { PatternDefs, SceneElementPath } from './scene-svg';

/** Dev gallery: all templates × variants, rendered by the same code as the editor canvas. */
export function GarmentGallery() {
  const items = useMemo(
    () =>
      Object.entries(GALLERY_VARIANTS).map(([key, make]) => {
        const scene = renderGarment(make(), { artifact: galleryArtifact });
        return { key, scene, layout: layoutViews(scene, 'split') };
      }),
    [],
  );
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Garment gallery"
        description={`Parametric 2D flats (G2) for ${listTemplates()
          .map((t) => t.label)
          .join(' and ')} — development only.`}
      />
      <ul className="grid gap-4 p-6 md:grid-cols-2" aria-label="Variants">
        {items.map(({ key, scene, layout }) => (
          <li
            key={key}
            data-testid="gallery-item"
            className="rounded-md border bg-white p-3 dark:bg-slate-100"
          >
            <h2 className="mb-2 text-xs font-medium text-slate-700">{key}</h2>
            <svg
              viewBox={viewBoxOf(layout.bounds)}
              className="h-72 w-full"
              role="img"
              aria-label={key}
            >
              <PatternDefs patterns={scene.patterns} />
              {layout.placements.map((p) => (
                <g key={p.view} transform={p.dx ? `translate(${p.dx} 0)` : undefined}>
                  {scene.views[p.view].elements
                    .filter((e) => e.layer !== 'guides')
                    .map((e) => (
                      <SceneElementPath key={e.id} e={e} />
                    ))}
                </g>
              ))}
            </svg>
          </li>
        ))}
      </ul>
    </div>
  );
}
