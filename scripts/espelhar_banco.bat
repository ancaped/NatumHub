@echo off
chcp 65001 >nul
echo ============================================================
echo   Nexus - Sincronizar Banco Dev (Espelhar da Produção)
echo ============================================================
echo.
echo Este script aciona o espelhamento do banco de Produção (5432)
echo para o banco de Desenvolvimento (5433) no servidor CasaOS.
echo.

set /p SERVER_IP="Informe o IP do servidor CasaOS (ou pressione ENTER para nexus.local): "
if "%SERVER_IP%"=="" set SERVER_IP=nexus.local

echo Conectando ao servidor %SERVER_IP% via SSH para rodar o espelhamento...
ssh root@%SERVER_IP% "bash /DATA/AppData/nexus/scripts/espelhar_banco.sh 2>/dev/null || docker exec -i nexus-postgres-prod pg_dump -U postgres -d natumhub -F c | docker exec -i nexus-postgres-dev pg_restore -U postgres -d natumhub_dev --clean --if-exists"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCESSO] Banco de desenvolvimento sincronizado com a Produção!
) else (
    echo.
    echo [AVISO] Não foi possível rodar via SSH automático.
    echo Você pode rodar diretamente no terminal do CasaOS com:
    echo   bash scripts/espelhar_banco.sh
)

echo.
pause
