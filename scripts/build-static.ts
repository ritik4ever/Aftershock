import { buildStaticViewer } from '../packages/core/src/static.js';

try {
  console.log(JSON.stringify(await buildStaticViewer(process.cwd())));
} catch {
  console.error(
    'Static export failed. Check reviewed captures and use a fresh checkout/output directory (dist must not exist).',
  );
  process.exitCode = 1;
}
