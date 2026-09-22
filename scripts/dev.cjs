const { execFileSync, spawn } = require('node:child_process');
const { join } = require('node:path');
const root = process.cwd();
execFileSync(process.execPath, [join(root, 'scripts', 'build.cjs')], { cwd: root, stdio: 'inherit' });
const electronBinary = join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'Electron');
const child = spawn(electronBinary, ['--no-sandbox', '--in-process-gpu', '--disable-gpu', '--enable-logging=stderr', join(root, 'dist', 'apps', 'desktop', 'src', 'main', 'main.cjs')], { cwd: root, stdio: 'inherit', env: { ...process.env, PM_RUNTIME_DEV: '1', PM_RUNTIME_NODE: process.execPath, PM_RUNTIME_DATA_ROOT: join(root, '.local-data') } });
child.on('exit', code => process.exitCode = code ?? 0);
