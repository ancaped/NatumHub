# Instalador NatumHub

Binários **não** ficam commitados aqui. Gerados pelo CI / build local.

## Produção (comece por aqui)

| Passo | Doc |
|-------|-----|
| **Se o instalador .exe falhar** | [`ContextoIA/devops/instalacao_via_repositorio.md`](../ContextoIA/devops/instalacao_via_repositorio.md) |
| Postgres no master | [`ContextoIA/devops/instalacao_postgres_master.md`](../ContextoIA/devops/instalacao_postgres_master.md) |
| App no master | [`ContextoIA/devops/instalacao_app_master.md`](../ContextoIA/devops/instalacao_app_master.md) |
| App nos terminais | [`ContextoIA/devops/instalacao_app_terminal.md`](../ContextoIA/devops/instalacao_app_terminal.md) |
| Tailscale | [`ContextoIA/devops/tailscale.md`](../ContextoIA/devops/tailscale.md) |
| Releases / updates | [`.github/RELEASE.md`](../.github/RELEASE.md) |

**End users não precisam de Rust/Node.** Só o `.exe` NSIS (+ Postgres no master).

## Gerar instalador (máquina de build)

Ver [`.github/RELEASE.md`](../.github/RELEASE.md):

```bash
cd Backend
npm ci
cd ../Frontend && npm ci && cd ../Backend
npm run build:stable   # ou build:dev
```

Saída típica: bundle NSIS `*_x64-setup.exe`.

## Updates

1. Tag/release no GitHub (CI assina e publica manifests).
2. No **PC Principal**: sincronizar manifests (Configurações → Atualizações).
3. Terminais e master atualizam in-app via API do master.
