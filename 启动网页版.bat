@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更高版本：https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo 请安装包含 npm 的 Node.js。
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto failure
)
call npm run build
if errorlevel 1 goto failure
node scripts\server.mjs --open
if errorlevel 1 goto failure
exit /b 0
:failure
pause
exit /b 1
