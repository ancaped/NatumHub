@echo off
title Nexus
echo ==============================================
echo           INICIANDO NEXUS DESKTOP
echo ==============================================
echo.
echo [1/2] Iniciando o servidor frontend e compilador backend...
cd /d "%~dp0"
npm --prefix Backend run tauri:dev
echo.
echo Nexus encerrado.
pause
