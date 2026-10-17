@echo off
setlocal EnableDelayedExpansion
title Nexus - Restaurar Banco PostgreSQL
chcp 65001 >nul
cd /d "%~dp0.."

echo ========================================================
echo        NEXUS - RESTAURAR BANCO POSTGRESQL
echo ========================================================
echo.

if "%~1"=="" (
    echo Nenhum arquivo especificado. Procurando o backup mais recente em Saves\pg-backups...
    set "LATEST_BACKUP="
    for /f "delims=" %%F in ('dir /b /o-d "Saves\pg-backups\*.dump" 2^>nul') do (
        if not defined LATEST_BACKUP set "LATEST_BACKUP=Saves\pg-backups\%%F"
    )
    if defined LATEST_BACKUP (
        echo Backup mais recente encontrado: !LATEST_BACKUP!
        set "DUMP_FILE=!LATEST_BACKUP!"
    ) else (
        set /p "DUMP_FILE=Digite o caminho completo do arquivo .dump: "
    )
) else (
    set "DUMP_FILE=%~1"
)

if not exist "!DUMP_FILE!" (
    echo [ERRO] Arquivo nao encontrado: !DUMP_FILE!
    pause
    exit /b 1
)

echo.
set "PG_HOST=localhost"
set /p "INPUT_HOST=Host do PostgreSQL de destino [Pressione ENTER para localhost ou digite o IP do CasaOS]: "
if not "%INPUT_HOST%"=="" set "PG_HOST=%INPUT_HOST%"

set "PG_PORT=5432"
set "PG_USER=postgres"
set "PG_DB=natumhub"

echo.
echo Iniciando restauracao em %PG_HOST%:%PG_PORT% (banco: %PG_DB%)...
echo Arquivo: !DUMP_FILE!
echo.

pg_restore -U %PG_USER% -h %PG_HOST% -p %PG_PORT% -d %PG_DB% -v "!DUMP_FILE!"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo   RESTAURACAO CONCLUIDA COM SUCESSO!
    echo ========================================================
) else (
    echo.
    echo [AVISO] pg_restore finalizou com codigo %ERRORLEVEL%.
    echo (Nota: Avisos sobre objetos ja existentes sao normais se o banco ja possuia dados).
)

echo.
pause
