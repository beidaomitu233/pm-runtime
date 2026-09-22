const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawn } = require('node:child_process');

function nextJsonLine(stream) { return new Promise((resolve, reject) => { let data = ''; const onData = chunk => { data += chunk.toString(); const index = data.indexOf('\n'); if (index >= 0) { stream.off('data', onData); resolve(JSON.parse(data.slice(0, index))); } }; stream.on('data', onData); stream.once('error', reject); }); }
test('MCP stdio bridge completes initialize and tools/list', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pm-runtime-mcp-'));
  const runtime = spawn(process.execPath, [join(process.cwd(), 'dist/apps/runtime/src/index.js'), '--data-dir', root], { stdio: ['ignore', 'pipe', 'pipe'] });
  let runtimeStderr = ''; runtime.stderr.on('data', chunk => { runtimeStderr += chunk.toString(); });
  await new Promise((resolve, reject) => { runtime.stdout.once('data', resolve); runtime.once('error', reject); runtime.once('exit', code => reject(new Error(`runtime exited ${code}: ${runtimeStderr}`))); });
  const child = spawn(process.execPath, [join(process.cwd(), 'dist/apps/mcp/src/index.js'), '--data-dir', root], { stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0.1.0' } } }) + '\n');
    const initialized = await nextJsonLine(child.stdout); assert.equal(initialized.id, 1); assert.ok(initialized.result);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    const listed = await nextJsonLine(child.stdout); assert.equal(listed.id, 2); assert.equal(listed.result.tools[0].name, 'pm.runtime.status');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'pm.runtime.status', arguments: {} } }) + '\n');
    const called = await nextJsonLine(child.stdout); assert.equal(called.id, 3); assert.equal(called.result.isError, false); assert.match(called.result.content[0].text, /"status":"ready"/);
  } finally {
    const waitExit = process => new Promise(resolve => process.exitCode !== null ? resolve() : process.once('exit', resolve));
    child.kill(); runtime.kill('SIGTERM');
    await Promise.all([waitExit(child), waitExit(runtime)]);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
