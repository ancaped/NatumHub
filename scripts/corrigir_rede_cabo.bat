@echo off
chcp 65001 >nul
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Solicitando permissoes de Administrador...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ========================================================
echo       CORRIGINDO CONEXAO DE INTERNET VIA CABO
echo ========================================================
echo.
echo 1. Habilitando DHCP (IP automatico) no Ethernet 2...
netsh interface ipv4 set address name="Ethernet 2" source=dhcp

echo 2. Habilitando DNS automatico no Ethernet 2...
netsh interface ipv4 set dnsservers name="Ethernet 2" source=dhcp

echo 3. Renovando endereco IP...
ipconfig /renew "Ethernet 2"

echo.
echo ========================================================
echo       CONCLUIDO COM SUCESSO!
echo ========================================================
echo.
pause
