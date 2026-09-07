@echo off
setlocal
title Nexus - Servidor (Porta 3001)
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cd /d "%~dp0"

echo ==============================================
echo           NEXUS - SERVIDOR (PORTA 3001)
echo ==============================================
echo.

:start_server
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo Iniciando servidor HTTP Axum na porta 3001...
set NEXUS_RESTART_LOOP=1

if exist "C:\natumhub\debug\nexus-server.exe" (
    "C:\natumhub\debug\nexus-server.exe"
) else (
    cd /d "%~dp0Backend"
    cargo run --bin nexus-server --no-default-features
)

set EXIT_CODE=%ERRORLEVEL%
if "%EXIT_CODE%"=="42" (
    echo.
    echo ==============================================
    echo    REINICIANDO SERVIDOR VIA APLICATIVO...
    echo ==============================================
    timeout /t 1 /nobreak >nul
    goto start_server
)

echo.
echo Servidor finalizado (Codigo: %EXIT_CODE%).
pause
