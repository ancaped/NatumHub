#!/usr/bin/env node
/**
 * Grava settings de release GitHub no PostgreSQL (sync de manifests no app).
 * Token: GH_TOKEN, .github_token ou `gh auth token`
 */
import { execSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const requireFromBackend = createRequire(path.join(root, 'Backend', 'package.json'));

function readDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  for (const name of ['postgres.env', 'supabase.env']) {
    const p = path.join(root, 'Saves', name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (t.startsWith('DATABASE_URL=')) {
        return t.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  throw new Error('DATABASE_URL não encontrada (Saves/postgres.env ou supabase.env)');
}

function readGithubToken() {
  if (process.env.GH_TOKEN?.trim()) return process.env.GH_TOKEN.trim();
  const tokenFile = path.join(root, '.github_token');
  if (fs.existsSync(tokenFile)) {
    return fs.readFileSync(tokenFile, 'utf8').trim();
  }
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Token GitHub não encontrado. Use GH_TOKEN, .github_token ou gh login.');
  }
}

async function main() {
  const pg = requireFromBackend('pg');
  const url = readDatabaseUrl();
  const token = readGithubToken();
  const repo = process.env.GITHUB_REPOSITORY || 'ancaped/NatumHub';
  const branch = process.env.GITHUB_BRANCH || 'main';

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const upsert = async (key, value) => {
    await client.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  };

  await upsert('github_release_repo', repo);
  await upsert('github_release_branch', branch);
  await upsert('github_release_token', token);

  await client.end();
  console.log(`✓ settings: github_release_repo=${repo}, github_release_branch=${branch}, token=***`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
