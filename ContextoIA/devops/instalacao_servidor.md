# Nexus — Servidor Headless (Windows & Linux)

O servidor do Nexus é headless: uma API Axum em Rust na porta `3001` serve a API e a SPA no navegador.

---

## 1. Arquitetura do Servidor

| Componente | Função |
|------------|--------|
| `nexus-server` | Binário Rust com Axum `0.0.0.0:3001` (atende rotas `/api/...` e entrega os arquivos estáticos de `Frontend/dist`). |
| PostgreSQL | Banco de dados relacional (`Saves/postgres.env`). Pode ser local ou remoto (CasaOS / Linux). |
| Navegador Web | Clientes acessam via `http://nexus.local:3001` ou `<IP_DO_SERVIDOR>:3001`. |

---

## 2. Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `NEXUS_DATA_DIR` | `<repo>/Saves` ou `~/.local/share/nexus/Saves` | Diretório contendo `postgres.env` e `client_config.json`. |
| `NEXUS_FRONTEND_DIST` | `Frontend/dist` | Pasta dos arquivos buildados do React SPA (`index.html`). |
| `DATABASE_URL` | Lida de `Saves/postgres.env` | String de conexão com o PostgreSQL. |
| `RUST_LOG` | `info` | Nível de logs do Tracing. |

*(Nota: Variáveis legadas `NATUMHUB_DATA_DIR` e `NATUMHUB_FRONTEND_DIST` continuam funcionando como fallback).*

---

## 3. Execução no Windows

Para desenvolvimento ou servidor local no Windows:
- **Via Script:** Execute `Nexus-Server.bat` na raiz do projeto.
- **Compilação Manual:**
  ```powershell
  cd C:\api\Backend
  cargo run --release --bin nexus-server --no-default-features
  ```

---

## 4. Execução no Linux / Servidor Dedicado

### Build do binário no Linux:
```bash
cd Backend
cargo build --release --bin nexus-server --no-default-features
```

### Serviço Systemd (`/etc/systemd/system/nexus.service`):
```ini
[Unit]
Description=Nexus Industrial Hub - Servidor Headless
After=network.target docker.service

[Service]
Type=simple
User=nexus
WorkingDirectory=/opt/nexus
ExecStart=/opt/nexus/nexus-server
Restart=always
RestartSec=5
Environment=NEXUS_DATA_DIR=/opt/nexus/Saves
Environment=NEXUS_FRONTEND_DIST=/opt/nexus/Frontend/dist
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
```

Ativação do serviço:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nexus
```

---

## 5. Verificação de Saúde

- **Healthcheck:** `GET http://<IP>:3001/api/health` deve retornar `{"status":"ok"}`.
- **Status detalhado:** `GET http://<IP>:3001/api/server-manager/status` exibe uptime, conexões e IPs disponíveis.
