# Releases e instalador NatumHub

## Dois canais

| Canal | Identifier | Instalador | Quem atualiza |
|-------|------------|------------|---------------|
| **Principal** | `com.natum.hub.stable` | `NatumHub_*_x64-setup.exe` | Todos |
| **Desenvolvedor** | `com.natum.hub.dev` | `NatumHub Dev_*_x64-setup.exe` | Somente supervisor |

- **Primeira instalação:** baixe o `.exe` da [GitHub Release](https://github.com/ancaped/NatumHub/releases).
- **Atualização in-app:** Tauri baixa o **`.nsis.zip`** (URL no manifest), não o `.exe`.

---

## Configuração inicial (uma vez)

```bash
cd Backend
npm run setup:release              # chaves + manifests + pubkey + GitHub settings no DB
npm run setup:release -- --push-secrets   # também envia TAURI_SIGNING_* ao GitHub Actions
npm run seed:github                # só regravar PAT/repo no PostgreSQL
```

Isso cria:
- `Backend/natum-hub.key` (privada, não commitar)
- `Saves/updater-manifests/updater-{stable,dev}.json`
- Pubkey em `tauri.conf.json`
- Settings `github_release_*` no Supabase (para sync de manifests no app)

**Token GitHub:** usa `gh auth token` automaticamente, ou `.github_token` / `GH_TOKEN`.

---

| Secret | Descrição |
|--------|-----------|
| `TAURI_SIGNING_PRIVATE_KEY` | `npx tauri signer generate -w natum-hub.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | (opcional) |
| `TAURI_SIGNING_PUBLIC_KEY` | Injetada no build via `apply-updater-pubkey.mjs` |

Token GitHub (PAT `repo`) no app: **Configurações → Atualizações → Token GitHub** (supervisor).

---

## Build local (instalador)

Pré-requisitos: Node 20, Rust, NSIS (instalado pelo bundler Tauri no Windows).

```bash
cd Backend
npm ci
cd ../Frontend && npm ci && cd ../Backend

# Principal
npm run build:stable

# Desenvolvedor
npm run build:dev
```

Saída:

- `Backend/target/release/bundle/nsis/*.exe` — instalador
- `Backend/target/release/bundle/updater/*.nsis.zip` — pacote de update
- `Backend/target/release/bundle/updater/*.sig` — assinatura (com chave configurada)

---

## Publicar release (CI)

```bash
git tag v0.0.12 && git push origin v0.0.12
```

Ou **Actions → Release NatumHub → Run workflow** com tag `v0.0.12`.

O workflow gera **duas builds** (matrix stable + dev) e publica na mesma release:

- 2 instaladores `.exe`
- 2 pacotes `.nsis.zip`
- `updater-stable.json` e `updater-dev.json`

---

## Rede (PC master + terminais)

1. Após publicar, no **PC master** (build Principal): Configurações → **Sincronizar manifests do GitHub**.
2. Manifests ficam em `Saves/updater-manifests/`.
3. Terminais consultam o master: `GET /api/hub/updater-manifest/stable`.
4. App verifica update no login e em **Configurações → Verificar atualização**.

---

## Validar manifests

```bash
node scripts/verify-updater-manifest.mjs
# ou só local, sem HTTP:
node scripts/verify-updater-manifest.mjs --skip-http
```

Checklist manual:

- [ ] Release contém `updater-stable.json` e `updater-dev.json` com URLs `.nsis.zip`
- [ ] Signatures não vazias (com secrets configurados)
- [ ] Master sincronizou manifests (`availableOnServer` no painel)
- [ ] App com versão anterior: **Verificar atualização (Principal)** baixa e instala
- [ ] Supervisor: **Verificar atualização (Dev)** no app `NatumHub Dev`

---

## Testar Saves da produção (sem publicar)

1. Copie `Saves/` do servidor para o PC de dev (app fechado).
2. `npm run tauri:dev` — validação local, não substitui release.
