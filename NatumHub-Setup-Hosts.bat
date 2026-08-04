@echo off
:: Garante 127.0.0.1 natumhub.local no hosts (pede UAC uma vez).
net session >nul 2>&1
if errorlevel 1 (
  echo Solicitando privilegio de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
findstr /i /c:"natumhub.local" "%HOSTS%" >nul 2>&1
if not errorlevel 1 (
  echo Ja existe: natumhub.local no hosts.
) else (
  echo.>>"%HOSTS%"
  echo 127.0.0.1  natumhub.local>>"%HOSTS%"
  echo Adicionado: 127.0.0.1  natumhub.local
)
ipconfig /flushdns >nul
echo.
echo Teste: http://natumhub.local:3001
echo Se o Firefox ainda falhar: Desligue "DNS sobre HTTPS" nas configuracoes.
pause
