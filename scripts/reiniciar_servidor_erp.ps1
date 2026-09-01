# ==============================================================================
# Script: reiniciar_servidor_erp.ps1
# Finalidade: Reiniciar remotamente o servidor do ERP (192.168.101.249) via SQL Server
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Clear-Host

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "            REINICIALIZACAO REMOTA DO SERVIDOR ERP               " -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

$serverHost = "192.168.101.249"
$serverPort = 1433
$dbUser     = "sa"
$dbPass     = "byteonDS2015"
$database   = "master"

Write-Host "Alvo: " -NoNewline
Write-Host "$($serverHost):$($serverPort) ($($dbUser))" -ForegroundColor White
Write-Host ""
Write-Host "[ATENCAO] Esta acao ira reiniciar o Windows da maquina do ERP." -ForegroundColor Red
Write-Host "          Todas as conexoes ativas serao desconectadas." -ForegroundColor Red
Write-Host ""

# Confirmacao do usuario
$confirm = Read-Host "Tem certeza que deseja reiniciar o servidor agora? Digite 'S' para confirmar"
if ($confirm -notmatch '^(s|sim|y|yes)$') {
    Write-Host ""
    Write-Host "Operacao CANCELADA pelo usuario." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "Conectando ao SQL Server em $serverHost..." -ForegroundColor Cyan

$connStr = "Server=$serverHost,$serverPort;Database=$database;User Id=$dbUser;Password=$dbPass;TrustServerCertificate=True;Timeout=15;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)

try {
    $conn.Open()
    Write-Host "Conexao estabelecida com sucesso!" -ForegroundColor Green

    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = 30

    Write-Host "Habilitando configuracoes no SQL Server..." -ForegroundColor Gray
    $cmd.CommandText = @"
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE WITH OVERRIDE;
EXEC sp_configure 'xp_cmdshell', 1;
RECONFIGURE WITH OVERRIDE;
"@
    [void]$cmd.ExecuteNonQuery()

    Write-Host "Enviando comando de reinicializacao para o Windows do servidor..." -ForegroundColor Yellow
    $cmd.CommandText = @"
EXEC xp_cmdshell 'shutdown /r /t 5 /c "Reinicio remoto solicitado via NatumHub" /f';
"@
    [void]$cmd.ExecuteNonQuery()

    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Green
    Write-Host " COMANDO ENVIADO COM SUCESSO! O SERVIDOR ESTA REINICIANDO AGORA. " -ForegroundColor Green
    Write-Host "=================================================================" -ForegroundColor Green
    Write-Host "Tempo estimado para retorno dos servicos: 1 a 3 minutos." -ForegroundColor White
    Write-Host ""

} catch {
    Write-Host ""
    Write-Host "ERRO ao enviar comando de reinicio:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
} finally {
    if ($conn.State -eq 'Open') {
        $conn.Close()
    }
}
