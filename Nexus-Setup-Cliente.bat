@echo off
setlocal EnableDelayedExpansion
title Nexus - Configurar PC Cliente (Tailscale)
chcp 65001 >nul

echo ========================================================
echo       NEXUS - CONFIGURAR CONEXAO DO PC CLIENTE
echo ========================================================
echo.

:: Solicita privilegio de Administrador se necessario
net session >nul 2>&1
if errorlevel 1 (
    echo Solicitando privilegios de Administrador...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "SERVER_IP=100.120.161.52"

echo [1/4] Removendo entradas antigas ou incorretas (127.0.0.1) do hosts...
powershell -NoProfile -Command "$content = Get-Content '%HOSTS%' | Where-Object { $_ -notmatch 'nexus\.local' -and $_ -notmatch 'natumhub\.local' }; Set-Content -Path '%HOSTS%' -Value $content -Encoding UTF8"

echo [2/4] Adicionando apontamento correto para o servidor (%SERVER_IP%)...
echo.>>"%HOSTS%"
echo %SERVER_IP%  nexus.local>>"%HOSTS%"
echo %SERVER_IP%  natumhub.local>>"%HOSTS%"

echo [3/4] Limpando cache de DNS...
ipconfig /flushdns >nul 2>&1

echo [4/4] Testando conexao com o servidor Nexus em %SERVER_IP%:3001...
powershell -NoProfile -Command "try { $res = Invoke-WebRequest -Uri 'http://%SERVER_IP%:3001/api/server-manager/status' -TimeoutSec 4 -UseBasicParsing; if ($res.StatusCode -eq 200) { Write-Host '>> SUCESSO: Servidor Nexus respondendo normalmente!' -ForegroundColor Green } } catch { Write-Host '>> AVISO: Nao foi possivel conectar ao servidor via Tailscale (%SERVER_IP%). Verifique se o Tailscale esta conectado.' -ForegroundColor Yellow }"

echo.
echo ========================================================
echo   CONFIGURACAO CONCLUIDA!
echo ========================================================
echo.
echo Voce pode acessar o sistema no navegador atraves de:
echo   - http://nexus.local:3001
echo   - http://%SERVER_IP%:3001
echo.
set /p ABRIR="Deseja abrir o Nexus no navegador agora? (S/N): "
if /i "%ABRIR%"=="S" (
    start "" "http://nexus.local:3001"
)

pause
