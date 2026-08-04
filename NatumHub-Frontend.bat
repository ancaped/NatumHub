@echo off
setlocal EnableDelayedExpansion
title Natum Hub - Navegador
cd /d "%~dp0"

echo ==============================================
echo        NATUM HUB - ABRIR NO NAVEGADOR
echo ==============================================
echo.

set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "URL_LOCAL=http://natumhub.local:3001"
set "URL_FALLBACK=http://127.0.0.1:3001"
set "URL=%URL_FALLBACK%"
set "HAS_HOSTS=0"

findstr /i /c:"natumhub.local" "%HOSTS%" >nul 2>&1
if not errorlevel 1 set "HAS_HOSTS=1"

if "%HAS_HOSTS%"=="0" (
  echo Entrada hosts ausente: 127.0.0.1  natumhub.local
  net session >nul 2>&1
  if errorlevel 1 (
    echo Sem privilegio de admin - nao foi possivel gravar hosts.
    echo Clique com o botao direito neste .bat e "Executar como administrador"
    echo   ou adicione manualmente em "%HOSTS%":
    echo   127.0.0.1  natumhub.local
    echo.
  ) else (
    echo.>>"%HOSTS%"
    echo 127.0.0.1  natumhub.local>>"%HOSTS%"
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
  echo Hosts: natumhub.local ja configurado.
  echo.
)

echo Verificando API em %URL_FALLBACK%/api/health ...
curl.exe -sf --max-time 3 "%URL_FALLBACK%/api/health" >nul 2>&1
if errorlevel 1 (
  echo AVISO: servidor nao respondeu em 127.0.0.1:3001.
  echo Rode NatumHub-Server.bat primeiro e deixe a janela aberta.
  echo.
) else (
  echo API OK em 127.0.0.1:3001.
  echo.
)

REM Preferir natumhub.local so se resolver e responder (Firefox com DoH pode ignorar hosts).
if "%HAS_HOSTS%"=="1" (
  curl.exe -sf --max-time 3 "%URL_LOCAL%/api/health" >nul 2>&1
  if not errorlevel 1 (
    set "URL=%URL_LOCAL%"
  ) else (
    echo natumhub.local nao respondeu ^(DNS/hosts/Firefox DoH^).
    echo Abrindo fallback %URL_FALLBACK%
    echo Dica Firefox: Configuracoes - Privacidade - DNS sobre HTTPS = Desligado
    echo   ^(ou use sempre %URL_FALLBACK% neste PC^)
    echo.
    set "URL=%URL_FALLBACK%"
  )
) else (
  set "URL=%URL_FALLBACK%"
)

echo Abrindo !URL!
start "" "!URL!"
exit /b 0
