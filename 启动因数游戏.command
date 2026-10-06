#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null 2>&1; then
  echo "请先安装 Node.js，然后重新打开此文件。"
  read "?按回车关闭"
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install || exit 1
fi
node scripts/local-service.mjs start || { read "?按回车关闭"; exit 1; }
open 'http://127.0.0.1:5173/factors'
echo "因数探险家已在浏览器打开。进度会自动保存，现在可以关闭此窗口。"
