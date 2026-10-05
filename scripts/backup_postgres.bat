@echo off
setlocal EnableDelayedExpansion
title Nexus - Backup do Banco PostgreSQL
chcp 65001 >nul
cd /d "%~dp0.."

echo ========================================================
echo         NEXUS - BACKUP DO BANCO POSTGRESQL
echo ========================================================
echo.

:: Carrega variaveis ou define padroes
set "PG_HOST=localhost"
set "PG_PORT=5432"
set "PG_USER=postgres"
set "PG_DB=natumhub"

if exist "Saves\postgres.env" (
    echo [1/3] Lendo configuracao de conexao em Saves\postgres.env...
    for /f "usebackq tokens=1,* delims==" %%A in ("Saves\postgres.env") do (
        if "%%A"=="DATABASE_URL" (
            set "RAW_URL=%%B"
        )
    )
)

:: Garante pasta de destino
if not exist "Saves\pg-backups" (
    mkdir "Saves\pg-backups"
)

:: Gera carimbo de data/hora
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set "LDT=%%I"
if not defined LDT (
    set "TIMESTAMP=%date:~6,4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
    set "TIMESTAMP=!TIMESTAMP: =0!"
) else (
    set "TIMESTAMP=%LDT:~0,8%_%LDT:~8,6%"
)

set "BACKUP_FILE=%~dp0..\Saves\pg-backups\nexus_backup_%TIMESTAMP%.dump"

echo [2/3] Executando pg_dump (formato comprimido custom)...
echo       Destino: %BACKUP_FILE%
echo.

pg_dump -U %PG_USER% -h %PG_HOST% -p %PG_PORT% -d %PG_DB% -F c -b -v -f "%BACKUP_FILE%"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo   BACKUP CONCLUIDO COM SUCESSO!
    echo ========================================================
    echo Arquivo gerado:
    echo %BACKUP_FILE%
    echo.
    echo Guarde este arquivo ou copie-o para o servidor Linux / CasaOS.
) else (
    echo.
    echo [ERRO] Falha ao gerar o backup (Codigo de saida: %ERRORLEVEL%).
    echo Certifique-se de que o PostgreSQL local esta rodando e que o pg_dump esta no PATH.
)

echo.
pause
