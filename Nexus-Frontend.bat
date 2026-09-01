@echo off
setlocal EnableDelayedExpansion
title Nexus - Navegador
cd /d "%~dp0"

echo ==============================================
echo           NEXUS - ABRIR NO NAVEGADOR
echo ==============================================
echo.

set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "URL_LOCAL=http://nexus.local:3001"
set "URL_FALLBACK=http://127.0.0.1:3001"
set "URL=%URL_FALLBACK%"
set "HAS_HOSTS=0"

findstr /i /c:"nexus.local" "%HOSTS%" >nul 2>&1
if not errorlevel 1 set "HAS_HOSTS=1"

if "%HAS_HOSTS%"=="0" (
  echo Entrada hosts ausente: 127.0.0.1  nexus.local
  net session >nul 2>&1
  if errorlevel 1 (
    echo Sem privilegio de admin - nao foi possivel gravar hosts.
    echo Clique com o botao direito neste .bat e "Executar como administrador"
    echo   ou adicione manualmente em "%HOSTS%":
    echo   127.0.0.1  nexus.local
    echo.
  ) else (
    echo.>>"%HOSTS%"
    echo 127.0.0.1  nexus.local>>"%HOSTS%"
    if errorlevel 1 (
      echo Falha ao gravar hosts.
    ) else (
      echo Hosts atualizado.
      set "HAS_HOSTS=1"
      ipconfig /flushdns >nul 2>&1
    )
  )
  echo.
) else (
  echo Hosts: nexus.local ja configurado.
  echo.
)

echo Verificando API em %URL_FALLBACK%/api/health ...
curl.exe -sf --max-time 3 "%URL_FALLBACK%/api/health" >nul 2>&1
if errorlevel 1 (
  echo AVISO: servidor nao respondeu em 127.0.0.1:3001.
  echo Inicie o Nexus-Server.bat primeiro.
  echo.
) else (
  echo API OK em 127.0.0.1:3001.
  echo.
)

if "%HAS_HOSTS%"=="1" (
  curl.exe -sf --max-time 3 "%URL_LOCAL%/api/health" >nul 2>&1
  if not errorlevel 1 (
    set "URL=%URL_LOCAL%"
  )
)

echo Abrindo %URL% no navegador...
start "" "%URL%"

pause
