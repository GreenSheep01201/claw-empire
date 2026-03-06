@echo off
setlocal EnableExtensions
title Claw-Empire Launcher

cd /d "%~dp0.."
set "REPO_DIR=%cd%"

echo [Claw-Empire] Preparing startup from %REPO_DIR%
echo [Claw-Empire] Cleaning previous Claw-Empire dev processes...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kill-claw-empire-dev.ps1"

echo [Claw-Empire] Starting v1.2.3...
corepack pnpm dev:local
echo.
echo [Claw-Empire] Exited with code %ERRORLEVEL%
pause
