# PostgreSQL no PC Principal

## Opção A — NatumHub Dev (recomendado em desenvolvimento)

No wizard **PC Principal**, use **Instalar PostgreSQL local (Dev)**. O app:

1. Baixa binários oficiais PostgreSQL **17.4** (~316 MB, uma vez)
2. Extrai em `%LOCALAPPDATA%\NatumHub Dev\pgsql`
3. Inicializa o cluster em `pgsql-data` (porta **5433**)
4. Cria role `natum` + database `natumhub`
5. Aplica o schema (`Backend/supabase/001` … `006`)
6. Grava `%LOCALAPPDATA%\NatumHub Dev\Saves\postgres.env`

Reinicie o NatumHub Dev se a API (:3001) ainda estiver offline após o bootstrap.

Em `tauri dev` a partir do repo, o mesmo fluxo grava `C:\api\Saves\postgres.env` conforme `saves_dir()`.

**Não** use este botão no build Estável instalado: para produção, use a opção B.

## Opção B — Postgres do sistema (produção / build Estável)

O NatumHub **não** embute o servidor nos instaladores Estável. Instale à parte no Windows do master.

### 1. Instalar Postgres

1. Baixe PostgreSQL **15+** (recomendado 17) em https://www.postgresql.org/download/windows/
2. No instalador: anote a porta (`5432`) e a senha do usuário `postgres`.
3. Opcional: `psql` / `pg_dump` no PATH (backup no painel).

### 2. Criar banco e role

No `psql` (ou pgAdmin), como `postgres`:

```sql
CREATE ROLE natum WITH LOGIN PASSWORD 'SUA_SENHA_FORTE';
CREATE DATABASE natumhub OWNER natum;
\c natumhub
GRANT ALL ON SCHEMA public TO natum;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO natum;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO natum;
```

URL típica (senha com `#` → `%23`):

```
postgresql://natum:SENHA@127.0.0.1:5432/natumhub
```

### 3. Schema NatumHub

```
Backend/supabase/001_natumhub_schema.sql
Backend/supabase/002_*.sql … 006_*.sql
```

```powershell
$env:PGPASSWORD='SUA_SENHA'
psql -h 127.0.0.1 -U natum -d natumhub -f Backend\supabase\001_natumhub_schema.sql
```

Detalhes: [`Backend/supabase/README.md`](../../Backend/supabase/README.md).

### 4. Arquivo `postgres.env`

```
%LOCALAPPDATA%\NatumHub\Saves\postgres.env          (build Estável)
%LOCALAPPDATA%\NatumHub Dev\Saves\postgres.env      (build Dev)
```

```env
DATABASE_URL=postgresql://natum:SENHA@127.0.0.1:5432/natumhub
```

Em desenvolvimento no repositório: `C:\api\Saves\postgres.env`. Reinicie o NatumHub após editar.

## Firewall

- Se só o Axum local acessa o Postgres: **não** abra a porta do Postgres na rede.
- Abra apenas **TCP 3001** para terminais (LAN) ou use Tailscale.

## Validar

1. Suba o NatumHub como **PC Principal**.
2. Health da API deve reportar DB ok.
3. Setup do supervisor na primeira vez.

Migração a partir de Supabase: [`../banco-dados/migracao_postgres.md`](../banco-dados/migracao_postgres.md).
