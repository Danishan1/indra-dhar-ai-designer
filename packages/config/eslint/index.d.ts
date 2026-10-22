import type { Linter } from 'eslint';
import type globalsModule from 'globals';

export declare const globals: typeof globalsModule;
export declare const base: Linter.Config[];
export declare const packageBoundaries: Linter.Config[];
export declare const purePackageBoundaries: Linter.Config[];
export declare const tests: Linter.Config[];
declare const config: Linter.Config[];
export default config;
