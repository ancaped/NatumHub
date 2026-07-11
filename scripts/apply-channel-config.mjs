#!/usr/bin/env node
/**
 * Aplica identifier/productName/endpoints por canal antes do build Tauri.
 * Uso: node scripts/apply-channel-config.mjs --channel stable|beta|alpha [--tag v0.0.12]
 */
import fs from 'fs';
import path from 'path';

const CHANNELS = {
  stable: {
    identifier: 'com.natum.hub.stable',
    productName: 'NatumHub Estável',
    windowTitle: 'Natum Hub — Estável',
    shortName: 'Estável',
  },
  beta: {
    identifier: 'com.natum.hub.beta',
    productName: 'NatumHub Beta',
    windowTitle: 'Natum Hub — Beta',
    shortName: 'Beta',
  },
  alpha: {
    identifier: 'com.natum.hub.alpha',
    productName: 'NatumHub Alpha',
    windowTitle: 'Natum Hub — Alpha',
    shortName: 'Alpha',
  },
};

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

const channel = getArg('channel');
if (!channel || !CHANNELS[channel]) {
  console.error('Uso: node scripts/apply-channel-config.mjs --channel stable|beta|alpha [--tag v0.0.12]');
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
const port = process.env.API_PORT || '3001';

const endpoints = [`http://127.0.0.1:${port}/api/hub/updater-manifest/${channel}`];
if (tag) {
  endpoints.push(`https://github.com/${repo}/releases/download/${tag}/updater-${channel}.json`);
}

if (tauri.plugins?.updater) {
  tauri.plugins.updater.endpoints = endpoints;
}

fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
console.log(`Canal ${channel}: ${cfg.identifier} / ${cfg.productName}`);
console.log('Updater endpoints:', endpoints.join(', '));
