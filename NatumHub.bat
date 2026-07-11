@echo off
title Natum Hub
echo ==============================================
echo        INICIANDO NATUM HUB DESKTOP
echo ==============================================
echo.
echo [1/2] Iniciando o servidor frontend e compilador backend...
cd /d "%~dp0"
npm --prefix Backend run tauri:dev
echo.
echo Natum Hub encerrado.
pause
