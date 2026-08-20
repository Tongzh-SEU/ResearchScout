@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 Node.js 后再运行此文件。
  pause
  exit /b 1
)

curl.exe --silent --fail --max-time 1 http://127.0.0.1:4178/ >nul 2>nul
if not errorlevel 1 (
  start "" http://127.0.0.1:4178/
  exit /b 0
)

node web\server.mjs --open
if errorlevel 1 pause
