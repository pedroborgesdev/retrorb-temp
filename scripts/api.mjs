import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const root = process.cwd();
const apiDir = resolve(root, 'api');
const env = { ...loadEnv('development', root, ''), ...process.env };
if (!env.CONSOLE_CATALOG_PATH) {
  env.CONSOLE_CATALOG_PATH = resolve(root, 'contexto/consoles-definitive.json');
}

const usePrebuilt = process.argv.includes('--prebuilt');
const binaryName = process.platform === 'win32' ? 'retromancy-api.exe' : 'retromancy-api';
const defaultBinary = resolve(apiDir, 'bin', binaryName);
const configuredBinary = env.API_BIN ? resolve(root, env.API_BIN) : '';

let command = 'go';
let args = ['run', './cmd/server'];
if (configuredBinary && existsSync(configuredBinary)) {
  command = configuredBinary;
  args = [];
} else if (usePrebuilt && existsSync(defaultBinary)) {
  command = defaultBinary;
  args = [];
}

const child = spawn(command, args, { cwd: apiDir, stdio: 'inherit', env });
child.on('error', (error) => { console.error('Não foi possível iniciar a API Go:', error.message); process.exit(1); });
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
