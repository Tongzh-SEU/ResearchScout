@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 Node.js 后再运行此文件。
  pause
  exit /b 1
)

node web\server.mjs --open
if errorlevel 1 pause
