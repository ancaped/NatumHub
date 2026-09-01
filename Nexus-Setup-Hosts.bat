@echo off
setlocal
title Nexus - Configurar Hosts
cd /d "%~dp0"

echo Configurando nexus.local e natumhub.local no arquivo hosts...
net session >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Execute este arquivo como Administrador.
    pause
    exit /b 1
)

set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
findstr /i /c:"nexus.local" "%HOSTS%" >nul 2>&1
if errorlevel 1 (
    echo.>>"%HOSTS%"
    echo 127.0.0.1  nexus.local>>"%HOSTS%"
    echo 127.0.0.1  natumhub.local>>"%HOSTS%"
    echo [OK] Hosts atualizado com sucesso.
) else (
    echo [INFO] Hosts ja contem nexus.local.
)

ipconfig /flushdns >nul 2>&1
echo Concluido!
pause
