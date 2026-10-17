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

/**
 * Extrai e limpa o texto dos .docx dos POPs:
 * - Extrai a revisão real (ex: 08, 09) do cabeçalho
 * - Extrai datas de vigência (ex: 2025-09-02)
 * - Extrai assinaturas (Elaborado, Revisado, Aprovado)
 * - Remove TODOS os blocos de cabeçalho, rodapé e tabelas repetidas do corpo
 *
 * Gera: Backend/src/modules/qualidade/pops/seed_bodies.json
 */
function cleanPopTextAndMetadata(rawText) {
  let s = rawText;

  // 1. Extrai revisão (ex: REVISÃO:\n\n08 ou REVISÃO: 09)
  let revision = 1;
  const revMatch = s.match(/REVIS[ÃA]O\s*[:.]?\s*\n*\s*0*(\d+)/i);
  if (revMatch) {
    const r = parseInt(revMatch[1], 10);
    if (!isNaN(r) && r > 0) revision = r;
  }

  // 2. Extrai datas no formato DD/MM/YYYY
  const dateMatches = Array.from(s.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g));
  let effectiveDate = null;
  if (dateMatches.length > 0) {
    // Pega a maior data (mais recente) encontrada no documento
    const isoDates = dateMatches
      .map((m) => `${m[3]}-${m[2]}-${m[1]}`)
      .sort();
    effectiveDate = isoDates[isoDates.length - 1];
  }

  // 3. Extrai assinaturas se existirem
  let elaboratedBy = 'Responsável Técnico';
  let reviewedBy = 'Equipe de Controle de Qualidade';
  let approvedBy = null;

  const elabM = s.match(/Elaborado\s+por\s*[:.]?\s*\n+([^\n]+(?:\n+[^\n]+)?)/i);
  if (elabM) {
    const lines = elabM[1].split('\n').map(l => l.trim()).filter(l => l && !/revisado|aprovado|data/i.test(l));
    if (lines.length > 0) elaboratedBy = lines.join(' - ');
  }

  const revM = s.match(/Revisado\s+por\s*[:.]?\s*\n+([^\n]+(?:\n+[^\n]+)?)/i);
  if (revM) {
    const lines = revM[1].split('\n').map(l => l.trim()).filter(l => l && !/aprovado|data|elaborado/i.test(l));
    if (lines.length > 0) reviewedBy = lines.join(' - ');
  }

  const aprM = s.match(/Aprovado\s+por\s*[:.]?\s*\n+([^\n]+)/i);
  if (aprM) {
    const line = aprM[1].trim();
    if (line && !/^[\s_.-]+$/.test(line) && !/data/i.test(line)) {
      approvedBy = line;
    }
  }

  // 4. Limpeza rigorosa do corpo (Remover blocos repetidos de cabeçalhos e rodapés)

  // Remove blocos de assinaturas (Elaborado por ... Aprovado por ... DATA: ...)
  s = s.replace(
    /Elaborado\s+por\s*[:.]?[\s\S]*?(?:Aprovado\s+por\s*[:.]?|DATA\s*[:.]?\s*\d{2}\/\d{2}\/\d{4})[\s\S]*?(?=\n\s*(?:\d+\.\s*)?[A-ZÁÉÍÓÚÇ]{3,}|$)/gi,
    '\n'
  );
  s = s.replace(/Elaborado\s+por\s*[:.]?[\s\S]*?(?=\n\s*(?:\d+\.\s*)?[A-ZÁÉÍÓÚÇ]{3,}|$)/gi, '\n');
  s = s.replace(/Revisado\s+por\s*[:.]?[\s\S]*?(?=\n\s*(?:\d+\.\s*)?[A-ZÁÉÍÓÚÇ]{3,}|$)/gi, '\n');
  s = s.replace(/Aprovado\s+por\s*[:.]?[\s\S]*?(?=\n\s*(?:\d+\.\s*)?[A-ZÁÉÍÓÚÇ]{3,}|$)/gi, '\n');

  // Remove blocos de cabeçalho do documento (Procedimento Operacional Padrão ... REVISÃO ... PÁGINA ...)
  s = s.replace(
    /Procedimento\s+Operacional\s+Padr[ãa]o[\s\S]*?(?:P[ÁA]GINA\s*[:.]?\s*\d+\s+de\s+\d+|CÓDIC?O\s*[:.]?\s*POP-[A-Z0-9-]+)/gi,
    '\n'
  );
  s = s.replace(/(?:P[ÁA]GINA|PAGINA)\s*[:.]?\s*\n*\s*\d+\s+de\s+\d+/gi, '');
  s = s.replace(/CÓDIC?O\s*[:.]?\s*\n*\s*POP-[A-Z0-9-]+/gi, '');
  s = s.replace(/REVIS[ÃA]O\s*[:.]?\s*\n*\s*\d+/gi, '');

  // Remove linhas de traços/sublinhados soltas e "DATA: xx/xx/xxxx" isolados no final
  s = s.replace(/^[\s_.-]+$/gm, '');
  s = s.replace(/^DATA\s*[:.]?\s*\n*\s*\d{2}\/\d{2}\/\d{4}$/gmi, '');

  // Garante que o corpo comece no Objetivo (se existir)
  const mStart = /(?:^|\n)\s*(?:\d+\.\s*|\d+\s*-\s*)?(OBJETIVO[S]?|1\.\s*OBJETIVO[S]?)\s*[:.]?/i.exec(s);
  if (mStart && mStart.index > 0) {
    s = s.slice(mStart.index);
  }

  // Normaliza quebras de linha múltiplas
  s = s
    .split('\n')
    .map((l) => l.trim())
    .filter((l, idx, arr) => {
      // Remove linhas residuais isoladas de DATA ou assinaturas
      if (/^DATA\s*[:.]?/i.test(l) && idx > arr.length - 5) return false;
      if (/^Elaborado|^Revisado|^Aprovado/i.test(l)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    body: s,
    revision,
    effectiveDate,
    elaboratedBy,
    reviewedBy,
    approvedBy,
  };
}

function main() {
  const argPath = process.argv[2];
  const root = argPath || desktopPops();
  if (!root) {
    console.error("Pasta POP'S não encontrada. Passe o caminho ou copie para Saves/pops/source/");
    process.exit(1);
  }
  console.log('Fonte:', root);
  const files = walkDocx(root);
  console.log('Arquivos .docx:', files.length);

  /** @type {Record<string, { body: string, revision: number, effectiveDate: string|null, elaboratedBy: string, reviewedBy: string, approvedBy: string|null, source: string }>} */
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
      const rawText = extractDocxText(f);
      const cleaned = cleanPopTextAndMetadata(rawText);
      if (!cleaned.body) {
        console.warn('Vazio:', code, path.basename(f));
        fail++;
        continue;
      }
      bodies[code] = {
        ...cleaned,
        source: path.relative(root, f).split(path.sep).join('/'),
      };
      ok++;
      console.log('OK', code, `(Rev ${cleaned.revision}, ${cleaned.body.length} chars)`);
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
