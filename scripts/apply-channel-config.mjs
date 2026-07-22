#!/usr/bin/env node
/**
 * Aplica identifier/productName por canal antes do build Tauri.
 * Uso: node scripts/apply-channel-config.mjs --channel stable|dev
 */
import fs from 'fs';
import path from 'path';

const CHANNELS = {
  stable: {
    identifier: 'com.natum.hub.stable',
    productName: 'NatumHub',
    windowTitle: 'Natum Hub',
  },
  dev: {
    identifier: 'com.natum.hub.dev',
    productName: 'NatumHub Dev',
    windowTitle: 'Natum Hub Dev',
  },
};

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

const channel = getArg('channel') || 'stable';
if (!CHANNELS[channel]) {
  console.error('Canal inválido. Use: --channel stable|dev');
  process.exit(1);
}

const cfg = CHANNELS[channel];
const root = process.cwd();
const tauriPath = path.join(root, 'Backend', 'tauri.conf.json');
const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));

tauri.identifier = cfg.identifier;
tauri.productName = cfg.productName;
if (tauri.app?.windows?.[0]) {
  tauri.app.windows[0].title = cfg.windowTitle;
}
if (tauri.plugins?.updater) {
  delete tauri.plugins.updater;
  if (Object.keys(tauri.plugins).length === 0) delete tauri.plugins;
}
tauri.bundle = tauri.bundle || {};
tauri.bundle.createUpdaterArtifacts = false;

fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
console.log(`Canal ${channel}: ${cfg.identifier} / ${cfg.productName}`);
