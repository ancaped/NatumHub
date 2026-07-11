# Secrets obrigatórios no repositório GitHub (Settings → Secrets → Actions)

| Secret | Descrição |
|--------|-----------|
| `TAURI_SIGNING_PRIVATE_KEY` | Chave privada: `npx tauri signer generate -w natum-hub.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | (opcional) Senha da chave |
| `TAURI_SIGNING_PUBLIC_KEY` | Chave pública — injetada no build via `apply-updater-pubkey.mjs` |

O token GitHub (`github_release_token`) é configurado no **Painel Supervisor → Releases** (PAT com scope `workflow` + `repo` para repo privado).

---

## Política de canais (rede)

| Contexto | Papel | Canal |
|----------|-------|-------|
| **Produção (rede)** | PC Estável = servidor (master) | Estável |
| **Produção (rede)** | Demais PCs = terminais (client) | Estável |
| **Desenvolvimento** | Seu PC com `tauri dev` | master local, sem updater |

Alpha e Beta permanecem no CI para uso futuro, mas **não são usados na rede** enquanto `NETWORK_CHANNELS_FROZEN = true`.

---

## Fluxo de atualização (repo privado)

1. CI gera `updater-stable.json` e faz upload como **asset da release** no GitHub.
2. Terminais na LAN buscam o manifest no **PC Estável**: `GET /api/hub/updater-manifest/stable`.
3. Após publicar, use **Sincronizar manifests no servidor** no painel supervisor.

---

## Como publicar (produção)

```bash
git tag v0.0.12 && git push origin v0.0.12
```

Ou: GitHub → Actions → "Release NatumHub" → canal **stable**, tag `v0.0.12`.

---

## Side-by-side

Instalações Alpha/Beta podem coexistir no mesmo PC para testes locais, mas **não devem ser usadas na rede de produção**.
