import config, { packageBoundaries } from './eslint/index.js';

export default [...config, ...packageBoundaries];
