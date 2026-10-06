#!/bin/bash
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "请先安装 Node.js 22 或更高版本（包含 npm）：https://nodejs.org/"
  read -r -p "按回车关闭" _answer
  exit 1
fi
if [ ! -d node_modules ]; then npm ci || exit 1; fi
npm run build || exit 1
node scripts/server.mjs --open
