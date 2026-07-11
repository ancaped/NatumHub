# Secrets obrigatórios no repositório GitHub (Settings → Secrets → Actions):
#
# TAURI_SIGNING_PRIVATE_KEY
#   Conteúdo da chave privada gerada com: npx tauri signer generate -w natum-hub.key
#
# TAURI_SIGNING_PRIVATE_KEY_PASSWORD (opcional)
#   Senha da chave, se houver
#
# Depois de adicionar a chave privada, copie a chave PÚBLICA para Backend/tauri.conf.json → plugins.updater.pubkey
#
# --- Como publicar ---
#
# Alpha (desenvolvimento):
#   git tag v0.0.12-alpha.1 && git push origin v0.0.12-alpha.1
#
# Beta (testadores):
#   GitHub → Actions → "Release NatumHub" → Run workflow → channel=beta, version_tag=v0.0.12-beta.1
#   ou: git tag v0.0.12-beta.1 && git push origin v0.0.12-beta.1
#
# Stable (produção):
#   git tag v0.0.12 && git push origin v0.0.12
#
# Promover (mesmo código, nova tag/canal):
#   Actions → "Promote Release" → source_tag + target_tag + target_channel
#
# Manifests atualizados automaticamente em:
#   updater-alpha.json | updater-beta.json | updater-stable.json
