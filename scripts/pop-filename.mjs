/** Parse puro do nome de arquivo dos POPs → { setor, numero, codigo, titulo }. Usado por extract-pop-bodies.mjs. */

/** Pasta (em pt-BR, sem acento, maiúscula) → id do setor em pop_sectors. */
export const SETOR_POR_PASTA = {
  'ADMINISTRACAO': 'adm',
  'ALMOXARIFADO': 'almox',
  'ATENDIMENTO': 'atd',
  'CONTROLE DE QUALIDADE': 'cql',
  'ELABORACAO E REVALIDACAO': 'adm',
  'EXPEDICAO': 'exp',
  'PRODUCAO': 'prd',
};

/** Sigla no nome do arquivo → id do setor. */
const SETOR_POR_SIGLA = { ADM: 'adm', ALM: 'almox', ATD: 'atd', CQL: 'cql', EXP: 'exp', PRD: 'prd' };
/** Id do setor → sigla usada no código. */
export const SIGLA_POR_SETOR = { adm: 'ADM', almox: 'ALM', atd: 'ATD', cql: 'CQL', exp: 'EXP', prd: 'PRD' };

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const CORRECOES_TITULO = [
  [/\bProtudos\b/g, 'Produtos'],
  [/\bAtestt\b/g, 'Atest'],
];

export function limparTitulo(t) {
  let s = t
    .replace(/\((NOVO|novo)\)/g, ' ')
    .replace(/\s*-\s*novo\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, to] of CORRECOES_TITULO) s = s.replace(re, to);
  return s.replace(/[\s.-]+$/, '').trim();
}

/**
 * @param {string} nomeArquivo com ou sem .docx
 * @param {string} [pasta] nome da pasta do setor (fallback quando o nome não traz a sigla)
 * @returns {{ setor: string, numero: string, codigo: string, titulo: string } | null}
 */
export function parseNomeArquivo(nomeArquivo, pasta = '') {
  const base = nomeArquivo.replace(/\.docx$/i, '').trim();
  const up = semAcento(base).toUpperCase();

  // Arquivos de Elaboração / Revalidação (001 e 002) pertencem ao ADM.
  let m = up.match(/^(ELABORACAO|REVALIDACAO)\s+DO\s+POP\s*0*(\d+)\s*$/);
  if (m) {
    const numero = m[2].padStart(3, '0');
    const titulo = m[1] === 'ELABORACAO' ? 'Elaboração do POP' : 'Revalidação do POP';
    return { setor: 'adm', numero, codigo: `POP-ADM-${numero}`, titulo };
  }

  // POP 035 CQL …, POP 051ADM …, POP 061CQL …, POP 039 PDR … (erro de digitação de PRD).
  m = base.match(/^POP\s*0*(\d+)\s*([A-Za-z]{3})\b\s*(.*)$/);
  if (!m) return null;
  const numero = m[1].padStart(3, '0');
  let sigla = m[2].toUpperCase();
  if (sigla === 'PDR') sigla = 'PRD';
  let setor = SETOR_POR_SIGLA[sigla];
  if (!setor) {
    setor = SETOR_POR_PASTA[semAcento(pasta).toUpperCase()];
    if (!setor) return null;
    // sigla não reconhecida faz parte do título
    m[3] = `${m[2]} ${m[3]}`;
  }
  const titulo = limparTitulo(m[3]);
  return { setor, numero, codigo: `POP-${SIGLA_POR_SETOR[setor]}-${numero}`, titulo };
}
