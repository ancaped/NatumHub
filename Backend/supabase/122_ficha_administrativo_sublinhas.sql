-- 122_ficha_administrativo_sublinhas.sql
-- Ficha da Linha de Produtos: sublinhas. Aditiva e idempotente.

UPDATE mapa_modules SET
    detail = jsonb_set(detail, '{attention}', COALESCE(detail->'attention', '[]'::jsonb) || to_jsonb('Sublinhas (migração 121): uma linha pode ser sublinha de outra (config_linhas.linha_principal; um nível só, DEFAULT não entra). Por parâmetro (estoque ideal, abrir ordem, abrir produção, fator Z, atendimento) a sublinha herda o valor da principal (herda_*) ou tem valor próprio. As colunas de valor de config_linhas guardam sempre o valor EFETIVO: Produção e Compras seguem lendo config_linhas sem mudar; quem mantém essa cópia é administrativo/linhas/heranca.rs (propagar). Não grave multiplicador de sublinha por fora: use parametro_linha, definir_linha_principal ou classificar_linha'::text)),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND NOT (COALESCE(detail->'attention', '[]'::jsonb) @> to_jsonb('Sublinhas (migração 121): uma linha pode ser sublinha de outra (config_linhas.linha_principal; um nível só, DEFAULT não entra). Por parâmetro (estoque ideal, abrir ordem, abrir produção, fator Z, atendimento) a sublinha herda o valor da principal (herda_*) ou tem valor próprio. As colunas de valor de config_linhas guardam sempre o valor EFETIVO: Produção e Compras seguem lendo config_linhas sem mudar; quem mantém essa cópia é administrativo/linhas/heranca.rs (propagar). Não grave multiplicador de sublinha por fora: use parametro_linha, definir_linha_principal ou classificar_linha'::text));

UPDATE mapa_modules SET
    detail = jsonb_set(detail, '{attention}', COALESCE(detail->'attention', '[]'::jsonb) || to_jsonb('Inativar a linha principal esconde as sublinhas junto: visivel = visivel_proprio (escolha da própria linha) E principal ativa. Ações em 2 passos com auditoria: definir_linha_principal (POST .../linhas/principal), parametro_linha (POST .../linhas/parametro; a prévia diz quantos produtos mudam), GET .../linhas/heranca alimenta a tela. Ao virar sublinha os valores atuais continuam próprios; excluir a principal solta as sublinhas com os valores que já tinham'::text)),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND NOT (COALESCE(detail->'attention', '[]'::jsonb) @> to_jsonb('Inativar a linha principal esconde as sublinhas junto: visivel = visivel_proprio (escolha da própria linha) E principal ativa. Ações em 2 passos com auditoria: definir_linha_principal (POST .../linhas/principal), parametro_linha (POST .../linhas/parametro; a prévia diz quantos produtos mudam), GET .../linhas/heranca alimenta a tela. Ao virar sublinha os valores atuais continuam próprios; excluir a principal solta as sublinhas com os valores que já tinham'::text));
