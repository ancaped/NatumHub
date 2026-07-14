# DevOps — instalação e operação

| Doc | Uso |
|-----|-----|
| [instalacao_via_repositorio.md](instalacao_via_repositorio.md) | **Se o `.exe` falhar** — clone + Postgres + `tauri:dev` / build local (master e terminais) |
| [instalacao_postgres_master.md](instalacao_postgres_master.md) | **Obrigatório** no PC Principal |
| [instalacao_app_master.md](instalacao_app_master.md) | NatumHub no master (instalador NSIS) |
| [instalacao_app_terminal.md](instalacao_app_terminal.md) | NatumHub nos terminais (sem Postgres) |
| [tailscale.md](tailscale.md) | Rede via Tailscale (opcional) |
| [github.md](github.md) | Repo / secrets (se existir) |
| [../.github/RELEASE.md](../../.github/RELEASE.md) | Releases e updates in-app |

## Aviso para agentes / instaladores

O banco operacional é **PostgreSQL**. O script `scripts/seed-github-settings.mjs` grava settings de **release** no mesmo Postgres — **não** significa que o Postgres serve só o updater. SQLite (`data.db`) **não** é usado no dia a dia.

Playbook de bugs: [`../../Feedbacks/feedback.md`](../../Feedbacks/feedback.md)
