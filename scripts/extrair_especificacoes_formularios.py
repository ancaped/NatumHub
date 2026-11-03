#!/usr/bin/env python3
"""Lê os .docx originais da pasta local 'Formulários Natum - Em uso/' e lista, por formulário do seed, o texto que fica
fora das colunas de registro (parágrafos depois da última tabela e linhas de legenda de uma célula só).
Só leitura. Uso: python3 scripts/extrair_especificacoes_formularios.py [--bruto]
(--bruto mostra também os parágrafos e linhas antes da tabela, para conferência)."""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
RAIZ = Path(__file__).resolve().parent.parent / 'Formulários Natum - Em uso'

# código do formulário no Nexus -> (código antigo, versão) do arquivo de origem; o primeiro que existir vale.
ORIGEM = {
    'FOR-CQL-012-01': [('FOR-CQL-012', 'v.01')],
    'FOR-CQL-015-01': [('FOR-CQL-015', 'V.01')],
    'FOR-CQL-017-01': [('FOR-CQL-017', 'v.01')],
    'FOR-CQL-023-01': [('FOR-CQL-023', 'v.01')],
    'FOR-CQL-023-02': [('FOR-CQL-023', 'v.02')],
    'FOR-CQL-035-01': [('FOR-CQL-035', 'v.01')],
    'FOR-CQL-035-02': [('FOR-CQL-035', 'v.02')],
    'FOR-CQL-035-03': [('FOR-CQL-035', 'v.03'), ('FOR-CQL-035', 'v.06')],
    'FOR-CQL-035-04': [('FOR-CQL-035', 'v.04')],
    'FOR-CQL-035-05': [('FOR-CQL-035', 'v.05')],
    'FOR-CQL-035-06': [('FOR-CQL-035', 'v.07')],
    'FOR-CQL-035-07': [('FOR-CQL-035', 'v.08')],
    'FOR-CQL-048-01': [('FOR-CQL-048', 'v.01')],
    'FOR-CQL-074-01': [('FOR-CQL-076', 'v.01')],
    'FOR-CQL-029-01': [('FOR-CQL-083', 'v.0')],
    'FOR-PRD-047-01': [('FOR-PRD-047', 'v.02'), ('FOR-PRD-047', 'v.01 Registro')],
    'FOR-PRD-047-02': [('FOR-PRD-047', 'v.01Limpeza'), ('FOR-PRD-047', 'v.03')],
    'FOR-PRD-058-01': [('FOR-PRD-058', 'v.01')],
    'FOR-PRD-058-02': [('FOR-PRD-058', 'v.02')],
}


def achar(codigo, versao):
    achados = []
    for pasta in ('Imprimir', 'Editável'):  # prefere Imprimir
        for p in sorted(RAIZ.glob(f'*/{pasta}/*')):
            if p.suffix.lower() != '.docx':
                continue
            n = p.name.lower()
            if codigo.lower() in n and versao.lower() in n:
                achados.append(p)
        if achados:
            return achados[0]
    return None


def _negrito(r):
    rpr = r.find(W + 'rPr')
    b = rpr.find(W + 'b') if rpr is not None else None
    return b is not None and b.get(W + 'val') not in ('0', 'false')


def texto(el):
    """Texto de um bloco. Quebra do Word (<w:br/>, outro parágrafo) vira \\n; trecho em negrito depois de texto comum
    abre item novo (nos originais cada especificação começa com o título em negrito)."""
    partes = []
    for p in (el.iter(W + 'p') if el.tag != W + 'p' else [el]):
        linha = ''
        anterior_negrito = True
        for r in p.iter(W + 'r'):
            frag = ''
            for n in r:
                if n.tag == W + 't':
                    frag += n.text or ''
                elif n.tag == W + 'br':
                    frag += '\n'
                elif n.tag == W + 'tab':
                    frag += ' '
            if not frag.strip():
                linha += frag
                continue
            neg = _negrito(r)
            if neg and not anterior_negrito and linha.strip():
                linha += '\n'
            anterior_negrito = neg
            linha += frag
        partes.append(linha)
    linhas = [re.sub(r'[ \t\u00a0]+', ' ', l).strip() for l in '\n'.join(partes).split('\n')]
    return '\n'.join(l for l in linhas if l)


def limpar(item):
    """Só espaço: duplo vira simples, sem espaço antes da vírgula e um depois dela. O texto das palavras fica como no original."""
    item = re.sub(r'\s+', ' ', item).strip()
    item = re.sub(r' ,', ',', item)
    return re.sub(r',(?=[A-Za-zÀ-ÿ])', ', ', item)


def blocos(caminho):
    """Corpo na ordem: ('p', texto) ou ('t', [linhas de células])."""
    with zipfile.ZipFile(caminho) as z:
        raiz = ET.fromstring(z.read('word/document.xml'))
    corpo = raiz.find(W + 'body')
    out = []
    for el in corpo:
        if el.tag == W + 'p':
            t = texto(el)
            if t:
                out.append(('p', t))
        elif el.tag == W + 'tbl':
            linhas = []
            for tr in el.findall(W + 'tr'):
                celulas = []
                for tc in tr.findall(W + 'tc'):
                    celulas.append(texto(tc))
                linhas.append(celulas)
            out.append(('t', linhas))
    return out


RUIDO = re.compile(r'^(m[eê]s|ano|folha|p[aá]gina|fo[r]?-|c[oó]digo|vers[aã]o|revis[aã]o|vig[eê]ncia|elaborado|aprovado|data da aprova|assinatura|respons[aá]vel|rubrica|natum)', re.I)


def rodape(caminho):
    """Texto de rodapé/cabeçalho (ex.: FOR-CQL-076 guarda as trocas de filtro no rodapé)."""
    out = []
    with zipfile.ZipFile(caminho) as z:
        for n in z.namelist():
            if re.match(r'word/(header|footer)\d*\.xml$', n):
                t = texto(ET.fromstring(z.read(n)))
                if t:
                    out.append(t)
    return out


def extrair_doc(caminho):
    """Arquivo .doc antigo (FOR-CQL-083): usa o catdoc e pega o que vem depois de OBSERVAÇÕES/ANORMALIDADES."""
    import subprocess
    t = subprocess.run(['catdoc', str(caminho)], capture_output=True, text=True).stdout
    m = re.search(r'OBSERVA[ÇC][ÕO]ES/ANORMALIDADES:\s*(.+)', t, re.S)
    return ['Observações/Anormalidades: ' + limpar(m.group(1))] if m else []


def extrair(caminho):
    b = blocos(caminho)
    ultima_tabela = max((i for i, (k, _) in enumerate(b) if k == 't'), default=-1)
    achados = []
    for i, (k, v) in enumerate(b):
        if k == 'p' and i > ultima_tabela:
            achados.append(v)
        elif k == 't':
            for celulas in v:
                unicas = [c for c in celulas if c]
                # linha de legenda: a linha toda é uma célula só (mescladas repetem o mesmo texto)
                if unicas and len(set(unicas)) == 1 and len(unicas[0]) > 25:
                    achados.append(unicas[0])
    achados += rodape(caminho)
    itens = [limpar(i) for a in achados for i in a.split('\n')]
    return [i for i in itens if i and not RUIDO.match(i)], b


if __name__ == '__main__':
    bruto = '--bruto' in sys.argv
    for code, opcoes in ORIGEM.items():
        arq = None
        for cod, ver in opcoes:
            arq = achar(cod, ver)
            if arq:
                break
        print(f'== {code}  <- {arq.relative_to(RAIZ) if arq else "sem .docx (lê o .doc antigo, se houver)"}')
        if not arq:
            doc = next(iter(RAIZ.glob('*/Imprimir/' + opcoes[0][0] + '-' + opcoes[0][1] + '*.doc')), None)
            for a in (extrair_doc(doc) if doc else []):
                print('   >', a)
            continue
        achados, b = extrair(arq)
        if bruto:
            for k, v in b:
                if k == 'p':
                    print('   [p]', v)
                else:
                    for l in v:
                        if any(l):
                            print('   [t]', ' | '.join(c.replace('\n', ' / ') for c in l))
        for a in achados:
            print('   >', a)
