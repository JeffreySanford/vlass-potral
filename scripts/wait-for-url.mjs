import { request } from 'node:http';

const url = process.argv[2] ?? 'http://localhost:4200';
const timeoutMs = Number(process.argv[3] ?? 120000);
const started = Date.now();

function ping(target) {
  return new Promise((resolve) => {
    const req = request(target, { method: 'GET' }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function main() {
  while (Date.now() - started < timeoutMs) {
    const ok = await ping(url);
    if (ok) {
      console.log(`URL ready: ${url}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.error(`Timed out waiting for URL: ${url}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
