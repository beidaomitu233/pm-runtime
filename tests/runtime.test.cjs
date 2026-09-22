const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, access } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawn } = require('node:child_process');

async function startRuntime() {
  const root = await mkdtemp(join(tmpdir(), 'pm-runtime-test-'));
  const child = spawn(process.execPath, [join(process.cwd(), 'apps/runtime/src/index.ts'), '--data-dir', root], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(new Error(`runtime exited ${code}`))); });
  return { root, child };
}

test('runtime creates endpoint, SQLite file, and authenticated status RPC', async () => {
  const { root, child } = await startRuntime();
  try {
    const endpoint = JSON.parse(await readFile(join(root, 'runtime', 'endpoint.json'), 'utf8'));
    const response = await fetch(`http://127.0.0.1:${endpoint.port}/internal/rpc`, { method: 'POST', headers: { authorization: `Bearer ${endpoint.token}`, 'content-type': 'application/json', host: `127.0.0.1:${endpoint.port}` }, body: JSON.stringify({ protocol_version: '0.1', operation: 'runtime.status', params: {} }) });
    const value = await response.json();
    assert.equal(response.status, 200); assert.equal(value.status, 'ready'); assert.equal(value.protocol_version, '0.1');
    await access(join(root, 'pm.db'));
  } finally { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); await rm(root, { recursive: true, force: true }); }
});
