#!/usr/bin/env node
/**
 * Aplica identifier/productName/endpoints Estável antes do build Tauri.
 * Uso: node scripts/apply-channel-config.mjs [--tag v0.0.12]
 */
import fs from 'fs';
import path from 'path';

const STABLE = {
  identifier: 'com.natum.hub.stable',
  productName: 'NatumHub',
  windowTitle: 'Natum Hub',
};

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

const channel = getArg('channel');
if (channel && channel !== 'stable') {
  console.error('Somente canal stable é suportado. Use: --channel stable [--tag v0.0.12]');
  process.exit(1);
}

const root = process.cwd();
const tauriPath = path.join(root, 'Backend', 'tauri.conf.json');
const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));

tauri.identifier = STABLE.identifier;
tauri.productName = STABLE.productName;
if (tauri.app?.windows?.[0]) {
  tauri.app.windows[0].title = STABLE.windowTitle;
}

const repo = process.env.GITHUB_REPOSITORY || 'ancaped/NatumHub';
const tag = getArg('tag') || process.env.RELEASE_TAG || '';
const port = process.env.API_PORT || '3001';

const endpoints = [`http://127.0.0.1:${port}/api/hub/updater-manifest/stable`];
if (tag) {
  endpoints.push(`https://github.com/${repo}/releases/download/${tag}/updater-stable.json`);
}

if (tauri.plugins?.updater) {
  tauri.plugins.updater.endpoints = endpoints;
}

fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
console.log(`Release Estável: ${STABLE.identifier} / ${STABLE.productName}`);
console.log('Updater endpoints:', endpoints.join(', '));
