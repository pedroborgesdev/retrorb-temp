import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { loadEnv } from 'vite';
import electron from 'electron';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const api = spawn(process.execPath, ['scripts/api.mjs'], { stdio: 'inherit', env });
let desktop;
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  if (desktop?.exitCode === null) desktop.kill('SIGTERM');
  if (api.exitCode === null) api.kill('SIGTERM');
  process.exitCode = code;
}
api.on('error', (error) => { console.error(error.message); stop(1); });
api.on('exit', (code) => { if (!stopping) stop(code || 1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));

try {
  const deadline = Date.now() + 15_000;
  let ready = false;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${env.API_PORT || '5000'}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).status === 'ok') { ready = true; break; }
    } catch { /* The API may still be starting. */ }
    await setTimeout(200);
  }
  if (!ready || stopping) throw new Error('A API não iniciou. Confira a porta configurada e as dependências Python.');
  desktop = spawn(electron, ['.'], { stdio: 'inherit', env: { ...env, ELECTRON_RUN_AS_NODE: '' } });
  desktop.on('error', (error) => { console.error(error.message); stop(1); });
  desktop.on('exit', (code) => stop(code || 0));
} catch (error) {
  console.error(error.message);
  stop(1);
}
