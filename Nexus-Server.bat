@echo off
setlocal
title Nexus - Servidor (Modo Script/Dev)
cd /d "%~dp0Backend"

echo ==============================================
echo           NEXUS - SERVIDOR (MODO DEV/SCRIPT)
echo ==============================================
echo.
echo Iniciando servidor HTTP Axum na porta 3001...
cargo run --bin nexus-server --no-default-features
pause
