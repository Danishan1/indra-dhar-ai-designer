import type { GarmentDesignState } from '../schema/design-state.js';

import { buildComponent, buildState, type TemplateOptions } from './build.js';

export interface WovenShirtOptions extends TemplateOptions {
  /** Include a left-chest pocket (default true). */
  chestPocket?: boolean;
}

/** Woven shirt: body, front/back panels, left/right sleeves with cuffs, collar, placket, hem, optional pocket. */
export function createWovenShirt(opts: WovenShirtOptions = {}): GarmentDesignState {
  const body = buildComponent(
    { type: 'garment_body', name: 'Shirt body', proposed: { 'appearance.silhouette': 'regular' } },
    opts,
  );
  const front = buildComponent({ type: 'front_body_panel', parent: body }, opts);
  const back = buildComponent({ type: 'back_body_panel', parent: body }, opts);
  const sleeves = (['left', 'right'] as const).map((side) =>
    buildComponent(
      {
        type: 'sleeve',
        name: `${side === 'left' ? 'Left' : 'Right'} sleeve`,
        side,
        parent: body,
        proposed: { 'construction.sleeve_type': 'set_in' },
      },
      opts,
    ),
  );
  const cuffs = sleeves.map((sleeve) =>
    buildComponent(
      {
        type: 'cuff',
        name: `${sleeve.side === 'left' ? 'Left' : 'Right'} cuff`,
        side: sleeve.side,
        parent: sleeve,
        proposed: { 'construction.cuff_type': 'barrel_single_button' },
      },
      opts,
    ),
  );
  const collar = buildComponent(
    { type: 'collar', parent: body, proposed: { 'construction.collar_type': 'spread' } },
    opts,
  );
  const placket = buildComponent(
    {
      type: 'placket',
      name: 'Front placket',
      parent: front,
      proposed: { 'construction.placket_type': 'standard', 'construction.closure_type': 'button' },
    },
    opts,
  );
  const hem = buildComponent(
    {
      type: 'hem',
      name: 'Body hem',
      parent: body,
      proposed: { 'construction.hem_type': 'shirt_tail' },
    },
    opts,
  );
  const pocket =
    opts.chestPocket === false
      ? []
      : [
          buildComponent(
            {
              type: 'pocket',
              name: 'Chest pocket',
              side: 'left',
              parent: front,
              proposed: {
                'construction.pocket_type': 'patch',
                'placement.pocket_position': 'left_chest',
              },
            },
            opts,
          ),
        ];

  return buildState({ key: 'woven_shirt', garmentType: 'shirt' }, [
    body,
    front,
    back,
    ...sleeves,
    ...cuffs,
    collar,
    placket,
    ...pocket,
    hem,
  ]);
}
