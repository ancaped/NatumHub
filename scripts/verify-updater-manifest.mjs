#!/usr/bin/env node
/**
 * Valida updater-{channel}.json: schema, URL do pacote .nsis.zip e opcional HEAD HTTP.
 * Uso: node scripts/verify-updater-manifest.mjs [--file updater-stable.json] [--skip-http]
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}
const skipHttp = args.includes('--skip-http');
const files = args.filter((a) => !a.startsWith('--') && a.endsWith('.json'));
const toCheck =
  files.length > 0
    ? files
    : [getArg('file') || 'updater-stable.json', 'updater-dev.json'].filter((f) =>
        fs.existsSync(path.resolve(f)),
      );

let failed = false;

for (const file of toCheck) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`✗ ${file}: arquivo não encontrado`);
    failed = true;
    continue;
  }

  let json;
  try {
    json = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    console.error(`✗ ${file}: JSON inválido — ${e.message}`);
    failed = true;
    continue;
  }

  const platform = json.platforms?.['windows-x86_64'];
  if (!json.version || !platform?.url) {
    console.error(`✗ ${file}: falta version ou platforms.windows-x86_64.url`);
    failed = true;
    continue;
  }

  if (!platform.url.includes('.nsis.zip')) {
    console.warn(`⚠ ${file}: URL não aponta para .nsis.zip (updater Tauri espera o zip, não o .exe)`);
    failed = true;
  }

  if (!platform.signature?.trim()) {
    console.warn(`⚠ ${file}: signature vazia — configure TAURI_SIGNING_PRIVATE_KEY no CI`);
  }

  console.log(`✓ ${file}: v${json.version}`);
  console.log(`  url: ${platform.url}`);

  if (!skipHttp) {
    try {
      const res = await fetch(platform.url, { method: 'HEAD', redirect: 'follow' });
      if (res.ok) {
        console.log(`  HTTP: ${res.status} OK`);
      } else {
        console.error(`  HTTP: ${res.status} — URL inacessível ou release ainda não publicada`);
        failed = true;
      }
    } catch (e) {
      console.error(`  HTTP: falha — ${e.message}`);
      failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
