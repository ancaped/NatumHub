# Comandos Tauri (invoke) — superfície mínima

> **Preferir REST** via `geral/lib/http.ts`. Terminais e master usam a API Axum para dados.
> Dados ficam no **PostgreSQL** (`Saves/postgres.env`), não em SQLite.

Lista canônica: `Backend/src/lib.rs` → `generate_handler![...]`.

## Rede / setup

| Comando | Uso |
|---------|-----|
| `hub_get_client_config` | Lê `Saves/client_config.json` |
| `hub_save_client_config` | Salva config rede (master/client) |
| `hub_check_server_health` | Teste `/api/health` |
| `hub_bootstrap_local_postgres` | Dev: instala/inicia Postgres embutido |
| `open_external_browser` | URLs externas |
| Updater | `get_build_info`, `check_channel_update`, `install_channel_update` |
| Compras online | `upload_order_receipt`, `open_receipt_file` |

CRUD de domínio (itens, feedbacks, financeiro, …) é **REST** (`/api/...`), não invoke Tauri.

Health esperado: `{ "database": "postgresql", "dbConnected": true }`.
