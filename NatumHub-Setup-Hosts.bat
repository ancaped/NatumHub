@echo off
:: Grava nexus.local no hosts (pede UAC uma vez).
:: Notebook (master):  NatumHub-Setup-Hosts.bat
::                     → 127.0.0.1  nexus.local
:: Outros PCs:         NatumHub-Setup-Hosts.bat 100.x.x.x
::                     → IP Tailscale do notebook  nexus.local
net session >nul 2>&1
if errorlevel 1 (
  echo Solicitando privilegio de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  exit /b 0
)

set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "IP=%~1"
if "%IP%"=="" set "IP=127.0.0.1"

echo.
echo Mapeando %IP%  nexus.local
echo.

powershell -NoProfile -Command ^
  "$hosts='%HOSTS%'; $ip='%IP%'; $name='nexus.local';" ^
  "$lines = Get-Content -LiteralPath $hosts -ErrorAction Stop;" ^
  "$kept = $lines | Where-Object { $_ -notmatch '(?i)(\s|^)(nexus|natumhub)\.local(\s|$)' };" ^
  "$kept += ''; $kept += ($ip + '  ' + $name);" ^
  "Set-Content -LiteralPath $hosts -Value $kept -Encoding ASCII;"

if errorlevel 1 (
  echo Falha ao gravar hosts.
  pause
  exit /b 1
)

ipconfig /flushdns >nul
echo Pronto. Teste: http://nexus.local:3001
echo Se o Firefox falhar: desligue DNS sobre HTTPS nas configuracoes.
pause
