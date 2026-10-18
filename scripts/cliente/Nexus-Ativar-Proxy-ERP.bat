@echo off
setlocal EnableDelayedExpansion
title Nexus - Ativar Proxy ERP para ZimaOS
chcp 65001 >nul

echo ========================================================
echo       NEXUS - ATIVAR PROXY ERP SQL SERVER
echo ========================================================
echo.

:: Solicita privilégio de Administrador se necessário
net session >nul 2>&1
if errorlevel 1 (
    echo Solicitando privilegios de Administrador...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

echo [1/3] Configurando PortProxy para o SQL Server (192.168.101.249:1433)...
netsh interface portproxy delete v4tov4 listenport=1433 listenaddress=0.0.0.0 >nul 2>&1
netsh interface portproxy add v4tov4 listenport=1433 listenaddress=0.0.0.0 connectport=1433 connectaddress=192.168.101.249

echo [2/3] Liberando porta 1433 no Firewall do Windows...
netsh advfirewall firewall delete rule name="Nexus SQL Proxy" >nul 2>&1
netsh advfirewall firewall add rule name="Nexus SQL Proxy" dir=in action=allow protocol=TCP localport=1433

echo [3/3] Testando conectividade local com o SQL Server (192.168.101.249:1433)...
powershell -NoProfile -Command "try { $client = New-Object System.Net.Sockets.TcpClient; $async = $client.BeginConnect('192.168.101.249', 1433, $null, $null); $wait = $async.AsyncWaitHandle.WaitOne(3000, $false); if ($wait -and $client.Connected) { $client.EndConnect($async); $client.Close(); Write-Host '>> SUCESSO: SQL Server alcancado e Proxy ativo na porta 1433!' -ForegroundColor Green } else { Write-Host '>> AVISO: Proxy configurado, mas o SQL Server nao respondeu em 3 segundos.' -ForegroundColor Yellow } } catch { Write-Host '>> ERRO ao testar conexao local: ' $_.Exception.Message -ForegroundColor Red }"

echo.
echo ========================================================
echo   PROXY ATIVADO COM SUCESSO!
echo ========================================================
echo O ZimaOS agora pode sincronizar com o ERP atraves deste PC.
echo.
pause
