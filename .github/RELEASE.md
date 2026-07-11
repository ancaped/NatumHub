# Secrets obrigatórios (Settings → Secrets → Actions)

| Secret | Descrição |
|--------|-----------|
| `TAURI_SIGNING_PRIVATE_KEY` | Chave privada: `npx tauri signer generate -w natum-hub.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | (opcional) Senha da chave |
| `TAURI_SIGNING_PUBLIC_KEY` | Chave pública — injetada no build via `apply-updater-pubkey.mjs` |

Token GitHub (`github_release_token`) no **Painel Supervisor → Releases** (PAT com `workflow` + `repo`).

---

## Modelo

| Contexto | Papel | Dados |
|----------|-------|-------|
| **Produção** | 1 PC Estável = servidor (master) | `Saves/data.db` + sync ERP |
| **Produção** | Demais PCs = terminais (client) | HTTP → servidor |
| **Dev** | `tauri dev` = master local | SQLite local, sem updater |

Uma versão Estável na rede. Sem canais Alpha/Beta.

---

## Publicar

```bash
git tag v0.0.12 && git push origin v0.0.12
```

Ou Actions → "Release NatumHub" → tag `v0.0.12`.

Após a release: no PC servidor, **Sincronizar manifests** (Painel Supervisor → Releases).

Terminais buscam: `GET /api/hub/updater-manifest/stable`.

---

## Testar nova versão com o Saves da Estável (sem quebrar produção)

Objetivo: validar se o código novo abre o banco do servidor atual.

1. No PC servidor Estável, **pare** o NatumHub (ou copie com o app fechado).
2. Copie a pasta `Saves/` (pelo menos `data.db` + `client_config.json`) para o PC de desenvolvimento.
3. No PC de dev, com o repo atualizado: `cd Backend && npm run tauri dev` (ou build local).
4. Wizard → **Desenvolvimento** / master local — o app usa o `Saves` copiado.
5. Confira login, módulos, sync ERP (se SQL acessível), etc.
6. **Não** publique essa pasta de volta para produção sem backup; o teste é só leitura/validação.

Se algo quebrar na migração do schema, corrija antes da release Estável.
