import type { DesignComponent } from '../schema/component.js';
import type { GarmentDesignState } from '../schema/design-state.js';

import { buildComponent, buildState, type TemplateOptions } from './build.js';

/**
 * Starting points for the families added with the AI analyzer (ADR-056). They have no parametric
 * drawing yet; the AI analyzer normally builds these states from images instead.
 */
const pair = (
  type: string,
  base: string,
  parent: DesignComponent,
  opts: TemplateOptions,
  proposed?: Record<string, string>,
) =>
  (['left', 'right'] as const).map((side) =>
    buildComponent(
      {
        type,
        name: `${side === 'left' ? 'Left' : 'Right'} ${base}`,
        side,
        parent,
        ...(proposed ? { proposed } : {}),
      },
      opts,
    ),
  );

export function createDress(opts: TemplateOptions = {}): GarmentDesignState {
  const body = buildComponent({ type: 'garment_body', name: 'Dress body' }, opts);
  const front = buildComponent(
    { type: 'front_body_panel', name: 'Front bodice', parent: body },
    opts,
  );
  const back = buildComponent({ type: 'back_body_panel', name: 'Back bodice', parent: body }, opts);
  const sleeves = pair('sleeve', 'sleeve', body, opts, { 'construction.sleeve_type': 'set_in' });
  const neckline = buildComponent({ type: 'neckline', parent: body }, opts);
  const skirt = buildComponent({ type: 'skirt_panel', name: 'Skirt', parent: body }, opts);
  const hem = buildComponent({ type: 'hem', name: 'Hem', parent: body }, opts);
  return buildState({ key: 'dress', garmentType: 'dress' }, [
    body,
    front,
    back,
    ...sleeves,
    neckline,
    skirt,
    hem,
  ]);
}

export function createSkirt(opts: TemplateOptions = {}): GarmentDesignState {
  const body = buildComponent({ type: 'garment_body', name: 'Skirt body' }, opts);
  const front = buildComponent(
    { type: 'skirt_panel', name: 'Front skirt panel', parent: body },
    opts,
  );
  const back = buildComponent(
    { type: 'skirt_panel', name: 'Back skirt panel', parent: body },
    opts,
  );
  const waistband = buildComponent({ type: 'waistband', parent: body }, opts);
  const hem = buildComponent({ type: 'hem', name: 'Hem', parent: body }, opts);
  return buildState({ key: 'skirt', garmentType: 'skirt' }, [body, front, back, waistband, hem]);
}

export function createTrousers(opts: TemplateOptions = {}): GarmentDesignState {
  const body = buildComponent({ type: 'garment_body', name: 'Trousers body' }, opts);
  const legs = pair('leg_panel', 'leg', body, opts);
  const waistband = buildComponent({ type: 'waistband', parent: body }, opts);
  const pockets = (['lower_left', 'lower_right'] as const).map((pos) =>
    buildComponent(
      {
        type: 'pocket',
        name: pos === 'lower_left' ? 'Left pocket' : 'Right pocket',
        parent: body,
        proposed: { 'placement.pocket_position': pos },
      },
      opts,
    ),
  );
  return buildState({ key: 'trousers', garmentType: 'trousers' }, [
    body,
    ...legs,
    waistband,
    ...pockets,
  ]);
}

export function createJacket(opts: TemplateOptions = {}): GarmentDesignState {
  const body = buildComponent({ type: 'garment_body', name: 'Jacket body' }, opts);
  const front = buildComponent({ type: 'front_body_panel', parent: body }, opts);
  const back = buildComponent({ type: 'back_body_panel', parent: body }, opts);
  const sleeves = pair('sleeve', 'sleeve', body, opts, { 'construction.sleeve_type': 'set_in' });
  const collar = buildComponent({ type: 'collar', parent: body }, opts);
  const placket = buildComponent({ type: 'placket', name: 'Front closure', parent: front }, opts);
  const lining = buildComponent({ type: 'lining', parent: body }, opts);
  return buildState({ key: 'jacket', garmentType: 'jacket' }, [
    body,
    front,
    back,
    ...sleeves,
    collar,
    placket,
    lining,
  ]);
}

export function createHoodie(opts: TemplateOptions = {}): GarmentDesignState {
  const body = buildComponent({ type: 'garment_body', name: 'Hoodie body' }, opts);
  const front = buildComponent({ type: 'front_body_panel', parent: body }, opts);
  const back = buildComponent({ type: 'back_body_panel', parent: body }, opts);
  const sleeves = pair('sleeve', 'sleeve', body, opts, { 'construction.sleeve_type': 'raglan' });
  const cuffs = sleeves.map((s) =>
    buildComponent(
      { type: 'hem', name: `${s.side === 'left' ? 'Left' : 'Right'} rib cuff`, parent: s },
      opts,
    ),
  );
  const hood = buildComponent({ type: 'hood', parent: body }, opts);
  const pocket = buildComponent({ type: 'pocket', name: 'Kangaroo pocket', parent: front }, opts);
  const hem = buildComponent({ type: 'hem', name: 'Rib hem', parent: body }, opts);
  return buildState({ key: 'hoodie', garmentType: 'hoodie' }, [
    body,
    front,
    back,
    ...sleeves,
    ...cuffs,
    hood,
    pocket,
    hem,
  ]);
}
