-- 083_linhas_56_60.sql
-- Cadastra as linhas dos prefixos 56 e 60 (Hair Extrattus), que caíam em "Outros/Geral".
-- Mesmo padrão das linhas 15 e 9.15: prefixo próprio, nome editável na Definição de Linhas.
-- Idempotente: não mexe em linha já cadastrada nem em ajuste manual de produto.
INSERT INTO config_linhas (linha_prefix, nome_linha, estoque_ideal_mult, abrir_ordem_mult, abrir_prod_mult, fator_seguranca_z, visivel) VALUES
('56', 'Hair Extrattus 56', 3.2, 1.6, 1.2, 0.0, 1),
('60', 'Hair Extrattus 60', 3.2, 1.6, 1.2, 0.0, 1)
ON CONFLICT (linha_prefix) DO NOTHING;
