#!/usr/bin/env node
/**
 * Aplica identifier/productName/endpoints por canal antes do build Tauri.
 * Uso: node scripts/apply-channel-config.mjs --channel stable|dev [--tag v0.0.12]
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
  console.error('Canal inválido. Use: --channel stable|dev [--tag v0.0.12]');
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

const repo = process.env.GITHUB_REPOSITORY || 'ancaped/NatumHub';
const tag = getArg('tag') || process.env.RELEASE_TAG || '';

// O plugin updater do Tauri exige HTTPS em todos os endpoints — nunca incluir
// o endpoint local http://127.0.0.1 aqui, mesmo como fallback de dev.
const endpoints = [
  tag
    ? `https://github.com/${repo}/releases/download/${tag}/updater-${channel}.json`
    : `https://github.com/${repo}/releases/latest/download/updater-${channel}.json`,
];

if (tauri.plugins?.updater) {
  tauri.plugins.updater.endpoints = endpoints;
}

fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
console.log(`Canal ${channel}: ${cfg.identifier} / ${cfg.productName}`);
console.log('Updater endpoints:', endpoints.join(', '));
