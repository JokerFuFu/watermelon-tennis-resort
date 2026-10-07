import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm',
};

export function parseArgs(args) {
  const options = { host: '127.0.0.1', port: 5174, open: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--open') options.open = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--port' || arg.startsWith('--port=')) {
      const value = arg === '--port' ? args[++i] : arg.slice(7);
      if (!/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 65535) {
        throw new Error('--port 端口必须是 1–65535 的整数。');
      }
      options.port = Number(value);
    } else if (arg === '--host' || arg.startsWith('--host=')) {
      const value = arg === '--host' ? args[++i] : arg.slice(7);
      if (!value || !/^[a-zA-Z0-9._:-]+$/.test(value) || value.startsWith('-')) {
        throw new Error('--host 参数必须是有效主机名或 IP 地址。');
      }
      options.host = value;
    } else throw new Error(`未知参数：${arg}。使用 --help 查看帮助。`);
  }
  return options;
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export async function createStaticServer({ distDir = join(projectRoot, 'dist') } = {}) {
  let root;
  try {
    root = await realpath(distDir);
    if (!(await stat(join(root, 'index.html'))).isFile()) throw new Error('missing index');
  } catch {
    throw new Error('缺少 dist/index.html。源码请先运行 npm run build；运行包请完整解压。');
  }
  return createServer(async (req, res) => {
    const send = (status, message) => {
      const body = Buffer.from(message);
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length, 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return send(405, 'Method not allowed');
    }
    let path;
    try { path = decodeURIComponent((req.url ?? '').split('?')[0]); }
    catch { return send(400, 'Bad path'); }
    if (!path.startsWith('/') || path.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(path)) return send(400, 'Bad path');
    if (path.split('/').some(segment => segment.startsWith('.'))) return send(403, 'Forbidden');
    const name = ['/', '/factors', '/factors/'].includes(path) ? 'index.html' : path.slice(1);
    const candidate = resolve(root, name);
    if (!inside(root, candidate)) return send(403, 'Forbidden');
    try {
      const actual = await realpath(candidate);
      if (!inside(root, actual) || relative(root, actual).split(sep).some(segment => segment.startsWith('.'))) return send(403, 'Forbidden');
      if (!(await stat(actual)).isFile()) return send(404, 'Not found');
      const body = await readFile(actual);
      res.writeHead(200, {
        'Content-Type': contentTypes[extname(actual).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': body.length, 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(error.code)) return send(404, 'Not found');
      send(500, 'Unable to read file');
    }
  });
}

export function gameUrl(host, port) {
  const localHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host;
  return `http://${localHost.includes(':') ? `[${localHost}]` : localHost}:${port}/`;
}

export function browserCommand(url, platform = process.platform) {
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url] };
  return { command: platform === 'darwin' ? 'open' : 'xdg-open', args: [url] };
}

function openBrowser(url) {
  const { command, args } = browserCommand(url);
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.once('error', () => console.error(`未能自动打开浏览器，请手动访问 ${url}`));
  child.once('exit', code => { if (code) console.error(`未能自动打开浏览器，请手动访问 ${url}`); });
  child.unref();
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('因数游戏本机服务（Node.js 22+）\n用法：node scripts/server.mjs [--port 5174] [--host 127.0.0.1] [--open]\n默认地址：http://127.0.0.1:5174/\n--open 自动打开浏览器；--help 显示帮助。Ctrl+C 停止。');
      return;
    }
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('请安装 Node.js 22 或更高版本。');
    const server = await createStaticServer();
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(options.port, options.host, resolveListen);
    });
    const url = gameUrl(options.host, options.port);
    console.log(`因数游戏已启动：${url}\n保持此窗口运行，按 Ctrl+C 停止。`);
    if (options.open) openBrowser(url);
    const stop = () => server.close(() => process.exit(0));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? '端口已被占用。请用 --port 选择其他端口，或关闭先前启动的窗口。' : error.message);
    process.exitCode = 1;
  }
}

// Compare canonical filenames so symbolic-link aliases and paths with spaces also run the CLI.
if (process.argv[1]) {
  const entry = await realpath(resolve(process.argv[1])).catch(() => '');
  if (entry === await realpath(fileURLToPath(import.meta.url))) await main();
}
