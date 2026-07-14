# Schema PostgreSQL — NatumHub

DDL canônico: `001_natumhub_schema.sql` (Postgres puro; local ou Supabase).
Almoxarifado: `002_almoxarifado.sql`, `003_estoque_ops.sql`, `004_almox_erp_super.sql` — aplicar com owner; `GRANT` ao role da API. O app **não** cria DDL em runtime.
Kits: `005_kit_composicao.sql`, `006_kit_composicao_item_fk.sql`.

## Configuração

Preferido: `Saves/postgres.env` (não commitar). Exemplo: `Saves/postgres.env.example`.

Legado ainda aceito: `Saves/supabase.env`.

```
DATABASE_URL=postgresql://usuario:SENHA@127.0.0.1:5432/natumhub
```

No **PC Principal** o Postgres é **obrigatório** (dia a dia). Terminais não conectam ao banco.

Migração / restore: `ContextoIA/banco-dados/migracao_postgres.md`.
Instalação: `ContextoIA/devops/instalacao_postgres_master.md`.

## Como popular o banco

| Fonte | Como |
|-------|------|
| Supervisor / operadores | Setup do app (1ª abertura no master) |
| Itens, produtos, estoque, pedidos, NFs, etc. | Sync ERP: `cd Backend && cargo run --bin run_sync` ou `POST /api/import/sync` |

Detalhes sync: `erp-import/README.md`.
