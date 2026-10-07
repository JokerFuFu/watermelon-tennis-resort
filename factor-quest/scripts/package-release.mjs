import { readdir, readFile, writeFile, mkdir, stat, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const regular = 0o100644;

export function releaseLaunchers() {
  const mac = `#!/bin/bash
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 22 或更高版本：https://nodejs.org/"
  read -r -p "按回车关闭" _answer
  exit 1
fi
node scripts/server.mjs --open
status=$?
if [ "$status" -ne 0 ]; then read -r -p "按回车关闭" _answer; fi
exit "$status"
`;
  const win = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更高版本：https://nodejs.org/
  pause
  exit /b 1
)
node scripts\\server.mjs --open
if errorlevel 1 (
  pause
  exit /b 1
)
`;
  return [
    { name: '启动游戏.command', bytes: Buffer.from(mac), mode: 0o100755 },
    { name: '启动游戏.bat', bytes: Buffer.from(win.replace(/\n/g, '\r\n')), mode: regular },
  ];
}

const table = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function crc32(bytes) {
  let n = 0xffffffff;
  for (const byte of bytes) n = table[(n ^ byte) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
}

export function createZip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = deflateRawSync(file.bytes);
    const checksum = crc32(file.bytes);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6); // UTF-8 names.
    head.writeUInt16LE(8, 8);
    head.writeUInt16LE(33, 12); // Fixed ZIP date: 1980-01-01.
    head.writeUInt32LE(checksum, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(file.bytes.length, 22);
    head.writeUInt16LE(name.length, 26);
    parts.push(head, name, data);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(0x314, 4); // Unix creator.
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt16LE(33, 14);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(file.bytes.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE((file.mode << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += head.length + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

async function packageRelease() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('package.json version 必须是 x.y.z。');
  try {
    if (!(await stat(join(root, 'dist', 'index.html'))).isFile()) throw new Error('missing index');
  } catch { throw new Error('请先运行 npm run build，再打包。'); }
  const files = [];
  async function walk(dir, prefix) {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error('运行包不接受符号链接。');
      if (entry.name.startsWith('.')) throw new Error('运行包不接受隐藏文件。');
      const path = join(dir, entry.name);
      const name = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(path, name);
      else if (entry.isFile()) files.push({ name, bytes: await readFile(path), mode: regular });
    }
  }
  await walk(join(root, 'dist'), 'dist');
  for (const name of ['scripts/server.mjs', 'THIRD_PARTY_NOTICES.txt']) {
    files.push({ name, bytes: await readFile(join(root, name)), mode: regular });
  }
  files.push(...releaseLaunchers());
  const instructions = `因数游戏 ${pkg.version}

1. 安装 Node.js 22 或更高版本：https://nodejs.org/
2. 完整解压本运行包；不能直接在 ZIP 内运行。
3. Windows 双击启动游戏.bat；Mac 双击启动游戏.command。
4. 浏览器会打开 http://127.0.0.1:5174/。保持终端窗口运行，按 Ctrl+C 停止。
5. Linux 在解压目录执行：node scripts/server.mjs --open

本运行包只需要 Node.js，无需安装开发依赖。
端口占用时：node scripts/server.mjs --port 5175 --open
默认仅本机可访问。更多参数：node scripts/server.mjs --help
Mac 若提示权限不足，在终端执行 chmod +x 启动游戏.command，再重新打开。

游戏存档保存在当前浏览器的本机存储中。换电脑、浏览器或端口不会自动同步；请在游戏内导出存档，然后在新环境导入。
第三方许可见 THIRD_PARTY_NOTICES.txt。
`;
  files.push({ name: '开始使用.txt', bytes: Buffer.from(instructions), mode: regular });
  await mkdir(join(root, 'release'), { recursive: true });
  const output = join(root, 'release', `factor-quest-${pkg.version}-web.zip`);
  await writeFile(output, createZip(files));
  console.log(`已生成 Windows / Mac 共用运行包：${output}\n${files.length} 个文件；只需 Node.js 22+，不含开发依赖。`);
}

if (process.argv[1]) {
  const entry = await realpath(resolve(process.argv[1])).catch(() => '');
  if (entry === await realpath(fileURLToPath(import.meta.url))) {
    try { await packageRelease(); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
