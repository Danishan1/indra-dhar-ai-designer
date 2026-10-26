import type { GarmentDesignState } from '../schema/design-state.js';

import { buildComponent, buildState, type TemplateOptions } from './build.js';

/** Knit T-shirt: body, front/back panels, left/right sleeves with hems, neckline (rib), body hem. */
export function createKnitTshirt(opts: TemplateOptions = {}): GarmentDesignState {
  const body = buildComponent(
    {
      type: 'garment_body',
      name: 'T-shirt body',
      proposed: { 'appearance.silhouette': 'regular' },
    },
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
  const sleeveHems = sleeves.map((sleeve) =>
    buildComponent(
      {
        type: 'hem',
        name: `${sleeve.side === 'left' ? 'Left' : 'Right'} sleeve hem`,
        parent: sleeve,
        proposed: { 'construction.hem_type': 'coverstitch' },
      },
      opts,
    ),
  );
  const neckline = buildComponent(
    {
      type: 'neckline',
      name: 'Neckline (rib)',
      parent: body,
      proposed: { 'construction.neckline_type': 'crew' },
    },
    opts,
  );
  const hem = buildComponent(
    {
      type: 'hem',
      name: 'Body hem',
      parent: body,
      proposed: { 'construction.hem_type': 'coverstitch' },
    },
    opts,
  );

  return buildState({ key: 'knit_tshirt', garmentType: 'tshirt' }, [
    body,
    front,
    back,
    ...sleeves,
    ...sleeveHems,
    neckline,
    hem,
  ]);
}
