#!/usr/bin/env node
/**
 * Gera/atualiza updater-stable.json após build Tauri.
 * Uso: node scripts/update-updater-manifest.mjs --version 0.0.12 --sig path/to/file.sig --url https://...
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

const channel = getArg('channel') || 'stable';
const version = getArg('version');
const sigPath = getArg('sig');
const url = getArg('url');
const notes = getArg('notes') || `NatumHub ${version}`;
const outDir = getArg('out') || process.cwd();

if (!version || !url) {
  console.error('Uso: --version X.Y.Z [--sig file.sig] --url https://... [--channel stable]');
  process.exit(1);
}

if (channel !== 'stable') {
  console.error('Somente canal stable é suportado.');
  process.exit(1);
}

if (/alpha|beta/i.test(version)) {
  console.error('Versão Estável não pode conter alpha/beta no número.');
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

const outFile = path.join(outDir, 'updater-stable.json');
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n');
console.log('Escrito:', outFile);
