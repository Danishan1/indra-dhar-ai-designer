import { loadRootEnv, parseWorkerEnv } from './config.js';
import { startWorker } from './worker.js';

loadRootEnv();
let env;
try {
  env = parseWorkerEnv(process.env);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const handle = await startWorker(env);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void handle.stop().then(() => process.exit(0));
  });
}
