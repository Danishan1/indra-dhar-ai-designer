import { GarmentModelError } from '../errors.js';
import type { GarmentDesignState } from '../schema/design-state.js';

import { createKnitTshirt } from './knit-tshirt.js';
import { createWovenShirt, type WovenShirtOptions } from './woven-shirt.js';

export { createKnitTshirt, createWovenShirt };
export type { WovenShirtOptions };

const FACTORIES: Record<string, (opts?: WovenShirtOptions) => GarmentDesignState> = {
  woven_shirt: createWovenShirt,
  knit_tshirt: createKnitTshirt,
};

export const TEMPLATE_KEYS: readonly string[] = Object.keys(FACTORIES);

/** `templates.create('woven_shirt')` → a valid starting state; unknown keys throw. */
export const templates = {
  keys: TEMPLATE_KEYS,
  create(category: string, opts?: WovenShirtOptions): GarmentDesignState {
    const factory = FACTORIES[category];
    if (!factory)
      throw new GarmentModelError('UNKNOWN_CATEGORY', `No template for category "${category}"`);
    return factory(opts);
  },
};
