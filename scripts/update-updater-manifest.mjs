#!/usr/bin/env node
/**
 * Gera/atualiza updater-{channel}.json após build Tauri.
 * Uso: node scripts/update-updater-manifest.mjs --channel alpha --version 0.0.11-alpha --sig path/to/file.sig --url https://...
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

const channel = getArg('channel');
const version = getArg('version');
const sigPath = getArg('sig');
const url = getArg('url');
const notes = getArg('notes') || `NatumHub ${version} — canal ${channel}`;
const outDir = getArg('out') || process.cwd();

if (!channel || !version || !url) {
  console.error('Uso: --channel alpha|beta|stable --version X.Y.Z [--sig file.sig] --url https://...');
  process.exit(1);
}

if (!['alpha', 'beta', 'stable'].includes(channel)) {
  console.error('Canal inválido:', channel);
  process.exit(1);
}

let signature = '';
if (sigPath && fs.existsSync(sigPath)) {
  signature = fs.readFileSync(sigPath, 'utf8').trim();
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url,
    },
  },
};

const outFile = path.join(outDir, `updater-${channel}.json`);
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n');
console.log('Escrito:', outFile);
