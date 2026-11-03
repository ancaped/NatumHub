@echo off
rem ============================================================================
rem  Nexus - aponta o endereco nexus.local para o servidor ZimaOS (via Tailscale)
rem
rem  Uso (duplo clique; ele pede permissao de administrador sozinho):
rem    apontar_nexus_local_zimaos.bat          -> aponta nexus.local para o ZimaOS
rem    apontar_nexus_local_zimaos.bat voltar   -> restaura o hosts de antes
rem
rem  O que faz:
rem    1. guarda uma copia do arquivo hosts (hosts.antes-nexus-zimaos)
rem    2. tira as linhas antigas de nexus.local e grava "100.64.207.54 nexus.local"
rem    3. limpa o cache de DNS e testa http://nexus.local:3001/api/health
rem  Precisa do Tailscale instalado e conectado na conta da Natum.
rem ============================================================================
setlocal
set "IP_ZIMAOS=100.64.207.54"
set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "COPIA=%SystemRoot%\System32\drivers\etc\hosts.antes-nexus-zimaos"

rem --- pede administrador se ainda nao for ---
net session >nul 2>&1
if errorlevel 1 (
    echo Pedindo permissao de administrador...
    if "%~1"=="" (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    ) else (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%~1' -Verb RunAs"
    )
    exit /b
)

if /i "%~1"=="voltar" goto VOLTAR

echo.
echo === Nexus: apontando nexus.local para o ZimaOS (%IP_ZIMAOS%) ===
echo.

rem --- Tailscale instalado? ---
where tailscale >nul 2>&1
if errorlevel 1 (
    if not exist "%ProgramFiles%\Tailscale\tailscale.exe" (
        echo [AVISO] Tailscale nao encontrado neste computador.
        echo         Instale e entre na conta da Natum antes: https://tailscale.com/download
        echo.
    )
)

rem --- copia do hosts (so na primeira vez, para o "voltar" restaurar o original) ---
if not exist "%COPIA%" (
    copy /y "%HOSTS%" "%COPIA%" >nul
    if errorlevel 1 ( echo [ERRO] Nao consegui copiar o hosts. & goto FIM )
    echo [ok] Copia do hosts guardada em %COPIA%
) else (
    echo [ok] Copia do hosts ja existia: %COPIA%
)

rem --- tira as linhas de nexus.local e grava a nova ---
powershell -NoProfile -Command ^
  "$h = $env:HOSTS; $linhas = Get-Content -LiteralPath $h | Where-Object { $_ -notmatch '(^|\s)nexus\.local(\s|$)' };" ^
  "$linhas += '%IP_ZIMAOS%   nexus.local   # Nexus no ZimaOS (Tailscale)';" ^
  "Set-Content -LiteralPath $h -Value $linhas -Encoding ASCII"
if errorlevel 1 ( echo [ERRO] Nao consegui gravar o hosts. & goto FIM )
echo [ok] hosts atualizado: nexus.local -^> %IP_ZIMAOS%

ipconfig /flushdns >nul
echo [ok] Cache de DNS limpo

rem --- teste ---
echo.
echo Testando http://nexus.local:3001/api/health ...
curl -s -m 10 http://nexus.local:3001/api/health | findstr /c:"status" >nul
if errorlevel 1 (
    echo [AVISO] O Nexus nao respondeu. Confira se o Tailscale esta conectado e tente de novo.
) else (
    echo [ok] Nexus respondeu. Pode abrir http://nexus.local:3001 no navegador.
    echo      Se o navegador ainda abrir a versao antiga, feche e abra o navegador de novo.
)
goto FIM

:VOLTAR
echo.
if not exist "%COPIA%" ( echo [ERRO] Nao ha copia para restaurar: %COPIA% & goto FIM )
copy /y "%COPIA%" "%HOSTS%" >nul
if errorlevel 1 ( echo [ERRO] Nao consegui restaurar o hosts. & goto FIM )
ipconfig /flushdns >nul
echo [ok] hosts restaurado como estava antes.

:FIM
echo.
pause
endlocal
