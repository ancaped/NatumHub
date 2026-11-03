@echo off
rem ============================================================================
rem  Nexus - prepara um PC Windows da fabrica para usar o Nexus no ZimaOS
rem
rem  Uso (duplo clique; ele pede permissao de administrador sozinho):
rem    configurar_pc_nexus.bat          -> aponta nexus.local e compartilha as impressoras
rem    configurar_pc_nexus.bat voltar   -> restaura o hosts e tira os compartilhamentos feitos por ele
rem
rem  O que faz:
rem    1. aponta http://nexus.local:3001 para o ZimaOS (100.64.207.54, via Tailscale), com copia do hosts
rem    2. liga o recurso do Windows "Servico de Impressao LPD" (porta TCP 515) e libera a porta no firewall
rem    3. compartilha todas as impressoras instaladas neste PC (etiquetas, A4...), menos as virtuais (PDF, XPS, OneNote...)
rem    4. mostra o que cadastrar em Impressoras, no Nexus (PC e nome do compartilhamento de cada uma)
rem  O servidor manda a etiqueta pronta (ZPL/EPL) para a impressora compartilhada; nao precisa de programa extra.
rem  Precisa do Tailscale instalado e conectado na conta da Natum.
rem ============================================================================
setlocal
set "IP_ZIMAOS=100.64.207.54"
set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "COPIA=%SystemRoot%\System32\drivers\etc\hosts.antes-nexus-zimaos"
set "REGRA=Nexus LPD"
set "PASTA=%ProgramData%\Nexus"
set "LISTA=%ProgramData%\Nexus\impressoras-compartilhadas.txt"

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
echo === Nexus: preparando este PC (servidor no ZimaOS, %IP_ZIMAOS%) ===
echo.

rem ---------------------------------------------------------------- 1. nexus.local
where tailscale >nul 2>&1
if errorlevel 1 if not exist "%ProgramFiles%\Tailscale\tailscale.exe" (
    echo [AVISO] Tailscale nao encontrado neste computador.
    echo         Instale e entre na conta da Natum antes: https://tailscale.com/download
    echo.
)

if not exist "%COPIA%" (
    copy /y "%HOSTS%" "%COPIA%" >nul
    if errorlevel 1 ( echo [ERRO] Nao consegui copiar o hosts. & goto FIM )
    echo [ok] Copia do hosts guardada em %COPIA%
) else (
    echo [ok] Copia do hosts ja existia: %COPIA%
)

powershell -NoProfile -Command ^
  "$h = $env:HOSTS; $linhas = Get-Content -LiteralPath $h | Where-Object { $_ -notmatch '(^|\s)nexus\.local(\s|$)' };" ^
  "$linhas += '%IP_ZIMAOS%   nexus.local   # Nexus no ZimaOS (Tailscale)';" ^
  "Set-Content -LiteralPath $h -Value $linhas -Encoding ASCII"
if errorlevel 1 ( echo [ERRO] Nao consegui gravar o hosts. & goto FIM )
echo [ok] hosts atualizado: nexus.local -^> %IP_ZIMAOS%
ipconfig /flushdns >nul
echo [ok] Cache de DNS limpo

curl -s -m 10 http://nexus.local:3001/api/health | findstr /c:"status" >nul
if errorlevel 1 (
    echo [AVISO] O Nexus nao respondeu. Confira se o Tailscale esta conectado e tente de novo.
) else (
    echo [ok] Nexus respondeu em http://nexus.local:3001
)

rem ---------------------------------------------------------------- 2. LPD
echo.
echo Ligando o Servico de Impressao LPD (pode demorar alguns minutos)...
set "PRECISA_REINICIAR="
dism /online /enable-feature /featurename:Printing-Foundation-Features /all /norestart >nul
set "RC1=%errorlevel%"
dism /online /enable-feature /featurename:Printing-Foundation-LPDPrintService /all /norestart >nul
set "RC2=%errorlevel%"
if "%RC1%"=="3010" set "PRECISA_REINICIAR=1"
if "%RC2%"=="3010" set "PRECISA_REINICIAR=1"
if not "%RC1%"=="0" if not "%RC1%"=="3010" ( echo [ERRO] Nao consegui ligar Printing-Foundation-Features ^(codigo %RC1%^). & goto FIM )
if not "%RC2%"=="0" if not "%RC2%"=="3010" ( echo [ERRO] Nao consegui ligar o Servico de Impressao LPD ^(codigo %RC2%^). & goto FIM )
echo [ok] Recurso do Windows ligado

sc config LPDSVC start= auto >nul 2>&1
net start LPDSVC >nul 2>&1
sc query LPDSVC | findstr /c:"RUNNING" >nul
if errorlevel 1 (
    echo [AVISO] O servico LPDSVC ainda nao esta rodando.
    if defined PRECISA_REINICIAR echo         O Windows pediu para reiniciar: reinicie o PC e rode este script de novo.
) else (
    echo [ok] Servico LPDSVC automatico e iniciado
)

netsh advfirewall firewall delete rule name="%REGRA%" >nul 2>&1
netsh advfirewall firewall add rule name="%REGRA%" dir=in action=allow protocol=TCP localport=515 >nul
if errorlevel 1 ( echo [ERRO] Nao consegui liberar a porta 515 no firewall. & goto FIM )
echo [ok] Porta TCP 515 liberada no firewall ^(regra "%REGRA%"^)

rem ---------------------------------------------------------------- 3. impressoras
rem Compartilha as impressoras instaladas aqui (as de outro PC e as virtuais ficam de fora). Quem ja estava
rem compartilhada mantem o nome. As que este script compartilhou vao para a lista, para o "voltar" desfazer so elas.
echo.
echo Compartilhando as impressoras deste PC...
if not exist "%PASTA%" mkdir "%PASTA%"
powershell -NoProfile -Command ^
  "$virtuais = 'OneNote|XPS|PDF|Fax|AnyDesk|RustDesk|Send To|Enviar para';" ^
  "$novas = @(); $tabela = @();" ^
  "Get-Printer | Where-Object { $_.Type -eq 'Local' -and $_.Name -notmatch $virtuais } | ForEach-Object {" ^
  "  $p = $_;" ^
  "  if ($p.Shared -and $p.ShareName) { $nome = $p.ShareName } else { $nome = (($p.Name -replace '[^A-Za-z0-9]+','_').Trim('_')).ToUpper() };" ^
  "  try {" ^
  "    if (-not $p.Shared) { Set-Printer -Name $p.Name -Shared $true -ShareName $nome -ErrorAction Stop; $novas += $p.Name };" ^
  "    $tabela += ('   ' + $nome + '   <-  ' + $p.Name)" ^
  "  } catch { Write-Host ('[ERRO] ' + $p.Name + ': ' + $_.Exception.Message) }" ^
  "};" ^
  "if ($novas.Count -gt 0) { Add-Content -LiteralPath $env:LISTA -Value $novas -Encoding UTF8 };" ^
  "if ($tabela.Count -eq 0) { Write-Host '[AVISO] Nenhuma impressora fisica instalada neste PC.' } else { Write-Host ('[ok] ' + $tabela.Count + ' impressora(s) compartilhada(s)'); Set-Content -LiteralPath ($env:PASTA + '\tabela.txt') -Value $tabela -Encoding UTF8 }"

rem ---------------------------------------------------------------- 4. o que cadastrar
set "IP_LAN="
set "IP_TS="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and $_.InterfaceAlias -notlike '*Tailscale*' } | Select-Object -First 1).IPAddress"`) do set "IP_LAN=%%I"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like '*Tailscale*' } | Select-Object -First 1).IPAddress"`) do set "IP_TS=%%I"
set "IP_PC=%IP_TS%"
if "%IP_PC%"=="" set "IP_PC=%IP_LAN%"

echo.
echo ============================================================
echo  Em Impressoras, no Nexus, cadastre cada impressora assim:
echo.
echo    Conexao: Compartilhada num PC Windows
echo    PC: %IP_PC%     ^(rede interna: %IP_LAN%^)
echo    Nome do compartilhamento:
if exist "%PASTA%\tabela.txt" type "%PASTA%\tabela.txt"
echo.
echo    Etiquetas Zebra: Linguagem ZPL ^(ou EPL^), DPI 203 na GC420t
echo ============================================================
if defined PRECISA_REINICIAR (
    echo.
    echo [AVISO] Reinicie o PC para terminar de ligar o Servico de Impressao LPD.
)
goto FIM

rem ---------------------------------------------------------------- voltar
:VOLTAR
echo.
echo === Nexus: desfazendo ===
echo.
if exist "%COPIA%" (
    copy /y "%COPIA%" "%HOSTS%" >nul
    if errorlevel 1 ( echo [ERRO] Nao consegui restaurar o hosts. ) else ( echo [ok] hosts restaurado como estava antes. )
    ipconfig /flushdns >nul
) else (
    echo [ok] Nao ha copia do hosts para restaurar.
)
if exist "%LISTA%" (
    powershell -NoProfile -Command ^
      "Get-Content -LiteralPath $env:LISTA | Sort-Object -Unique | ForEach-Object { try { Set-Printer -Name $_ -Shared $false -ErrorAction Stop; Write-Host ('[ok] Compartilhamento removido: ' + $_) } catch { Write-Host ('[AVISO] ' + $_) } }"
    del "%LISTA%" >nul 2>&1
) else (
    echo [ok] Nenhum compartilhamento feito por este script.
)
netsh advfirewall firewall delete rule name="%REGRA%" >nul 2>&1
echo [ok] Regra de firewall "%REGRA%" removida ^(o recurso LPD do Windows continua instalado^)

:FIM
echo.
pause
endlocal
