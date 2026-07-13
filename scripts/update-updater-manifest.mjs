#!/usr/bin/env node
/**
 * Gera/atualiza updater-{channel}.json após build Tauri.
 * Uso: node scripts/update-updater-manifest.mjs --channel stable|dev --version 0.0.12 --url https://... [--sig path/to/file.sig]
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
const notesArg = getArg('notes');
const outDir = getArg('out') || process.cwd();

if (!version || !url) {
  console.error('Uso: --channel stable|dev --version X.Y.Z --url https://... [--sig file.sig] [--notes texto]');
  process.exit(1);
}

if (channel !== 'stable' && channel !== 'dev') {
  console.error('Canal inválido. Use stable ou dev.');
  process.exit(1);
}

if (channel === 'stable' && /alpha|beta/i.test(version)) {
  console.error('Versão Principal não pode conter alpha/beta no número.');
  process.exit(1);
}

const notes =
  notesArg ||
  (channel === 'dev' ? `NatumHub Dev ${version}` : `NatumHub ${version}`);

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
