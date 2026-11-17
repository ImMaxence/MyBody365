// The end-to-end tests in Safari's engine (WebKit, an iPhone 15), which does not start on Windows: in Playwright's
// own Linux image, against the local stack of this machine. Inside the container, a tiny relay makes the stack
// answer on localhost (the local sign-in and the « installed app » gate only open there).
//
//   LOCAL_PORT=4320 docker compose -f docker-compose.local.yml up --build -d --wait
//   E2E_PORT=4320 npm run e2e:iphone [-- e2e/meals.spec.ts]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const here = resolve(import.meta.dirname, '..');
const port = process.env.E2E_PORT ?? '4320';
const version = JSON.parse(readFileSync(resolve(here, 'node_modules/@playwright/test/package.json'), 'utf8')).version;
const extra = process.argv.slice(2).join(' ');
const relay = `require('net').createServer((c) => { const s = require('net').connect(${port}, 'host.docker.internal'); c.pipe(s).pipe(c); s.on('error', () => c.destroy()); c.on('error', () => s.destroy()); }).listen(${port}, '::')`;
const script = `node -e "${relay}" & sleep 1; npx playwright test ${extra}`;
const r = spawnSync(
  'docker',
  [
    'run', '--rm', '--ipc=host', '--add-host=host.docker.internal:host-gateway',
    '-v', `${here}:/work`, '-w', '/work',
    '-e', 'E2E_WEBKIT=1', '-e', `E2E_BASE_URL=http://localhost:${port}`, '-e', 'CI=1',
    `mcr.microsoft.com/playwright:v${version}-noble`,
    'sh', '-c', script,
  ],
  { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
);
process.exit(r.status ?? 1);
