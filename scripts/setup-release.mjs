#!/usr/bin/env node
/**
 * Configuração inicial do pipeline de instalador / updater NatumHub.
 * - Chaves Tauri (Backend/natum-hub.key)
 * - Pubkey em Backend/updater.pubkey
 * - Manifests seed em Saves/updater-manifests/
 * - (opcional) sincroniza secrets no GitHub: --push-secrets
 *
 * Uso: node scripts/setup-release.mjs [--push-secrets] [--generate-key]
 */
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const keyPath = path.join(root, 'Backend', 'natum-hub.key');
const pubPath = path.join(root, 'Backend', 'natum-hub.key.pub');
const updaterPub = path.join(root, 'Backend', 'updater.pubkey');
const manifestsDir = path.join(root, 'Saves', 'updater-manifests');

const args = process.argv.slice(2);
const pushSecrets = args.includes('--push-secrets');
const forceGenerate = args.includes('--generate-key');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

if (forceGenerate || !fs.existsSync(keyPath)) {
  console.log('\n=== Gerando chaves Tauri (Backend/natum-hub.key) ===');
  run('npx tauri signer generate -w natum-hub.key', { cwd: path.join(root, 'Backend') });
}

if (!fs.existsSync(pubPath)) {
  console.error('Chave pública não encontrada:', pubPath);
  process.exit(1);
}

fs.copyFileSync(pubPath, updaterPub);
console.log('✓ Backend/updater.pubkey');

fs.mkdirSync(manifestsDir, { recursive: true });
for (const ch of ['stable', 'dev']) {
  const src = path.join(root, `updater-${ch}.json`);
  const dest = path.join(manifestsDir, `updater-${ch}.json`);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ ${dest}`);
  }
}

console.log('\n=== Aplicando pubkey no tauri.conf.json ===');
run('node scripts/apply-updater-pubkey.mjs');

if (pushSecrets) {
  console.log('\n=== Enviando secrets para GitHub (repo atual) ===');
  const priv = fs.readFileSync(keyPath, 'utf8');
  const pub = fs.readFileSync(pubPath, 'utf8').trim();
  spawnSync('gh', ['secret', 'set', 'TAURI_SIGNING_PRIVATE_KEY', '--body', priv], {
    stdio: 'inherit',
    shell: true,
  });
  spawnSync('gh', ['secret', 'set', 'TAURI_SIGNING_PUBLIC_KEY', '--body', pub], {
    stdio: 'inherit',
    shell: true,
  });
  console.log('✓ Secrets TAURI_SIGNING_* atualizados');
}

console.log('\n=== GitHub settings no PostgreSQL (sync manifests) ===');
const seedGh = spawnSync('node', ['scripts/seed-github-settings.mjs'], {
  stdio: 'inherit',
  shell: true,
  cwd: root,
});
if (seedGh.status !== 0) {
  console.warn('⚠ seed-github-settings falhou (opcional se DB offline)');
}

console.log('\n=== Validando manifests (local) ===');
run('node scripts/verify-updater-manifest.mjs --skip-http');

console.log(`
Próximos passos:
  1. Build local:  cd Backend && npm run build:stable  (ou build:dev)
  2. Publicar CI:  git tag v0.0.12 && git push origin v0.0.12
  3. No app (supervisor): Configurações → Token GitHub → Sincronizar manifests
  4. Testar update: Verificar atualização (Principal / Dev)

Ver: .github/RELEASE.md
`);
