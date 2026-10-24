-- Movimentação de um insumo como a tela do DGI mostra (Gerenciador de Ordens), testado pelo Edson em 2026-10-24.
-- Fontes: ENTDEVINS (acertos/ajustes/saídas manuais), Lotes_Baixas (reservado por lote) e Recebe_Insumos (entrada por NF).
-- Base para preencher o passo O (O-movimentos-insumos.sql) e o histórico por item no Nexus. Ver ai-memory concepts/erp-movimentacao-insumos.md.
SET NOCOUNT ON;
DECLARE @ins nvarchar(20)='9.15.064', @de date='2026-10-01';
SELECT TOP 15 * FROM (
 SELECT CONVERT(date,e.dRegistro) dMov, e.cHora hora, 'ENTDEVINS' origem, e.cTipoES ES, CAST(e.mObservac AS nvarchar(200)) tipo, e.nQtde qtde, NULL lote, e.cLoteFornec loteF, e.cOperador usuario
   FROM ENTDEVINS e WHERE e.cReferencia=@ins AND e.dRegistro>=@de
 UNION ALL
 SELECT CONVERT(date,b.dLog), CONVERT(char(5),b.dLog,108), 'Lotes_Baixas','S','RESERVADO LOTE '+CAST(b.nLote AS varchar), b.nQtde, b.nLote, b.cLoteFornec, b.cUsuario
   FROM Lotes_Baixas b WHERE b.cReferencia=@ins AND b.dLog>=@de AND b.dLog<DATEADD(day,1,GETDATE())
 UNION ALL
 SELECT CONVERT(date,r.dEntrada), r.cEntrada, 'Recebe_Insumos','E','ENTRADA NF '+CAST(r.NOTA AS varchar)+' '+r.cNomeF, r.QUANTIDADE, NULL, r.cLoteFornec, r.cUsuario
   FROM Recebe_Insumos r WHERE r.cReferencia=@ins AND r.dEntrada>=@de AND r.cStatus<>'CA'
) m ORDER BY dMov DESC, hora DESC;
