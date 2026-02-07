import { spawnSync } from 'node:child_process';

const PORTS = [3000, 4200];

function killStaleNxWatchersWindows() {
  const res = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      [
        '$procs = Get-CimInstance Win32_Process |',
        'Where-Object {',
        "  $_.Name -eq 'node.exe' -and $_.CommandLine -and (",
        "    $_.CommandLine -match 'vlass-api:serve' -or",
        "    $_.CommandLine -match 'vlass-web:serve' -or",
        "    $_.CommandLine -match 'nx run vlass-api:serve' -or",
        "    $_.CommandLine -match 'nx run vlass-web:serve'",
        '  )',
        '};',
        '$procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
      ].join(' '),
    ],
    { stdio: 'ignore' },
  );
  return res.status === 0;
}

function getListeningPidsWindows(port) {
  const res = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  if (res.status !== 0) return [];

  const pids = new Set();
  for (const line of res.stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (!match) continue;
    const linePort = Number(match[1]);
    const pid = Number(match[2]);
    if (linePort === port && Number.isFinite(pid) && pid > 0) {
      pids.add(pid);
    }
  }
  return [...pids];
}

function killPidWindows(pid) {
  spawnSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
}

function getListeningPidsUnix(port) {
  const res = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) return [];
  return res.stdout
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function killPidUnix(pid) {
  spawnSync('kill', ['-9', String(pid)], { stdio: 'ignore' });
}

for (const port of PORTS) {
  const pids =
    process.platform === 'win32'
      ? getListeningPidsWindows(port)
      : getListeningPidsUnix(port);

  for (const pid of pids) {
    if (process.platform === 'win32') {
      killPidWindows(pid);
    } else {
      killPidUnix(pid);
    }
  }
}

if (process.platform === 'win32') {
  killStaleNxWatchersWindows();
}

const stillBusy = [];
for (const port of PORTS) {
  const pids =
    process.platform === 'win32'
      ? getListeningPidsWindows(port)
      : getListeningPidsUnix(port);
  if (pids.length > 0) {
    stillBusy.push({ port, pids });
  }
}

if (stillBusy.length > 0) {
  for (const item of stillBusy) {
    console.error(`Port ${item.port} is still in use by PID(s): ${item.pids.join(', ')}`);
  }
  process.exit(1);
}

console.log(`Freed dev ports: ${PORTS.join(', ')}`);
