@echo off
setlocal
title Natum Hub - Servidor
cd /d "%~dp0"

echo ==============================================
echo        NATUM HUB - SERVIDOR HEADLESS
echo ==============================================
echo.
echo Postgres: Saves\postgres.env
echo API/SPA:  http://127.0.0.1:3001
echo Clientes: http://natumhub.local:3001
echo.
echo Nao rode junto com NatumHub.bat (Tauri) - mesma porta 3001.
echo.

echo [1/2] Gerando Frontend\dist (sempre atualiza o SPA)...
call npm --prefix Frontend run build
if errorlevel 1 (
  echo.
  echo ERRO: falha no build do Frontend.
  pause
  exit /b 1
)
echo.

echo [2/2] Iniciando natumhub-server (deixe esta janela aberta)...
echo.
cd Backend
cargo run --bin natumhub-server --no-default-features
set EXITCODE=%ERRORLEVEL%
cd ..

echo.
if not "%EXITCODE%"=="0" (
  echo Servidor encerrou com codigo %EXITCODE%.
  pause
  exit /b %EXITCODE%
)

echo Servidor encerrado.
pause
exit /b 0
