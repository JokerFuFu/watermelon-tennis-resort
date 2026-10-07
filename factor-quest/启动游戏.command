#!/bin/bash
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fail() { echo "$1"; read -r -p "按回车关闭" _answer; exit 1; }
command -v node >/dev/null 2>&1 || fail "请先安装 Node.js 22 或更高版本：https://nodejs.org/"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || fail "请安装 Node.js 22 或更高版本。"
rebuild=0
if [ "$1" = "--build" ]; then rebuild=1; fi
if [ ! -d node_modules ]; then
  command -v npm >/dev/null 2>&1 || fail "源码首次启动需要 npm（随 Node.js 安装）。"
  npm ci || fail "安装依赖失败。"
  rebuild=1
fi
if [ ! -f dist/index.html ] || [ "$rebuild" = 1 ]; then
  command -v npm >/dev/null 2>&1 || fail "构建源码需要 npm（随 Node.js 安装）。"
  npm run build || fail "构建游戏失败。"
fi
node scripts/server.mjs --open || fail "启动失败，请查看以上提示。"
