# Segurança local — credenciais e token do Hub

Credenciais de SQL Server, Firebase, Google OAuth e o `hub_token` da API Axum **nunca devem ser commitados**. Configure-os apenas na máquina local.

## Hub token (`NATUM_HUB_TOKEN`)

A API REST (porta 3001) exige `Authorization: Bearer <token>` em **todas** as rotas `/api/*` quando o bind não é loopback (modo B, padrão Tailscale).

Resolução do token (nessa ordem), **antes** do Axum exigir o header:

1. Variável de ambiente `NATUM_HUB_TOKEN`
2. Arquivo gitignored `Backend/.natum_hub_token` (ou `NATUM_HUB_TOKEN_FILE`)
3. Se ambos estiverem vazios, o processo gera um UUID, grava o arquivo (`0600` no Unix) e usa esse valor em memória

O frontend lê o token via:

- `localStorage.natum_hub_token` (campo **Token da API** nas Configurações do Hub)
- `VITE_HUB_TOKEN` (dev)
- comando Tauri `get_hub_token` (somente lê env/arquivo; **não gera** um token novo no PC cliente)

Clientes Tailscale no PC secundário devem colar o token do servidor no Hub. Não use o comando Tauri no cliente para “criar” um token — ele seria diferente do servidor.

Exceção Bearer: `GET /api/google/callback` (redirect OAuth do Google).

## Bind (`NATUM_BIND`)

| Modo | Bind | Auth |
|------|------|------|
| A (local) | `NATUM_BIND=127.0.0.1` | Bearer **opcional** |
| B (padrão / Tailscale) | `0.0.0.0:3001` (default) | Bearer **obrigatório** em `/api/*` |

Não use bind só em `127.0.0.1` no PC servidor se houver clientes Tailscale.

```bash
# Local desktop sem rede
NATUM_BIND=127.0.0.1

# Tailscale (padrão)
NATUM_BIND=0.0.0.0
# ou IP Tailscale, ex.: NATUM_BIND=100.120.161.52
```

Opcional: `NATUM_AUTH=required|optional` força o modo de auth independentemente do bind.

## CORS

Allowlist (sem `Any`):

- `http://localhost:5175`
- `http://127.0.0.1:5175`
- `tauri://localhost`
- `https://tauri.localhost`

Origens extras: `NATUM_CORS_ORIGINS` (lista separada por vírgula), por exemplo um host Vite na VPN.

## SQL Server

Não há senha padrão no repositório. Após atualizar, se o `data.db` antigo ainda tiver o seed vazado, a migration `migration_clear_leaked_sql_password_v1` apaga esse valor.

Configure de novo em **Hub → Banco de Dados SQL Server** (campo senha, tipo password; o GET da API não devolve o valor). Alternativa: `NATUM_SQL_PASSWORD`.

Bins de debug (`test_sql`, `debug_sql_server`, `search_sql_server`) exigem `NATUM_SQL_PASSWORD`.

## Settings mascarados

Mesmo autenticado, `GET /api/settings/:key` omite o valor de:

`sql_password`, `firebase_config`, `google_client_secret`, `google_access_token`, `google_refresh_token`, `hub_token`

Resposta: `{ "value": null, "is_set": true, "masked": true }`. Escrita só via `POST`. `hub_token` não é lido nem gravado por essa rota.
`GET /api/google/status` não devolve `client_id`.
