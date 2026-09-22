const { existsSync, mkdtempSync, rmSync, readFileSync, accessSync, constants } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { execFileSync } = require('node:child_process');
const checks = [];
const pass = (name, detail) => { checks.push({ name, status: 'ok', detail }); console.log(`OK   ${name}: ${detail}`); };
const fail = (name, detail) => { checks.push({ name, status: 'fail', detail }); console.error(`FAIL ${name}: ${detail}`); };
try { if (process.version !== 'v22.23.2') throw new Error(`expected v22.23.2, got ${process.version}`); pass('node', process.version); } catch (e) { fail('node', e.message); }
try { const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'; const version = execFileSync(npmCommand, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim(); if (version !== '10.9.8') throw new Error(`expected 10.9.8, got ${version}`); pass('npm', version); } catch (e) { fail('npm', e.message); }
try { const dir = mkdtempSync(join(tmpdir(), 'pm-runtime-doctor-')); const db = new DatabaseSync(join(dir, 'probe.db')); db.exec("CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO probe VALUES (1, 'disk-ok');"); const row = db.prepare('SELECT value FROM probe WHERE id=1').get(); db.close(); rmSync(dir, { recursive: true, force: true }); if (row.value !== 'disk-ok') throw new Error('unexpected SQLite result'); pass('sqlite-disk', 'node:sqlite read/write'); } catch (e) { fail('sqlite-disk', e.message); }
try { const db = new DatabaseSync(':memory:'); db.exec('CREATE TABLE probe (value TEXT); INSERT INTO probe VALUES (\'memory-ok\')'); const row = db.prepare('SELECT value FROM probe').get(); db.close(); if (row.value !== 'memory-ok') throw new Error('unexpected SQLite result'); pass('sqlite-memory', 'node:sqlite query'); } catch (e) { fail('sqlite-memory', e.message); }
try { const resource = join(process.cwd(), 'resources', 'drawio', 'index.html'); if (!existsSync(resource)) throw new Error('offline drawio fixture missing'); const html = readFileSync(resource, 'utf8'); if (!html.includes('postMessage') || !html.includes('toXml')) throw new Error('fixture protocol hooks missing'); pass('offline-editor', 'local resource with JSON postMessage and XML/SVG export hooks'); } catch (e) { fail('offline-editor', e.message); }
try { accessSync(process.cwd(), constants.R_OK | constants.W_OK); pass('workspace', 'read/write'); } catch (e) { fail('workspace', e.message); }
if (checks.some(x => x.status === 'fail')) process.exitCode = 1;
