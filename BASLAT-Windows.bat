@echo off
rem SKYTHREAD - double-click to play on Windows 10/11.
rem Uses Node.js when it is installed and new enough, otherwise downloads a
rem portable Node.js into .tools\node once (no admin rights needed); then
rem installs the npm packages, builds the game and opens it in the browser.
rem Options: --dev  --no-open  --rebuild  --reinstall  --check
rem Set SKYTHREAD_NODE=portable to ignore an installed Node.js.
rem Kept ASCII-only: cmd.exe reads batch files in the console code page.
setlocal EnableExtensions DisableDelayedExpansion
title SKYTHREAD
pushd "%~dp0"

if /i "%SKYTHREAD_NODE%"=="portable" goto portable
where node >nul 2>nul
if %errorlevel% neq 0 goto portable
node "scripts\check-node.cjs"
if %errorlevel% neq 0 goto portable
set "NODE_EXE=node"
goto launch

:portable
if not exist ".tools\node\node.exe" goto download
".tools\node\node.exe" "scripts\check-node.cjs" >nul 2>nul
if %errorlevel% equ 0 goto useportable

:download
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "scripts\install-node-windows.ps1"
if %errorlevel% neq 0 goto failed

:useportable
set "PATH=%CD%\.tools\node;%PATH%"
set "NODE_EXE=%CD%\.tools\node\node.exe"

:launch
"%NODE_EXE%" "scripts\launch.mjs" %*
if %errorlevel% neq 0 goto failed
popd
exit /b 0

:failed
echo.
echo SKYTHREAD baslatilamadi; hatanin ayrintilari yukarida.
echo Node.js'i elle kurmak isterseniz: https://nodejs.org (LTS surumu), sonra bu dosyayi yeniden calistirin.
if not defined CI pause
popd
exit /b 1
