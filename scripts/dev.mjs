import { spawn } from 'node:child_process';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const pythonCommand = process.env.PYTHON || (isWindows ? 'python' : 'python3');
const pythonArgs = ['server/app.py'];

const sharedEnv = {
  ...process.env,
  UPLOAD_DIR: process.env.UPLOAD_DIR || './server/data/uploads',
  METADATA_DB_PATH: process.env.METADATA_DB_PATH || './server/data/metadata.db',
  ALLOW_ORIGINS: process.env.ALLOW_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000',
  TEMP_STORAGE_SERVER_URL: process.env.TEMP_STORAGE_SERVER_URL || 'http://127.0.0.1:25534',
  NEXT_PUBLIC_ENABLE_TEMP_STORAGE_UPLOADS:
    process.env.NEXT_PUBLIC_ENABLE_TEMP_STORAGE_UPLOADS || 'true',
};

const serverPort = process.env.TEMP_STORAGE_SERVER_PORT || '25534';
const webPort = process.env.NEXT_DEV_PORT || '3000';

const processes = [
  {
    name: 'server',
    command: pythonCommand,
    args: pythonArgs,
    env: {
      ...sharedEnv,
      PORT: serverPort,
    },
  },
  {
    name: 'next',
    command: isWindows ? 'npx.cmd' : 'npx',
    args: ['next', 'dev', '-p', webPort],
    env: {
      ...sharedEnv,
      PORT: webPort,
    },
  },
];

const children = [];
let shuttingDown = false;

function prefix(name, chunk) {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line.trim()) {
      console.log(`[${name}] ${line}`);
    }
  }
}

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(isWindows ? undefined : 'SIGTERM');
    }
  }

  setTimeout(() => process.exit(code), 300);
}

for (const entry of processes) {
  const child = spawn(isWindows ? [entry.command, ...entry.args].join(' ') : entry.command, isWindows ? [] : entry.args, {
    cwd: process.cwd(),
    env: entry.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows,
    windowsHide: true,
  });

  children.push(child);
  child.stdout.on('data', (chunk) => prefix(entry.name, chunk));
  child.stderr.on('data', (chunk) => prefix(entry.name, chunk));
  child.on('error', (error) => {
    console.error(`[${entry.name}] Failed to start: ${error.message}`);
    stopAll(1);
  });
  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[${entry.name}] exited with ${signal || code}`);
      stopAll(code || 1);
    }
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
