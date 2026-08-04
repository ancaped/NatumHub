/**
 * Extrai texto dos .docx da pasta POP'S → Backend/src/modules/qualidade/pops/seed_bodies.json
 *
 * Uso:
 *   node scripts/extract-pop-bodies.mjs
 *   node scripts/extract-pop-bodies.mjs "C:\caminho\POP'S"
 *   node scripts/extract-pop-bodies.mjs  (fallback: Saves/pops/source)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'Backend', 'src', 'modules', 'qualidade', 'pops', 'seed_bodies.json');

function desktopPops() {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'OneDrive', 'Área de Trabalho', "POP'S"),
    path.join(home, 'OneDrive', 'Desktop', "POP'S"),
    path.join(home, 'Desktop', "POP'S"),
    path.join(ROOT, 'Saves', 'pops', 'source'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function walkDocx(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkDocx(full, acc);
    else if (name.toLowerCase().endsWith('.docx') && !name.startsWith('~$')) acc.push(full);
  }
  return acc;
}

function codeFromFilename(filePath) {
  const base = path.basename(filePath, '.docx');
  const upper = base.toUpperCase().replace(/\bPDR\b/g, 'PRD');

  let m = upper.match(/POP\s*0*(\d+)\s*(ADM|ATD|EXP|PRD)\b/);
  if (m) {
    const n = m[1].padStart(3, '0');
    return `POP-${m[2]}-${n}`;
  }
  m = upper.match(/\b(ADM|ATD|EXP|PRD)\s*0*(\d+)\b/);
  if (m) {
    const n = m[2].padStart(3, '0');
    return `POP-${m[1]}-${n}`;
  }
  // Elaboração / Revalidação
  if (/ELABORA/.test(upper) && /001|POP\s*1\b/.test(upper)) return 'POP-001';
  if (/REVALIDA/.test(upper) && /002|POP\s*2\b/.test(upper)) return 'POP-002';
  m = upper.match(/POP\s*0*(\d+)\b/);
  if (m) {
    const n = m[1].padStart(3, '0');
    if (n === '001') return 'POP-001';
    if (n === '002') return 'POP-002';
  }
  return null;
}

/** Remove faixa de cabeçalho/rodapé tipica do Word, mantém o miolo do procedimento. */
function trimPopBoilerplate(text) {
  let s = text;
  const startRe =
    /(?:^|\n)\s*(?:\d+\.\s*)?(OBJETIVO|1\.\s*OBJETIVO)\s*[:.]?/i;
  const mStart = startRe.exec(s);
  if (mStart && mStart.index > 0) {
    s = s.slice(mStart.index).replace(/^\n+/, '');
  }
  const endRe =
    /\n\s*(ELABORADO|REVISADO|APROVADO)\s*[:.]?\s*\n/i;
  const mEnd = endRe.exec(s);
  if (mEnd && mEnd.index > 80) {
    s = s.slice(0, mEnd.index).trimEnd();
  }
  return s.trim();
}

function xmlToText(xml) {
  let s = xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

function extractDocxText(docxPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pop-docx-'));
  try {
    const zipPath = path.join(tmp, 'doc.zip');
    fs.copyFileSync(docxPath, zipPath);
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir);
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const xmlPath = path.join(outDir, 'word', 'document.xml');
    if (!fs.existsSync(xmlPath)) return '';
    return xmlToText(fs.readFileSync(xmlPath, 'utf8'));
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function main() {
  const argPath = process.argv[2];
  const root = argPath || desktopPops();
  if (!root) {
    console.error('Pasta POP\'S não encontrada. Passe o caminho ou copie para Saves/pops/source/');
    process.exit(1);
  }
  console.log('Fonte:', root);
  const files = walkDocx(root);
  console.log('Arquivos .docx:', files.length);

  /** @type {Record<string, { body: string, source: string }>} */
  const bodies = {};
  let ok = 0;
  let fail = 0;
  for (const f of files) {
    const code = codeFromFilename(f);
    if (!code) {
      console.warn('Sem código:', path.basename(f));
      fail++;
      continue;
    }
    try {
      const body = trimPopBoilerplate(extractDocxText(f));
      if (!body) {
        console.warn('Vazio:', code, path.basename(f));
        fail++;
        continue;
      }
      bodies[code] = {
        body,
        source: path.relative(root, f).split(path.sep).join('/'),
      };
      ok++;
      console.log('OK', code, `(${body.length} chars)`);
    } catch (e) {
      console.warn('Erro', code, e.message || e);
      fail++;
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(bodies, null, 2), 'utf8');
  console.log(`\nEscrito ${Object.keys(bodies).length} entradas → ${OUT}`);
  console.log(`ok=${ok} fail=${fail}`);
}

main();
