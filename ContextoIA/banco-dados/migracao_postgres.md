# Migração PostgreSQL (Supabase → local / LAN)

O NatumHub usa **Postgres puro** via `DATABASE_URL`. Não depende de Auth/Realtime/Storage do Supabase no fluxo do hub. Migrar = copiar o banco + apontar o master para a nova URL.

## Configuração no app

Ordem de resolução ([`Backend/src/core/pg_db.rs`](../../Backend/src/core/pg_db.rs)):

1. Variável de ambiente `DATABASE_URL`
2. `Saves/postgres.env` (**preferido**)
3. `Saves/supabase.env` (legado)

Exemplo: `Saves/postgres.env.example`. Schema DDL: `Backend/supabase/001_natumhub_schema.sql`.

PCs secundários falam só com a API do master (`:3001`) — **não** precisam do Postgres direto.

## Passo a passo (sem perder dados)

### 1. Postgres no PC da empresa

- PostgreSQL 15+ (mesma major do origem, se possível).
- Banco vazio, ex.: `natumhub`, usuário com permissão.
- Porta `5432` só na LAN (firewall). Preferir o mesmo PC do master.

### 2. Dump na origem (Supabase)

Horário de baixo uso; idealmente sem writes no Hub durante o dump.

```bash
pg_dump "postgresql://..." --format=custom --no-owner --no-acl -f natumhub.dump
```

Use a connection string **Session** (`:5432`), não Transaction pooler (`:6543`).

### 3. Restore no destino

```bash
pg_restore -h IP_DO_PC -U postgres -d natumhub --no-owner --no-acl natumhub.dump
```

Erros de roles (`supabase_admin`, etc.) podem ser ignorados se schema + dados entrarem.

### 4. Cutover no NatumHub

Em `Saves/postgres.env` no PC **master**:

```env
DATABASE_URL=postgresql://natum:SENHA@127.0.0.1:5432/natumhub
```

Reiniciar o backend / app master. Em Configurações → Conexão PostgreSQL, conferir host mascarado e latência.

### 5. Validar

- [ ] Login / operadores
- [ ] Contagens em tabelas críticas (`items`, `produtos`, `quotations`, `historico_producao`, …)
- [ ] Sync ERP de teste (`run_sync` ou painel)
- [ ] Health `GET /api/health` → `dbProvider: "local"`, `dbConnected: true`

### 6. Rede de segurança

Manter o projeto Supabase ligado (só leitura / sem writes do Hub) por 1–2 semanas. Guardar o `.dump`. Agendar `pg_dump` diário no PC novo.

## Fora deste checklist

- Recriar schema do zero com o DDL e re-sync ERP (perde dados que só existem no Hub, ex. cotações/overrides).
- Expor Postgres na internet.
