@echo off
rem ============================================================================
rem  Nexus - compartilha a impressora de etiquetas deste PC para o servidor Nexus (ZimaOS)
rem
rem  Uso (duplo clique; ele pede permissao de administrador sozinho):
rem    compartilhar_impressora_nexus.bat           -> prepara o PC e compartilha a impressora
rem    compartilhar_impressora_nexus.bat desfazer  -> tira o compartilhamento e a regra de firewall
rem
rem  O que faz:
rem    1. liga o recurso do Windows "Servico de Impressao LPD" (porta TCP 515)
rem    2. deixa o servico LPDSVC automatico e iniciado
rem    3. libera a porta 515 no firewall (regra "Nexus LPD")
rem    4. mostra as impressoras, voce escolhe uma e o nome do compartilhamento
rem    5. mostra o que digitar em Impressoras, no Nexus (PC e nome do compartilhamento)
rem  O Nexus manda a etiqueta pronta (ZPL/EPL) por LPD; nao precisa de driver nem de programa extra.
rem ============================================================================
setlocal enabledelayedexpansion
set "REGRA=Nexus LPD"

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

if /i "%~1"=="desfazer" goto DESFAZER

echo.
echo === Nexus: preparando este PC para receber etiquetas do servidor ===
echo.

rem --- 1. recurso LPD do Windows ---
echo Ligando o Servico de Impressao LPD (pode demorar alguns minutos)...
dism /online /enable-feature /featurename:Printing-Foundation-Features /all /norestart >nul
set "RC1=!errorlevel!"
dism /online /enable-feature /featurename:Printing-Foundation-LPDPrintService /all /norestart >nul
set "RC2=!errorlevel!"
set "PRECISA_REINICIAR="
if "!RC1!"=="3010" set "PRECISA_REINICIAR=1"
if "!RC2!"=="3010" set "PRECISA_REINICIAR=1"
if not "!RC1!"=="0" if not "!RC1!"=="3010" ( echo [ERRO] Nao consegui ligar Printing-Foundation-Features ^(codigo !RC1!^). & goto FIM )
if not "!RC2!"=="0" if not "!RC2!"=="3010" ( echo [ERRO] Nao consegui ligar o Servico de Impressao LPD ^(codigo !RC2!^). & goto FIM )
echo [ok] Recurso do Windows ligado

rem --- 2. servico ---
sc config LPDSVC start= auto >nul 2>&1
net start LPDSVC >nul 2>&1
sc query LPDSVC | findstr /c:"RUNNING" >nul
if errorlevel 1 (
    echo [AVISO] O servico LPDSVC ainda nao esta rodando.
    if defined PRECISA_REINICIAR echo         O Windows pediu para reiniciar: reinicie o PC e rode este script de novo.
) else (
    echo [ok] Servico LPDSVC automatico e iniciado
)

rem --- 3. firewall (apaga so a regra nossa, para nao duplicar) ---
netsh advfirewall firewall delete rule name="%REGRA%" >nul 2>&1
netsh advfirewall firewall add rule name="%REGRA%" dir=in action=allow protocol=TCP localport=515 >nul
if errorlevel 1 ( echo [ERRO] Nao consegui liberar a porta 515 no firewall. & goto FIM )
echo [ok] Porta TCP 515 liberada no firewall ^(regra "%REGRA%"^)

rem --- 4. escolher a impressora ---
call :LISTAR
if "!N!"=="0" ( echo [ERRO] Nenhuma impressora instalada neste PC. & goto FIM )
set "ESC="
set /p "ESC=Numero da impressora de etiquetas: "
set "NX_PRN=!PRN%ESC%!"
if "!NX_PRN!"=="" ( echo [ERRO] Numero invalido. & goto FIM )

set "PADRAO="
for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "(($env:NX_PRN -replace '[^A-Za-z0-9]+','_').Trim('_')).ToUpper()"`) do set "PADRAO=%%S"
if "!PADRAO!"=="" set "PADRAO=ETIQUETAS"
set "NX_SHARE="
set /p "NX_SHARE=Nome do compartilhamento [!PADRAO!]: "
if "!NX_SHARE!"=="" set "NX_SHARE=!PADRAO!"
set "NX_SHARE=!NX_SHARE: =_!"

powershell -NoProfile -Command "Set-Printer -Name $env:NX_PRN -Shared $true -ShareName $env:NX_SHARE"
if errorlevel 1 ( echo [ERRO] Nao consegui compartilhar a impressora. & goto FIM )
echo [ok] Impressora compartilhada como !NX_SHARE!

rem --- 5. o que digitar no Nexus ---
set "IP_LAN="
set "IP_TS="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and $_.InterfaceAlias -notlike '*Tailscale*' } | Select-Object -First 1).IPAddress"`) do set "IP_LAN=%%I"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like '*Tailscale*' } | Select-Object -First 1).IPAddress"`) do set "IP_TS=%%I"

echo.
echo ============================================================
echo  Em Impressoras, no Nexus, cadastre assim:
echo.
echo    Conexao: Compartilhada num PC Windows
if defined IP_TS (
    echo    PC: !IP_LAN!   ^(Tailscale: !IP_TS!^)
) else (
    echo    PC: !IP_LAN!
)
echo    Nome do compartilhamento: !NX_SHARE!
echo    Linguagem: ZPL ^(ou EPL^)   DPI: 203 para GC420t
echo ============================================================
if defined PRECISA_REINICIAR (
    echo.
    echo [AVISO] Reinicie o PC para terminar de ligar o Servico de Impressao LPD.
)
goto FIM

:DESFAZER
echo.
echo === Nexus: desfazendo o compartilhamento ===
echo.
call :LISTAR
if "!N!"=="0" ( echo [ERRO] Nenhuma impressora instalada neste PC. & goto FIM )
set "ESC="
set /p "ESC=Numero da impressora para parar de compartilhar: "
set "NX_PRN=!PRN%ESC%!"
if "!NX_PRN!"=="" ( echo [ERRO] Numero invalido. & goto FIM )
powershell -NoProfile -Command "Set-Printer -Name $env:NX_PRN -Shared $false"
if errorlevel 1 ( echo [ERRO] Nao consegui tirar o compartilhamento. ) else ( echo [ok] Compartilhamento removido )
netsh advfirewall firewall delete rule name="%REGRA%" >nul 2>&1
echo [ok] Regra de firewall "%REGRA%" removida ^(o recurso LPD do Windows continua instalado^)
goto FIM

rem --- lista as impressoras numeradas: PRN1.. e N ---
:LISTAR
set "N=0"
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "Get-Printer | ForEach-Object { $_.Name }"`) do (
    set /a N+=1
    set "PRN!N!=%%P"
)
echo Impressoras neste PC:
for /l %%i in (1,1,!N!) do echo   %%i. !PRN%%i!
echo.
exit /b 0

:FIM
echo.
pause
endlocal
