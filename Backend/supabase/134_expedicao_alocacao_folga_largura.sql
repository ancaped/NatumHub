-- 134_expedicao_alocacao_folga_largura.sql
-- Folga operacional na largura útil dos paletes por estrutura (padrão 5 cm -> 95 cm úteis em palete de 100 cm).

ALTER TABLE expedicao_estruturas
    ADD COLUMN IF NOT EXISTS folga_largura_palete_cm DOUBLE PRECISION NOT NULL DEFAULT 5.0;
