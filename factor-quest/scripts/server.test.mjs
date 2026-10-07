import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';

const script = fileURLToPath(new URL('./server.mjs', import.meta.url));
const root = dirname(dirname(script));
const runtime = () => import('./server.mjs');

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'factor runtime 空格 '));
  const dist = join(dir, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await mkdir(join(dist, '.private'));
  await writeFile(join(dist, 'index.html'), '<title>Factor Quest</title>');
  await writeFile(join(dist, 'assets', 'game.js'), 'console.log("factors")');
  await writeFile(join(dist, 'assets', '中文 空格.txt'), '你好');
  await writeFile(join(dist, '.env'), 'SECRET');
  await writeFile(join(dist, '.private', 'file.txt'), 'SECRET');
  await writeFile(join(dir, 'outside.txt'), 'OUTSIDE');
  await symlink(join(dir, 'outside.txt'), join(dist, 'escaped.txt'));
  const { createStaticServer } = await runtime();
  const server = await createStaticServer({ distDir: dist });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  return { port: server.address().port };
}

function http(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('CLI defaults and explicit options', async () => {
  const { parseArgs } = await runtime();
  assert.deepEqual(parseArgs([]), { host: '127.0.0.1', port: 5174, open: false, help: false });
  assert.deepEqual(parseArgs(['--host', '::1', '--port=8123', '--open']), { host: '::1', port: 8123, open: true, help: false });
  assert.equal(parseArgs(['--port', '6000', '-h']).help, true);
});

test('CLI rejects unsupported or malformed arguments', async () => {
  const { parseArgs } = await runtime();
  for (const args of [['--port', '0'], ['--port', '65536'], ['--port', '1.5'], ['--port', '1e3'], ['--port'], ['--host'], ['--host', ''], ['--wat'], ['--open=true']]) {
    assert.throws(() => parseArgs(args), /参数|端口|host|port/);
  }
});

test('root and factors aliases serve the game index', async t => {
  const { port } = await fixture(t);
  for (const path of ['/', '/?play=1', '/factors', '/factors/', '/index.html']) {
    const res = await http(port, path);
    assert.equal(res.status, 200, path);
    assert.match(res.body, /Factor Quest/);
    assert.match(res.headers['content-type'], /text\/html/);
  }
});

test('static files support query strings and Unicode spaces', async t => {
  const { port } = await fixture(t);
  const js = await http(port, '/assets/game.js?v=1');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
  const text = await http(port, '/assets/' + encodeURIComponent('中文 空格.txt'));
  assert.equal(text.status, 200);
  assert.equal(text.body, '你好');
});

test('HEAD preserves length and returns no body', async t => {
  const { port } = await fixture(t);
  const res = await http(port, '/', 'HEAD');
  assert.equal(res.status, 200);
  assert.equal(res.body, '');
  assert.equal(Number(res.headers['content-length']), Buffer.byteLength('<title>Factor Quest</title>'));
});

test('unknown routes, missing assets and legacy web root return 404', async t => {
  const { port } = await fixture(t);
  for (const path of ['/web', '/unknown', '/assets/missing.js', '/assets/']) {
    assert.equal((await http(port, path)).status, 404, path);
  }
});

test('only GET and HEAD are allowed', async t => {
  const { port } = await fixture(t);
  const res = await http(port, '/', 'POST');
  assert.equal(res.status, 405);
  assert.equal(res.headers.allow, 'GET, HEAD');
});

test('traversal, hidden files, malformed paths and symlink escapes are denied', async t => {
  const { port } = await fixture(t);
  for (const path of ['/../outside.txt', '/%2e%2e/outside.txt', '/assets/%2e%2e/%2e%2e/outside.txt', '/assets%2f..%2f..%2foutside.txt', '/%5c..%5coutside.txt', '/.env', '/%2eenv', '/.private/file.txt', '/escaped.txt', '/%00', '/%zz', '//outside.txt']) {
    const res = await http(port, path);
    assert.ok([400, 403].includes(res.status), `${path}: ${res.status}`);
    assert.doesNotMatch(res.body, /SECRET|OUTSIDE/);
  }
});

test('help succeeds without a dist folder', () => {
  const res = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /5174/);
  assert.match(res.stdout, /--open/);
  assert.doesNotMatch(res.stdout, /\/web/);
});

test('CLI entry detection supports symlink aliases and paths with spaces', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'factor CLI 空格 '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const alias = join(dir, 'game alias.mjs');
  await symlink(script, alias);
  const res = spawnSync(process.execPath, [alias, '--help'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /--port/);
});

test('CLI invalid option fails before starting a server', () => {
  const res = spawnSync(process.execPath, [script, '--port', 'wrong'], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /端口|port/);
});

test('browser command uses root URL and platform standard tools', async () => {
  const { browserCommand, gameUrl } = await runtime();
  const url = gameUrl('127.0.0.1', 5174);
  assert.equal(url, 'http://127.0.0.1:5174/');
  assert.equal(gameUrl('::1', 5174), 'http://[::1]:5174/');
  assert.equal(gameUrl('0.0.0.0', 5174), url);
  assert.deepEqual(browserCommand(url, 'darwin'), { command: 'open', args: [url] });
  assert.deepEqual(browserCommand(url, 'linux'), { command: 'xdg-open', args: [url] });
  const win = browserCommand(url, 'win32');
  assert.equal(win.command, 'cmd.exe');
  assert.deepEqual(win.args, ['/d', '/s', '/c', 'start', '', url]);
});

test('source launchers build when necessary and Windows uses call npm', async () => {
  const mac = await readFile(join(root, '启动游戏.command'), 'utf8');
  const win = await readFile(join(root, '启动游戏.bat'), 'utf8');
  assert.match(mac, /npm ci/);
  assert.match(mac, /npm run build/);
  assert.match(mac, /dist\/index\.html/);
  assert.match(mac, /--build/);
  assert.match(mac, /node scripts\/server\.mjs --open/);
  assert.match(win, /call npm ci/);
  assert.match(win, /call npm run build/);
  assert.match(win, /--build/);
  assert.match(win, /node scripts\\server\.mjs --open/);
});

test('release launchers require only Node and preserve Mac executable mode', async () => {
  const { releaseLaunchers } = await import('./package-release.mjs');
  const files = releaseLaunchers();
  assert.equal(files.length, 2);
  const mac = files.find(file => file.name === '启动游戏.command');
  const win = files.find(file => file.name === '启动游戏.bat');
  assert.equal(mac.mode, 0o100755);
  assert.match(mac.bytes.toString(), /node scripts\/server\.mjs --open/);
  assert.match(win.bytes.toString(), /node scripts\\server\.mjs --open/);
  for (const file of files) assert.doesNotMatch(file.bytes.toString(), /npm|\/web|\/Users\//);
  assert.ok(win.bytes.includes(Buffer.from('\r\n')));
});

test('ZIP stores UTF-8 filenames, correct payload and Unix permissions', async () => {
  const { createZip } = await import('./package-release.mjs');
  const { inflateRawSync } = await import('node:zlib');
  const name = '启动游戏.command';
  const payload = Buffer.from('#!/bin/bash\necho 你好\n');
  const zip = createZip([{ name, bytes: payload, mode: 0o100755 }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt16LE(6) & 0x800, 0x800);
  const nameLength = zip.readUInt16LE(26);
  assert.equal(zip.subarray(30, 30 + nameLength).toString('utf8'), name);
  const length = zip.readUInt32LE(18);
  assert.deepEqual(inflateRawSync(zip.subarray(30 + nameLength, 30 + nameLength + length)), payload);
  const central = 30 + nameLength + length;
  assert.equal(zip.readUInt32LE(central), 0x02014b50);
  assert.equal(zip.readUInt32LE(central + 38) >>> 16, 0o100755);
  assert.equal(zip.readUInt16LE(zip.length - 12), 1);
});
