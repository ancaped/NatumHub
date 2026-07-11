# Módulo Financeiro — Tiny ERP

## Visão

Espelho local de **contas a pagar** e **contas a receber** do Tiny ERP, com dashboard de posição líquida, aging, projeção semanal e fluxo mensal.

## Arquivos

| Arquivo | Papel |
|---------|--------|
| `mod.rs` | Rotas Axum |
| `client.rs` | Cliente HTTP da API Tiny (paginação + erros) |
| `handlers.rs` | Sync, listas, dashboard, token |
| `models.rs` | DTOs, parse monetário, ofuscação de token |

## Rotas

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/api/financeiro/status` | Token configurado, última sync, contagens |
| POST | `/api/financeiro/token` | Salva token (ofuscado no SQLite) |
| POST | `/api/financeiro/sync` | Baixa período + reconcilia IDs |
| GET | `/api/financeiro/contas` | Lista paginada (`tipo`, filtros, `page`, `limit`) |
| GET | `/api/financeiro/fluxo` | Dashboard completo (totais, aging, tops, semanas) |

## Settings

- `tiny_api_token` — token ofuscado (`enc1:` + base64 XOR)
- `tiny_financial_last_sync` — timestamp última sync
- `tiny_financial_sync_start` / `_end` — último intervalo sincronizado

## Tabelas

`tiny_contas_receber`, `tiny_contas_pagar` + índices em vencimento, situação e nome.

## Reconciliação

No intervalo de vencimento da sync:

1. Upsert de todos os IDs retornados
2. `DELETE` de IDs do intervalo que **não** voltaram na API

## Segurança

Token nunca é re-enviado ao frontend após salvar. Ofuscação local não substitui vault corporativo; protege leitura casual do `data.db`.
