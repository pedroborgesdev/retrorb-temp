import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const local = resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const python = env.PYTHON_BIN || (existsSync(local) ? local : 'python3');
const child = spawn(python, ['-m', 'api.server'], { stdio: 'inherit', env: { ...env, PYTHONDONTWRITEBYTECODE: '1' } });
child.on('error', (error) => { console.error('Não foi possível iniciar a API:', error.message); process.exit(1); });
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
