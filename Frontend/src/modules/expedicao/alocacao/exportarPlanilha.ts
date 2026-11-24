import * as XLSX from 'xlsx';
import type { PainelAlocacaoResponse, PosicaoComItens, ProdutoDimensao } from './types';

function rotuloSituacao(s: string): string {
  switch (s) {
    case 'ok':
      return 'OK';
    case 'sem_caixa':
      return 'Sem caixa';
    case 'sem_qtde_cx':
      return 'Sem qtde/cx';
    case 'sem_endereco':
      return 'Sem endereço';
    case 'estoque_acima_capacidade':
      return 'Estoque > capacidade';
    case 'estouro_vao':
      return 'Estouro de vão';
    default:
      return s;
  }
}

function round2(n: number | null | undefined): number | string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return Math.round(n * 100) / 100;
}

export function montarWorkbookAlocacao(
  painel: PainelAlocacaoResponse,
  produtosFiltrados?: ProdutoDimensao[],
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const listaProds = produtosFiltrados ?? painel.produtos;

  // 1) Aba Dimensionamento ABC (espelha e amplia a planilha expedição_0309)
  const cabecalhoDim = [
    'Local Picking',
    'Local Pulmão',
    'Código',
    'Descrição',
    'Linha',
    'Situação Catálogo',
    'Curva ABC',
    'Vendas Varejo',
    'Média Varejo/Mês',
    'Vendas Atacado',
    'Média Atacado/Mês',
    'Vendas Total',
    'Média Total/Mês',
    'Qtde/Cx',
    'Origem Qtde/Cx',
    'Caixa Nº',
    'Origem Caixa',
    'A (cm)',
    'C (cm)',
    'L (cm)',
    'Camadas (Vão 1)',
    'Fileiras Larg.',
    'Caixas Comp.',
    'Total Caixas Aloc.',
    'Total Unid. Aloc.',
    'Altura Vão (cm)',
    'Picking Nec. (cx)',
    'Pulmão Nec. (cx)',
    'Cobertura Aloc. (meses)',
    'Estoque ERP (un)',
    'Estoque ERP (cx)',
    'Situação Alocação',
  ];

  const linhasDim = listaProds.map((p) => {
    const primeira = p.alocacoes[0];
    const somaFileiras = p.alocacoes.reduce((acc, a) => acc + a.fileirasLargura, 0);
    return [
      p.enderecosPicking.join(', ') || '—',
      p.enderecosPulmao.join(', ') || '—',
      p.codigo,
      p.descricao,
      `${p.linhaPrefix} - ${p.nomeLinha}`,
      p.situacao,
      p.curvaAbc,
      Math.round(p.vendasVarejo),
      round2(p.mediaVarejo),
      Math.round(p.vendasAtacado),
      round2(p.mediaAtacado),
      Math.round(p.vendasTotal),
      round2(p.mediaTotal),
      p.qtdeCxEfetiva ?? '',
      p.qtdeCxOrigem,
      p.caixaCodigo ?? '',
      p.caixaOrigem,
      p.caixaAlturaCm ?? '',
      p.caixaComprimentoCm ?? '',
      p.caixaLarguraCm ?? '',
      primeira ? primeira.camadasAltura : '',
      somaFileiras || '',
      primeira ? primeira.caixasComprimento : '',
      p.totalCaixasAlocadas || '',
      p.totalUnidadesAlocadas || '',
      primeira ? primeira.alturaVaoCm : '',
      p.caixasNecessariasPicking,
      p.caixasNecessariasPulmao,
      round2(p.coberturaMesesAlocada),
      round2(p.estoqueAtual),
      p.estoqueCaixas ?? '',
      rotuloSituacao(p.situacaoAlocacao),
    ];
  });

  const wsDim = XLSX.utils.aoa_to_sheet([
    [
      'DIMENSIONAMENTO & CURVA ABC - EXPEDIÇÃO',
      `Janela: ${painel.janelaMeses} meses`,
      `Meta: ${painel.usarMetaLinha ? 'Da linha' : `${painel.metaMeses} meses`}`,
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    ],
    [],
    cabecalhoDim,
    ...linhasDim,
  ]);
  wsDim['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 42 }, { wch: 24 },
    { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 9 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
    { wch: 14 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDim, 'Dimensionamento ABC');

  // 2) Aba Mapa Estantes (grade visual por nível de cima para baixo, colunas G..A como na planilha)
  const estAtiva = painel.estruturas.find((e) => e.id === painel.estruturaAtivaId);
  const colunasOrdenadas = Array.from(
    new Map(painel.posicoes.map((p) => [p.coluna, p.colunaOrdem])).entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0]);

  const andaresOrdenados = Array.from(new Set(painel.posicoes.map((p) => p.andar))).sort(
    (a, b) => b - a,
  );
  const porCodigo = new Map<string, PosicaoComItens>();
  for (const pos of painel.posicoes) {
    porCodigo.set(pos.codigo, pos);
  }

  const linhasMapa: (string | number)[][] = [
    [
      `MAPA DA ESTRUTURA: ${estAtiva?.nome ?? painel.estruturaAtivaId}`,
      `Estrado: ${estAtiva?.estradoLarguraCm ?? 100} × ${estAtiva?.estradoComprimentoCm ?? 120} cm`,
    ],
    [],
  ];

  for (const andar of andaresOrdenados) {
    const posAndar = painel.posicoes.filter((p) => p.andar === andar);
    const niveis = Array.from(new Set(posAndar.map((p) => p.nivel))).sort((a, b) => b - a);
    const alturaAndar = posAndar[0]?.alturaCm ?? 0;
    const papelAndar = posAndar[0]?.papel === 'pulmao' ? 'PULMÃO' : 'PICKING';

    const rotuloAndar =
      andaresOrdenados.length === 1
        ? `Pátio / Chão · Nível ${andar}`
        : `Andar ${andar}`;
    const headerRow: (string | number)[] = [`${rotuloAndar} (${papelAndar} · Vão ${alturaAndar} cm)`];
    for (const col of colunasOrdenadas) {
      for (const nv of niveis) {
        headerRow.push(`${col}${nv}`);
        headerRow.push('Larg (cm)');
      }
    }
    linhasMapa.push(headerRow);

    const maxItens = Math.max(
      1,
      ...posAndar.map((p) => p.itens.length),
    );
    for (let idx = 0; idx < maxItens; idx++) {
      const itemRow: (string | number)[] = [idx === 0 ? 'Produtos' : ''];
      for (const col of colunasOrdenadas) {
        for (const nv of niveis) {
          const pos = posAndar.find((p) => p.coluna === col && p.nivel === nv);
          const item = pos?.itens[idx];
          if (item) {
            itemRow.push(`${item.produtoCodigo} (${item.fileirasLargura}x${item.camadasAltura})`);
            itemRow.push(round2(item.larguraOcupadaCm));
          } else {
            itemRow.push('');
            itemRow.push('');
          }
        }
      }
      linhasMapa.push(itemRow);
    }

    const totalRow: (string | number)[] = ['Total ocupado (cm)'];
    for (const col of colunasOrdenadas) {
      for (const nv of niveis) {
        const pos = posAndar.find((p) => p.coluna === col && p.nivel === nv);
        totalRow.push(pos ? `${pos.totalCaixas} cx` : '');
        totalRow.push(pos ? round2(pos.larguraOcupadaCm) : '');
      }
    }
    linhasMapa.push(totalRow);
    linhasMapa.push([]);
  }

  const wsMapa = XLSX.utils.aoa_to_sheet(linhasMapa);
  XLSX.utils.book_append_sheet(wb, wsMapa, 'Mapa Estantes');

  // 3) Aba Caixas
  const wsCaixas = XLSX.utils.aoa_to_sheet([
    ['Código', 'Nome', 'Altura (cm)', 'Comprimento (cm)', 'Largura (cm)', 'Empilhamento Máx.', 'Insumo ERP', 'Ativa', 'Observações'],
    ...painel.caixas.map((c) => [
      c.codigo,
      c.nome,
      c.alturaCm,
      c.comprimentoCm,
      c.larguraCm,
      c.empilhamentoMax,
      c.insumoErpCodigo ?? '',
      c.ativo ? 'Sim' : 'Não',
      c.observacoes ?? '',
    ]),
  ]);
  wsCaixas['!cols'] = [
    { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 12 },
    { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCaixas, 'Caixas');

  // 4) Aba Conferência ERP
  const pendencias = painel.produtos.filter((p) => p.situacaoAlocacao !== 'ok');
  const wsConf = XLSX.utils.aoa_to_sheet([
    ['Código', 'Descrição', 'Linha', 'Pendência', 'Caixa Atual', 'Insumo ERP (Fórmula)', 'Qtde/Cx Efetiva', 'Qtde/Cx ERP', 'Estoque (un)', 'Estoque (cx)', 'Cap. Alocada (cx)'],
    ...pendencias.map((p) => [
      p.codigo,
      p.descricao,
      `${p.linhaPrefix} - ${p.nomeLinha}`,
      rotuloSituacao(p.situacaoAlocacao),
      p.caixaCodigo ?? '',
      p.insumoCaixaErp ? `${p.insumoCaixaErp} (${p.insumoCaixaErpDesc ?? ''})` : '',
      p.qtdeCxEfetiva ?? '',
      p.qtdeCxErp ?? '',
      round2(p.estoqueAtual),
      p.estoqueCaixas ?? '',
      p.totalCaixasAlocadas,
    ]),
  ]);
  wsConf['!cols'] = [
    { wch: 12 }, { wch: 42 }, { wch: 22 }, { wch: 22 }, { wch: 12 },
    { wch: 32 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsConf, 'Conferencia ERP');

  return wb;
}

export function baixarPlanilhaAlocacao(
  painel: PainelAlocacaoResponse,
  produtosFiltrados?: ProdutoDimensao[],
): string {
  const wb = montarWorkbookAlocacao(painel, produtosFiltrados);
  const stamp = new Date().toISOString().slice(0, 10);
  const nome = `expedicao-alocacao-${stamp}.xlsx`;
  XLSX.writeFile(wb, nome);
  return nome;
}
