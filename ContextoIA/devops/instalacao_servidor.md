# NatumHub — servidor headless (Windows agora, Linux depois)

API Axum + SPA no navegador **sem janela Tauri**. Mesmo binário `natumhub-server` nos dois SOs.

Acesso remoto nesta fase: **somente Tailscale** — ver [tailscale.md](tailscale.md). Não exponha `:3001` na internet pública.

## O que sobe

| Componente | Papel |
|------------|--------|
| `natumhub-server` | Axum `0.0.0.0:3001` (API + `Frontend/dist`) |
| PostgreSQL | Obrigatório (`Saves/postgres.env` ou `NATUMHUB_DATA_DIR`) |
| App Tauri | **Opcional** — wizard/UI local; não rode junto com o headless (mesma porta) |

Clientes e supervisor: navegador → `http://natumhub.local:3001` ou IP Tailscale.

## Variáveis de ambiente

| Variável | Uso |
|----------|-----|
| `NATUMHUB_DATA_DIR` | Raiz de dados (cria/usa `Saves/` com `postgres.env`, backups, docs) |
| `NATUMHUB_FRONTEND_DIST` | Pasta do SPA (`index.html`) se não estiver no repo |
| `RUST_LOG` | Ex.: `info` (padrão no binário) |

Sem `NATUMHUB_DATA_DIR`: no repo usa `<repo>/Saves`; no Windows instalado `%LOCALAPPDATA%\…\Saves`; no Linux `~/.local/share/natumhub/Saves`.

## Windows (hoje)

No repo: `NatumHub-Server.bat` sobe o headless (fica ligado); `NatumHub-Frontend.bat` abre `http://natumhub.local:3001` no navegador. Não use junto com `NatumHub.bat` (Tauri).

Pré-requisitos: Postgres no ar, schema aplicado, `Frontend` buildado.

```powershell
cd C:\api\Frontend
npm ci
npm run build
cd ..\Backend
cargo build --release --bin natumhub-server --no-default-features
```

Executável: `C:\natumhub\release\natumhub-server.exe` (ou `target\release` se não usar `Backend/.cargo/config.toml`).

```powershell
# Exemplo com dados do repo
$env:NATUMHUB_DATA_DIR = "C:\api"
# ou aponte Saves diretamente via pasta pai; o binário resolve Saves/
.\natumhub-server.exe
```

Teste: `http://127.0.0.1:3001/api/health` e login supervisor no browser.

### Rodar sem console (Task Scheduler)

1. Agendador de Tarefas → Criar tarefa → **Executar estando o usuário conectado ou não** (ou no logon).
2. Ação: iniciar `natumhub-server.exe`.
3. Iniciar em: pasta do exe (ou defina `NATUMHUB_DATA_DIR` / `NATUMHUB_FRONTEND_DIST` nas variáveis da tarefa).
4. Firewall: inbound TCP **3001**.

Alternativa: [NSSM](https://nssm.cc/) como serviço Windows apontando para o mesmo exe.

**Não** use o app Tauri master ao mesmo tempo.

## Linux (quando migrar)

No servidor:

```bash
# build (sem WebView/Tauri)
cd Frontend && npm ci && npm run build && cd ..
cd Backend
cargo build --release --bin natumhub-server --no-default-features
sudo install -m 755 target/release/natumhub-server /usr/local/bin/natumhub-server
sudo mkdir -p /var/lib/natumhub/Saves /var/lib/natumhub/frontend-dist
sudo cp -r ../Frontend/dist/* /var/lib/natumhub/frontend-dist/
# copie postgres.env para /var/lib/natumhub/Saves/
```

Unit systemd (`/etc/systemd/system/natumhub.service`):

```ini
[Unit]
Description=NatumHub API + SPA
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=natumhub
Group=natumhub
Environment=NATUMHUB_DATA_DIR=/var/lib/natumhub
Environment=NATUMHUB_FRONTEND_DIST=/var/lib/natumhub/frontend-dist
Environment=RUST_LOG=info
ExecStart=/usr/local/bin/natumhub-server
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now natumhub
curl -s http://127.0.0.1:3001/api/health
```

Instale Tailscale no servidor; nos clientes use `http://<ip-ou-hostname-tailscale>:3001`.

## Atualizar

1. `git pull` (branch `main` em produção).
2. `npm run build` em `Frontend/`.
3. Rebuild do binário headless.
4. Reinicie o processo/serviço (Task Scheduler / NSSM / systemd).
5. Copie `Frontend/dist` se usar `NATUMHUB_FRONTEND_DIST` fora do repo.

## Relação com o app desktop

| Cenário | O que usar |
|---------|------------|
| Dev / wizard Postgres embutido | App Tauri (`desktop`, default) |
| PC Principal 24/7 ou VPS | `natumhub-server` |
| Terminais | Só navegador |

Docs: [instalacao_via_repositorio.md](instalacao_via_repositorio.md) · [multi_usuario.md](../arquitetura/multi_usuario.md) · [tailscale.md](tailscale.md).
