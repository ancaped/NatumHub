# Secrets obrigatórios no repositório GitHub (Settings → Secrets → Actions)

| Secret | Descrição |
|--------|-----------|
| `TAURI_SIGNING_PRIVATE_KEY` | Chave privada: `npx tauri signer generate -w natum-hub.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | (opcional) Senha da chave |
| `TAURI_SIGNING_PUBLIC_KEY` | Chave pública — injetada no build via `apply-updater-pubkey.mjs` |

O token GitHub (`github_release_token`) é configurado no **Painel Supervisor → Releases** (PAT com scope `workflow` + `repo` para repo privado).

---

## Fluxo de atualização (repo privado)

1. CI gera `updater-{canal}.json` e faz upload como **asset da release** no GitHub.
2. O app embute fallback: `https://github.com/{repo}/releases/download/{tag}/updater-{canal}.json`.
3. Terminais na LAN buscam primeiro o manifest no **PC Estável**: `GET /api/hub/updater-manifest/{canal}` (público, sem auth).
4. Após publicar releases, use **Sincronizar manifests no servidor** no painel supervisor (ou copie para `Saves/updater-manifests/`).

---

## Como publicar

**Alpha (desenvolvimento):**
```bash
git tag v0.0.12-alpha.1 && git push origin v0.0.12-alpha.1
```

**Beta / Stable (dispatch manual):**
GitHub → Actions → "Release NatumHub" → Run workflow → escolher canal + tag.

**Promover via painel:** Painel Supervisor → Releases → Disparar build no GitHub.

---

## Side-by-side

Cada canal usa identifier distinto (`com.natum.hub.alpha`, `.beta`, `.stable`) e pode coexistir no mesmo PC.
