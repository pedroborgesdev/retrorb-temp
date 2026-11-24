import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...loadEnv('development', root, ''), ...process.env };
const local = resolve(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const python = env.PYTHON_BIN || (existsSync(local) ? local : 'python3');
const child = spawn(python, [resolve(root, 'scripts/prepare_icons.py'), ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env });
child.on('error', (error) => { console.error(`Não foi possível iniciar o gerador: ${error.message}`); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
