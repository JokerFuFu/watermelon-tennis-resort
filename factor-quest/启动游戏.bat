@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更高版本：https://nodejs.org/
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo 请安装 Node.js 22 或更高版本。
  pause
  exit /b 1
)
set "rebuild=0"
if "%~1"=="--build" set "rebuild=1"
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto failure
  set "rebuild=1"
)
if not exist dist\index.html set "rebuild=1"
if "%rebuild%"=="1" (
  call npm run build
  if errorlevel 1 goto failure
)
node scripts\server.mjs --open
if errorlevel 1 goto failure
exit /b 0
:failure
echo 启动失败，请查看以上提示。
pause
exit /b 1
