# Instalação via repositório (sem depender do `.exe` NSIS)

Use este guia quando o instalador da release (`*_x64-setup.exe`) **falhar** ou quando quiser subir o NatumHub direto do GitHub no PC.

Há dois papéis:

| Papel | Quem | Postgres? | SQL Server ERP? | O que sobe |
|-------|------|-----------|-----------------|------------|
| **PC Principal (master)** | 1 máquina servidor | **Sim, obrigatório** | Só se for fazer sync ERP | App Tauri **ou** `natumhub-server` ([instalacao_servidor.md](instalacao_servidor.md)) + Axum `:3001` (API + SPA) |
| **Terminal (cliente)** | Demais PCs | Não | Não | **Navegador** → `http://natumhub.local:3001` |

**Branches:** `main` = produção no master. Outras branches = desenvolvimento (não servir aos clientes).

**Não** use SQLite / `data.db`. Dados do Hub ficam no PostgreSQL do master (`Saves/postgres.env`).

Docs relacionadas: [instalacao_postgres_master.md](instalacao_postgres_master.md) · [multi_usuario.md](../arquitetura/multi_usuario.md) · [instalacao_app_terminal.md](instalacao_app_terminal.md).

---

## Visão do fluxo

```
1. Clone o repo (branch main)
2. Instale ferramentas (só no PC Principal)
3. Postgres + postgres.env + schema
4. npm run build no Frontend + suba o app master
5. Wizard: PC Principal
6. Firewall 3001 + hosts natumhub.local nos terminais
7. Clientes abrem http://natumhub.local:3001 no navegador
```

---

## Parte A — Pré-requisitos (PC Principal)

Necessário no **PC Principal**. Terminais **não** clonam nem instalam o app.

| Ferramenta | Versão sugerida | Para quê |
|------------|-----------------|----------|
| Git | recente | Clonar / atualizar `main` |
| Node.js | **20 LTS** ou 22 | Frontend + scripts Tauri |
| Rust | **1.77+** (`rustup`) | Backend Tauri |
| Visual Studio Build Tools | C++ workload | Linker Windows |
| WebView2 Runtime | Evergreen | UI Tauri (quase sempre já no Win 10/11) |
| PostgreSQL 15+ | **só no master** | Banco operacional |

### Checagens rápidas (PowerShell)

```powershell
git --version
node -v
npm -v
rustc --version
cargo --version
```

Se faltar Rust:

```powershell
# https://rustup.rs
rustup default stable
```

WebView2 (se a janela não abrir):  
https://developer.microsoft.com/microsoft-edge/webview2/

---

## Parte B — Clonar o repositório

```powershell
cd C:\
git clone https://github.com/ancaped/NatumHub.git NatumHub
cd C:\NatumHub
git checkout main
git pull
```

No dia a dia de desenvolvimento no PC do autor o caminho costuma ser `C:\api`; em outra máquina use o path que preferir — o app resolve `Saves/` relativo à **raiz do repo** quando detecta o clone.

### Dependências npm (uma vez)

```powershell
cd C:\NatumHub\Frontend
npm ci

cd C:\NatumHub\Backend
npm ci
```

---

## Parte C — PostgreSQL no PC Principal (obrigatório)

Sem isso o master sobe a UI, mas a API fica offline / degradada (`/api/health` com `dbConnected: false`).

### C1 — Instalar Postgres do sistema (recomendado para máquina de produção)

1. Instale PostgreSQL 15+ (ideal 17): https://www.postgresql.org/download/windows/
2. Anote porta (`5432`) e senha do usuário `postgres`.
3. Crie role + banco:

```sql
CREATE ROLE natum WITH LOGIN PASSWORD 'SUA_SENHA_FORTE';
CREATE DATABASE natumhub OWNER natum;
\c natumhub
GRANT ALL ON SCHEMA public TO natum;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO natum;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO natum;
```

### C2 — Arquivo `postgres.env` na pasta Saves do repo

```powershell
copy C:\NatumHub\Saves\postgres.env.example C:\NatumHub\Saves\postgres.env
notepad C:\NatumHub\Saves\postgres.env
```

Conteúdo mínimo (ajuste senha; `#` na senha vira `%23` na URL):

```env
DATABASE_URL=postgresql://natum:SUA_SENHA_FORTE@127.0.0.1:5432/natumhub
```

**Não** commitar `postgres.env`.

### C3 — Aplicar schema

Com `psql` no PATH (senha do role `natum`):

```powershell
cd C:\NatumHub
$env:PGPASSWORD = 'SUA_SENHA_FORTE'

psql -h 127.0.0.1 -U natum -d natumhub -f Backend\supabase\001_natumhub_schema.sql
psql -h 127.0.0.1 -U natum -d natumhub -f Backend\supabase\002_almoxarifado.sql
psql -h 127.0.0.1 -U natum -d natumhub -f Backend\supabase\003_estoque_ops.sql
psql -h 127.0.0.1 -U natum -d natumhub -f Backend\supabase\004_almox_erp_super.sql
psql -h 127.0.0.1 -U natum -d natumhub -f Backend\supabase\005_kit_composicao.sql
psql -h 127.0.0.1 -U natum -d natumhub -f Backend\supabase\006_kit_composicao_item_fk.sql
# se existirem no clone:
if (Test-Path Backend\supabase\007_extend_invoices.sql) {
  psql -h 127.0.0.1 -U natum -d natumhub -f Backend\supabase\007_extend_invoices.sql
}
if (Test-Path Backend\supabase\008_add_freight_details.sql) {
  psql -h 127.0.0.1 -U natum -d natumhub -f Backend\supabase\008_add_freight_details.sql
}
```

### C4 — Atalho Dev (só se for usar `tauri:dev` e wizard)

No wizard **PC Principal**, o botão **Instalar PostgreSQL local (Dev)** pode baixar Postgres embutido (porta **5433**) e gravar `Saves/postgres.env` sozinho. Útil em máquina de teste; em fábrica prefira C1–C3.

Detalhes: [instalacao_postgres_master.md](instalacao_postgres_master.md).

---

## Parte D — Subir o aplicativo

Escolha **um** caminho.

### D1 — Modo desenvolvimento (mais simples se o `.exe` quebrou)

No PC Principal (com Postgres + `postgres.env` ok):

```powershell
cd C:\NatumHub\Backend
npm run tauri:dev
```

Isso sobe Vite + compila o Rust e abre a janela. Na 1ª vez a compilação demora vários minutos.

**Wizard:** escolha **PC Principal**.

Validar API em outro PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

Esperado: `database = postgresql`, `dbConnected = True`, `appMode = master`.

### D2 — Build local (executável sem instalador NSIS da GitHub Release)

Gera o app no PC (pode demorar). Produz `.exe` e, se o bundle NSIS local também falhar, use o binário em `target\release`:

```powershell
cd C:\NatumHub\Backend
npm run tauri:build
```

Saídas típicas:

| Artefato | Caminho aproximado |
|----------|-------------------|
| App | `Backend\target\release\natum-hub.exe` |
| Bundle NSIS (se gerar) | `Backend\target\release\bundle\nsis\*.exe` |

**Uso sem NSIS:** copie `natum-hub.exe` (e DLLs vizinhas se houver) para um diretório fixo, por exemplo `C:\NatumHubApp\`, e crie atalho. Em modo **instalado/fora do repo**, o app lê:

`%LOCALAPPDATA%\NatumHub\Saves\postgres.env`

→ copie o `postgres.env` também para lá (ou rode o exe ainda a partir do clone, que usa `C:\NatumHub\Saves\`).

Canal estável (opcional, se scripts de canal existirem):

```powershell
npm run build:stable
```

---

## Parte E — Configurar o PC Principal (após abrir o app)

1. Wizard → **PC Principal**.
2. Confirme que a API responde (`health` acima).
3. Crie o **supervisor** (única conta que cadastra usuários).
4. Login: digite **nome + senha** (lista de usuários não aparece).
5. **Firewall Windows:** permitir inbound **TCP 3001** (terminais na LAN).
6. Anote o IP do master, ex.: `192.168.0.10`.
7. (Opcional) Sync ERP: Configurações / Painel Supervisor — credenciais `sql_*` do SQL Server. Só no master.
8. Cadastre operadores que vão logar nos terminais.

Não abra a porta do Postgres na rede — só a **3001**.

---

## Parte F — Terminais (clientes)

Terminais **não** precisam de PostgreSQL nem de SQL Server.

### F1 — Com o mesmo repositório / exe local

1. No terminal: ou rode `npm run tauri:dev` a partir do clone, **ou** copie o `natum-hub.exe` gerado no master (Parte D2).
2. Abra o app → wizard → **Terminal**.
3. URL da API, exemplos:
   - LAN: `http://192.168.0.10:3001`
   - Tailscale: `http://100.x.x.x:3001` (ver [tailscale.md](tailscale.md))
4. O app testa o health; se falhar, corrija firewall/IP.
5. Login com usuário criado pelo supervisor.

Modo `client`: **não** sobe Axum local e **não** exige `postgres.env`.

### F2 — Reconfigurar

Na tela de login: **Reconfigurar dispositivo** (volta ao wizard).

---

## Parte G — Checklist final

### Master

- [ ] Branch `main` atualizada
- [ ] Postgres rodando
- [ ] `Saves/postgres.env` (ou `%LOCALAPPDATA%\NatumHub\Saves\postgres.env`) com `DATABASE_URL` correto
- [ ] Schema aplicado
- [ ] `Frontend/dist` gerado (`npm run build`)
- [ ] App aberto como **PC Principal**
- [ ] `GET http://127.0.0.1:3001/api/health` → `postgresql` + `dbConnected: true`
- [ ] `http://127.0.0.1:3001/` carrega o Hub (SPA)
- [ ] Supervisor criado e logado
- [ ] Firewall TCP 3001
- [ ] (Opcional) Sync ERP ok

### Cada terminal

- [ ] Hosts: `natumhub.local` → IP do master
- [ ] Navegador em `http://natumhub.local:3001`
- [ ] Health ok (`/api/health`)
- [ ] Login com operador cadastrado no master

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---------|----------------|-------------|
| API offline / `dbConnected: false` | Sem Postgres ou `postgres.env` errado | Parte C; reiniciar app |
| `/` não carrega UI | Sem `Frontend/dist` | `cd Frontend; npm run build` e reiniciar master |
| Panic / mismatch SQL no financeiro | Schema/tipos Postgres | Atualizar `git pull` + schema |
| Terminal não conecta | Firewall, hosts ou IP errado | Liberar 3001; hosts `natumhub.local`; testar `/api/health` |
| 1ª compilação “travou” | Cargo baixando crates | Esperar; rede liberada; `cargo check --lib` no Backend |
| Instalador NSIS da Release falha | Motivo deste guia | Use D1 (`tauri:dev`) ou D2 (exe em `target\release`) |
| Pensou que “só SQLite basta” | Doc antiga | Ignore — master **exige** Postgres |

---

## Atualizar produção (branch main)

```powershell
cd C:\NatumHub
git checkout main
git pull
cd Frontend
npm ci
npm run build
cd ..\Backend
npm ci
# reiniciar o app master (tauri:dev ou o .exe instalado)
```

Clientes: só recarregar `http://natumhub.local:3001`. Ver [instalacao_app_master.md](instalacao_app_master.md) · [instalacao_app_terminal.md](instalacao_app_terminal.md).
