#!/usr/bin/env node
/**
 * Injeta a chave pública do updater em Backend/tauri.conf.json (CI ou local).
 * Env: TAURI_SIGNING_PUBLIC_KEY ou arquivo Backend/updater.pubkey
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const tauriPath = path.join(root, 'Backend', 'tauri.conf.json');
const keyFile = path.join(root, 'Backend', 'updater.pubkey');

let pubkey = (process.env.TAURI_SIGNING_PUBLIC_KEY || '').trim();
if (!pubkey && fs.existsSync(keyFile)) {
  pubkey = fs.readFileSync(keyFile, 'utf8').trim();
}

if (!pubkey) {
  console.warn('TAURI_SIGNING_PUBLIC_KEY não definida — updater sem verificação de assinatura.');
  process.exit(0);
}

const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
if (!tauri.plugins) tauri.plugins = {};
if (!tauri.plugins.updater) tauri.plugins.updater = { endpoints: [] };
tauri.plugins.updater.pubkey = pubkey;
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
console.log('Pubkey do updater aplicada em tauri.conf.json');
