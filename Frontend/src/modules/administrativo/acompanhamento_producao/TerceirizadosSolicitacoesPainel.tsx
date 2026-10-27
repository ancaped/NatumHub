import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Check, RefreshCw } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import { BotaoAcao, FilterBar, ReportTabs, StatusBadge, TabelaPainel, type VarianteBadge } from '../../geral/components/ui/ReportKit';
import { apiJson } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';
import { usePreviaServidor } from '../../producao/lib/usePreviaServidor';
import type { LinhaPrevia } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';
import { formatDateOnly, formatDateTime } from './lib/datas';
import { formatarUnidadesLote, getPrevisaoBadge, loteRowKey, parseUnitWeightFromDescription } from './lib/lotes';
import type { AcompanhamentoLote, TerceirizadoSolicitacao } from './lib/tipos';

type StatusSolicitacao = TerceirizadoSolicitacao['status'];

/** Rótulo e variante de selo de cada status da solicitação. */
export const STATUS_SOLICITACAO: Record<StatusSolicitacao, { rotulo: string; variante: VarianteBadge }> = {
  SOLICITADO: { rotulo: 'Solicitado', variante: 'aguardando' },
  APROVADO: { rotulo: 'Aprovado', variante: 'ordem' },
  VINCULADO: { rotulo: 'Vinculado', variante: 'ordem' },
  EM_FABRICACAO: { rotulo: 'Em fabricação externa', variante: 'ordem' },
  ENTREGUE: { rotulo: 'Entregue', variante: 'saudavel' },
  FINALIZADO: { rotulo: 'Finalizado', variante: 'saudavel' },
  CANCELADO: { rotulo: 'Cancelado', variante: 'descontinuado' },
};

const ORDEM_STATUS: StatusSolicitacao[] = ['SOLICITADO', 'APROVADO', 'VINCULADO', 'EM_FABRICACAO', 'ENTREGUE', 'FINALIZADO', 'CANCELADO'];
const ROTULO_ABA: Record<StatusSolicitacao, string> = {
  SOLICITADO: 'Solicitado',
  APROVADO: 'Aprovado',
  VINCULADO: 'Vinculado',
  EM_FABRICACAO: 'Em fabricação',
  ENTREGUE: 'Entregue',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

/** Depois de em fabricação, o vínculo e as aprovações não mudam mais. */
const STATUS_TRAVADO: StatusSolicitacao[] = ['EM_FABRICACAO', 'ENTREGUE', 'FINALIZADO', 'CANCELADO'];

const PROXIMO_PASSO: Partial<Record<StatusSolicitacao, { status: StatusSolicitacao; rotulo: string }>> = {
  VINCULADO: { status: 'EM_FABRICACAO', rotulo: 'Iniciar fabricação externa' },
  EM_FABRICACAO: { status: 'ENTREGUE', rotulo: 'Marcar como entregue' },
  ENTREGUE: { status: 'FINALIZADO', rotulo: 'Finalizar' },
};

const FORNECEDORES_PADRAO = ['DAC Cosméticos', 'Vhiory', 'Natum Cosméticos', 'Artnor', 'Inovatta'];

const rotuloStatus = (s?: string | null) => (s && STATUS_SOLICITACAO[s as StatusSolicitacao]?.rotulo) || s || '—';
const dataCurta = (iso?: string | null) => (iso ? formatDateOnly(iso) : 'sem data');

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
});

interface Props {
  solicitacoes: TerceirizadoSolicitacao[];
  loading: boolean;
  recarregar: () => Promise<void> | void;
  lotes: AcompanhamentoLote[];
  aoMudarLotes: () => void;
  irParaLote: (loteNumber: string) => void;
  avisar: (texto: string, tipo?: 'success' | 'error') => void;
  novaAberta: boolean;
  setNovaAberta: (v: boolean) => void;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-0.5">{rotulo}</div>
      <div className="text-xs text-zinc-800">{children}</div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 pt-3 border-t border-zinc-100 first:pt-0 first:border-t-0">
      <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">{titulo}</h4>
      {children}
    </section>
  );
}

const inputCls = 'w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900';

export default function TerceirizadosSolicitacoesPainel({
  solicitacoes, loading, recarregar, lotes, aoMudarLotes, irParaLote, avisar, novaAberta, setNovaAberta,
}: Props) {
  const aviso = useCallback((m: string, t?: 'sucesso' | 'erro' | 'info') => avisar(m, t === 'erro' ? 'error' : 'success'), [avisar]);
  const { pedir: pedirPrevia, elemento: previaElemento } = usePreviaServidor(aviso);

  const [aba, setAba] = useState('ativas');
  const [busca, setBusca] = useState('');
  const [abertaId, setAbertaId] = useState<number | null>(null);

  // Estado do Drawer de detalhe
  const [previsaoDraft, setPrevisaoDraft] = useState('');
  const [vincularLote, setVincularLote] = useState('');
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [lotesRemotos, setLotesRemotos] = useState<AcompanhamentoLote[]>([]);
  const [buscandoLotes, setBuscandoLotes] = useState(false);

  // Estado do Drawer "Nova solicitação"
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [qtdKg, setQtdKg] = useState('');
  const [qtdUn, setQtdUn] = useState('');
  const [pesoUn, setPesoUn] = useState<number | null>(null);
  const [pesoCustom, setPesoCustom] = useState(false);
  const [buscandoProduto, setBuscandoProduto] = useState(false);
  const [fornecedor, setFornecedor] = useState('');
  const [previsao, setPrevisao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [loteNovo, setLoteNovo] = useState('');

  const aberta = useMemo(() => solicitacoes.find(s => s.id === abertaId) ?? null, [solicitacoes, abertaId]);
  const travada = aberta ? STATUS_TRAVADO.includes(aberta.status) : false;

  // Previsão do rascunho acompanha o item aberto
  useEffect(() => {
    setPrevisaoDraft(aberta?.previsaoEntrega ? aberta.previsaoEntrega.split('T')[0] : '');
    setMotivoCancelar('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta?.id, aberta?.previsaoEntrega]);

  // Ao abrir uma solicitação sem lote, busca no ERP os lotes recentes do produto
  const abertaCodigo = aberta?.productCode;
  const abertaSemLote = Boolean(aberta && !aberta.loteNumber && !STATUS_TRAVADO.includes(aberta.status));
  useEffect(() => {
    setVincularLote('');
    setLotesRemotos([]);
    if (!abertaSemLote || !abertaCodigo?.trim()) return;
    let cancelado = false;
    setBuscandoLotes(true);
    apiJson<AcompanhamentoLote[]>(`/api/administrativo/acompanhamento-producao?search=${encodeURIComponent(abertaCodigo.trim())}`)
      .then(data => { if (!cancelado && Array.isArray(data)) setLotesRemotos(data); })
      .catch(err => console.warn('Erro ao buscar lotes recentes do produto para vínculo:', err))
      .finally(() => { if (!cancelado) setBuscandoLotes(false); });
    return () => { cancelado = true; };
  }, [abertaId, abertaSemLote, abertaCodigo]);

  // Lotes sugeridos para vínculo: mesmo produto, mais recentes primeiro, sem os já vinculados a outras solicitações
  const lotesSugeridos = useMemo(() => {
    if (!aberta) return [];
    const targetCode = (aberta.productCode || '').trim().toUpperCase();
    const targetDesc = (aberta.productDescription || '').trim().toLowerCase();

    const vinculados = new Set<string>();
    solicitacoes.forEach(s => {
      if (s.id !== aberta.id && s.loteNumber && s.status !== 'CANCELADO') vinculados.add(s.loteNumber.trim().toUpperCase());
    });

    const vistos = new Set<string>();
    const unicos: AcompanhamentoLote[] = [];
    for (const l of [...lotes, ...lotesRemotos]) {
      const num = (l.loteNumber || '').trim().toUpperCase();
      if (!num || vinculados.has(num) || vistos.has(num)) continue;
      const pCode = (l.productCode || '').trim().toUpperCase();
      let mesmo = false;
      if (targetCode && pCode) mesmo = pCode === targetCode;
      else if (targetDesc && l.productDescription) mesmo = l.productDescription.trim().toLowerCase() === targetDesc;
      if (!mesmo) continue;
      vistos.add(num);
      unicos.push(l);
    }

    return unicos.sort((a, b) => {
      const dateA = a.date || a.dataPrevisao || '';
      const dateB = b.date || b.dataPrevisao || '';
      if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
      const numA = parseInt((a.loteNumber || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.loteNumber || '').replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    });
  }, [aberta, lotes, lotesRemotos, solicitacoes]);

  const fornecedoresSugeridos = useMemo(() => {
    const daLista = solicitacoes.map(s => s.fornecedor?.trim()).filter(Boolean) as string[];
    return Array.from(new Set([...FORNECEDORES_PADRAO, ...daLista]));
  }, [solicitacoes]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    solicitacoes.forEach(s => { c[s.status] = (c[s.status] || 0) + 1; });
    return c;
  }, [solicitacoes]);

  const abas = useMemo(() => {
    const ativas = solicitacoes.filter(s => s.status !== 'FINALIZADO' && s.status !== 'CANCELADO').length;
    return [
      { id: 'ativas', label: 'Ativas', contagem: ativas },
      ...ORDEM_STATUS.filter(st => (contagem[st] || 0) > 0).map(st => ({ id: st, label: ROTULO_ABA[st], contagem: contagem[st] })),
      { id: 'todas', label: 'Todas', contagem: solicitacoes.length },
    ];
  }, [solicitacoes, contagem]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return solicitacoes.filter(s => {
      if (aba === 'ativas' && (s.status === 'FINALIZADO' || s.status === 'CANCELADO')) return false;
      if (aba !== 'ativas' && aba !== 'todas' && s.status !== aba) return false;
      if (!q) return true;
      return (s.productCode || '').toLowerCase().includes(q)
        || (s.productDescription || '').toLowerCase().includes(q)
        || (s.fornecedor || '').toLowerCase().includes(q)
        || (s.loteNumber || '').toLowerCase().includes(q);
    });
  }, [solicitacoes, aba, busca]);

  // ---------- Gravações (sempre pela prévia do servidor) ----------

  /** Linhas de "o que muda" a partir do item devolvido pelo servidor e do que a tela já sabe. */
  const linhasMudanca = (item: TerceirizadoSolicitacao, dados: any, extras: LinhaPrevia[] = []): LinhaPrevia[] => {
    const linhas: LinhaPrevia[] = [...extras];
    if (dados?.status && dados.status !== item.status) {
      linhas.push({ titulo: 'Status', detalhe: `${rotuloStatus(item.status)} → ${rotuloStatus(dados.status)}` });
    }
    if (Array.isArray(dados?.filaRetirados) && dados.filaRetirados.length > 0) {
      linhas.push({ titulo: 'Fila do Planejamento', detalhe: 'Sai da fila do Planejamento' });
    }
    if (linhas.length === 0) linhas.push({ titulo: 'Sem mudança', detalhe: 'Nada muda nesta solicitação.' });
    return linhas;
  };

  const tituloItem = (s: TerceirizadoSolicitacao) => `${s.productCode} — ${s.productDescription}`;

  const concluir = async (mexeEmLote: boolean) => {
    await recarregar();
    if (mexeEmLote) aoMudarLotes();
  };

  const alternarAprovacao = (item: TerceirizadoSolicitacao, tipo: 'embalagem' | 'materia_prima') => {
    const atual = Boolean(tipo === 'embalagem' ? item.aprovacaoEmbalagem : item.aprovacaoMateriaPrima);
    const nome = tipo === 'embalagem' ? 'Embalagem' : 'Matéria-prima';
    pedirPrevia({
      url: `/api/administrativo/terceirizados/solicitacoes/${item.id}/aprovar`,
      init: jsonInit('POST', { tipo, aprovado: !atual }),
      titulo: `${atual ? 'Desfazer aprovação' : 'Aprovar'}: ${nome}`,
      confirmarRotulo: atual ? 'OK, desfazer' : 'OK, aprovar',
      linhas: d => linhasMudanca(item, d, [{ titulo: nome, detalhe: atual ? 'Aprovada → Pendente' : 'Pendente → Aprovada' }]),
      erroPadrao: 'Não foi possível alterar a aprovação.',
      aoConcluir: () => concluir(false),
    });
  };

  const salvarPrevisao = (item: TerceirizadoSolicitacao) => {
    const nova = previsaoDraft.trim() || null;
    pedirPrevia({
      url: `/api/administrativo/terceirizados/solicitacoes/${item.id}/previsao`,
      init: jsonInit('POST', { previsaoEntrega: nova }),
      titulo: 'Previsão de entrega',
      confirmarRotulo: 'OK, salvar',
      linhas: () => [{ titulo: tituloItem(item), detalhe: `Previsão: ${dataCurta(item.previsaoEntrega)} → ${dataCurta(nova)}` }],
      erroPadrao: 'Não foi possível salvar a previsão.',
      aoConcluir: () => concluir(Boolean(item.loteNumber)),
    });
  };

  const vincular = (item: TerceirizadoSolicitacao) => {
    const lote = vincularLote.trim();
    if (!lote) {
      avisar('Informe o número do lote.', 'error');
      return;
    }
    pedirPrevia({
      url: `/api/administrativo/terceirizados/solicitacoes/${item.id}/vincular`,
      init: jsonInit('POST', { loteNumber: lote }),
      titulo: 'Vincular a lote do ERP',
      confirmarRotulo: 'OK, vincular',
      linhas: d => linhasMudanca(item, d, [
        { titulo: 'Lote', detalhe: `— → #${lote}` },
        { titulo: `Lote #${lote}`, detalhe: 'Passa a ser terceirizado' },
      ]),
      erroPadrao: 'Não foi possível vincular o lote.',
      aoConcluir: async () => {
        try {
          await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote)}/terceirizado?confirmar=true`, {
            method: 'POST',
            body: JSON.stringify({ isTerceirizado: true }),
          });
        } catch (err: any) {
          avisar('Solicitação vinculada, mas não foi possível marcar o lote como terceirizado: ' + (err?.message || err), 'error');
        }
        avisar(`Solicitação vinculada ao lote #${lote}!`);
        await concluir(true);
      },
    });
  };

  const desvincular = (item: TerceirizadoSolicitacao) => {
    pedirPrevia({
      url: `/api/administrativo/terceirizados/solicitacoes/${item.id}/desvincular`,
      init: jsonInit('POST'),
      titulo: 'Desvincular lote',
      confirmarRotulo: 'OK, desvincular',
      linhas: d => linhasMudanca(item, d, [
        { titulo: 'Lote', detalhe: `#${item.loteNumber ?? ''} → —` },
        ...(item.loteNumber ? [{ titulo: `Lote #${item.loteNumber}`, detalhe: 'Deixa de ser terceirizado' }] : []),
      ]),
      erroPadrao: 'Não foi possível desvincular o lote.',
      aoConcluir: () => concluir(true),
    });
  };

  const mudarStatus = (item: TerceirizadoSolicitacao, status: StatusSolicitacao, rotulo: string) => {
    pedirPrevia({
      url: `/api/administrativo/terceirizados/solicitacoes/${item.id}/status`,
      init: jsonInit('POST', { status }),
      titulo: rotulo,
      confirmarRotulo: 'OK',
      linhas: d => linhasMudanca(item, d, [{ titulo: tituloItem(item), detalhe: `Status: ${rotuloStatus(item.status)} → ${rotuloStatus(status)}` }]),
      erroPadrao: 'Não foi possível mudar o status.',
      aoConcluir: () => concluir(false),
    });
  };

  const cancelar = (item: TerceirizadoSolicitacao) => {
    const motivo = motivoCancelar.trim();
    pedirPrevia({
      url: `/api/administrativo/terceirizados/solicitacoes/${item.id}${motivo ? `?motivo=${encodeURIComponent(motivo)}` : ''}`,
      init: { method: 'DELETE' },
      titulo: 'Cancelar solicitação',
      confirmarRotulo: 'OK, cancelar',
      linhas: d => linhasMudanca(item, d, [
        { titulo: tituloItem(item), detalhe: `Status: ${rotuloStatus(item.status)} → Cancelado` },
        ...(item.loteNumber ? [{ titulo: `Lote #${item.loteNumber}`, detalhe: 'Deixa de ser terceirizado' }] : []),
        ...(motivo ? [{ titulo: 'Motivo', detalhe: motivo }] : []),
      ]),
      erroPadrao: 'Não foi possível cancelar a solicitação.',
      aoConcluir: () => concluir(true),
    });
  };

  // ---------- Nova solicitação ----------

  const limparNova = () => {
    setCodigo(''); setDescricao(''); setQtdKg(''); setQtdUn(''); setPesoUn(null); setPesoCustom(false);
    setFornecedor(''); setPrevisao(''); setObservacoes(''); setLoteNovo('');
  };

  const fecharNova = () => { setNovaAberta(false); limparNova(); };

  const aoDigitarCodigo = async (valor: string) => {
    const upper = valor.toUpperCase();
    setCodigo(upper);
    const limpo = upper.trim();
    if (limpo.length < 2) return;
    setBuscandoProduto(true);
    try {
      const res = await apiJson<{ codigo: string; descricao: string; pesoUnitarioKg?: number | null }>(
        `/api/administrativo/terceirizados/produto/${encodeURIComponent(limpo)}`
      );
      if (res && res.descricao) {
        setDescricao(res.descricao);
        const peso = res.pesoUnitarioKg || parseUnitWeightFromDescription(res.descricao);
        setPesoUn(peso || null);
        if (peso && peso > 0) {
          if (qtdKg && !qtdUn) {
            const kg = parseFloat(qtdKg);
            if (!isNaN(kg) && kg > 0) setQtdUn(Math.round(kg / peso).toString());
          } else if (qtdUn && !qtdKg) {
            const un = parseFloat(qtdUn);
            if (!isNaN(un) && un > 0) {
              const kg = un * peso;
              setQtdKg(Number.isInteger(kg) ? kg.toString() : kg.toFixed(2));
            }
          }
        }
      }
    } catch {
      // Produto não encontrado ou ainda digitando
    } finally {
      setBuscandoProduto(false);
    }
  };

  const aoMudarKg = (val: string) => {
    setQtdKg(val);
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && num > 0 && pesoUn && pesoUn > 0) {
      const un = Math.round(num / pesoUn);
      setQtdUn(un > 0 ? un.toString() : '');
    } else if (!val) {
      setQtdUn('');
    }
  };

  const aoMudarUn = (val: string) => {
    setQtdUn(val);
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && num > 0 && pesoUn && pesoUn > 0) {
      const kg = num * pesoUn;
      setQtdKg(Number.isInteger(kg) ? kg.toString() : kg.toFixed(2));
    } else if (!val) {
      setQtdKg('');
    }
  };

  const aoMudarPeso = (texto: string) => {
    const w = parseFloat(texto.replace(',', '.'));
    if (isNaN(w) || w <= 0) return;
    setPesoUn(w);
    if (qtdKg) {
      const kg = parseFloat(qtdKg);
      if (!isNaN(kg) && kg > 0) setQtdUn(Math.round(kg / w).toString());
    } else if (qtdUn) {
      const un = parseFloat(qtdUn);
      if (!isNaN(un) && un > 0) {
        const kg = un * w;
        setQtdKg(Number.isInteger(kg) ? kg.toString() : kg.toFixed(2));
      }
    }
  };

  const criar = () => {
    if (!codigo.trim()) {
      avisar('Informe o código do produto.', 'error');
      return;
    }
    const un = parseFloat(qtdUn);
    const kg = parseFloat(qtdKg);
    if ((isNaN(un) || un <= 0) && (isNaN(kg) || kg <= 0)) {
      avisar('Informe ao menos uma quantidade válida (KG ou Unidades).', 'error');
      return;
    }
    const qtd = !isNaN(un) && un > 0 ? un : kg;
    const unidade = !isNaN(un) && un > 0 ? 'UN' : 'KG';
    const lote = loteNovo.trim();
    pedirPrevia({
      url: '/api/administrativo/terceirizados/solicitacoes',
      init: jsonInit('POST', {
        productCode: codigo.trim(),
        productDescription: descricao.trim() || undefined,
        quantity: qtd,
        unit: unidade,
        quantityKg: !isNaN(kg) && kg > 0 ? kg : undefined,
        quantityUn: !isNaN(un) && un > 0 ? un : undefined,
        fornecedor: fornecedor.trim() || undefined,
        previsaoEntrega: previsao.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
        loteNumber: lote || undefined,
      }),
      titulo: 'Nova solicitação de terceirizado',
      confirmarRotulo: 'OK, criar',
      linhas: d => [
        { titulo: `${codigo.trim()}${descricao.trim() ? ` — ${descricao.trim()}` : ''}`, detalhe: `${qtd.toLocaleString('pt-BR')} ${unidade}` },
        ...(fornecedor.trim() ? [{ titulo: 'Fornecedor', detalhe: fornecedor.trim() }] : []),
        ...(previsao.trim() ? [{ titulo: 'Previsão de entrega', detalhe: dataCurta(previsao) }] : []),
        ...(lote ? [{ titulo: `Lote #${lote}`, detalhe: 'Passa a ser terceirizado' }] : []),
        { titulo: 'Status inicial', detalhe: rotuloStatus(d?.status) },
        { titulo: 'Fila do Planejamento', detalhe: 'Entra na fila do Planejamento' },
      ],
      erroPadrao: 'Não foi possível criar a solicitação.',
      aoConcluir: async () => {
        if (lote) {
          try {
            await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote)}/terceirizado?confirmar=true`, {
              method: 'POST',
              body: JSON.stringify({ isTerceirizado: true }),
            });
          } catch (err: any) {
            avisar('Solicitação criada, mas não foi possível marcar o lote como terceirizado: ' + (err?.message || err), 'error');
          }
        }
        avisar('Solicitação de terceirizado criada com sucesso!');
        fecharNova();
        await concluir(Boolean(lote));
      },
    });
  };

  // ---------- Render ----------

  return (
    <div>
      <ReportTabs abas={abas} ativa={aba} onChange={setAba} />
      <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar por código, produto, fornecedor ou lote..." />

      <TabelaPainel>
        <thead>
          <tr>
            <th>Data</th>
            <th>Código</th>
            <th>Produto</th>
            <th style={{ textAlign: 'right' }}>Quantidade</th>
            <th>Fornecedor</th>
            <th>Previsão</th>
            <th>Aprovações</th>
            <th>Status</th>
            <th>Lote</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="py-10 text-center text-zinc-400 text-xs">Carregando solicitações...</td></tr>
          ) : visiveis.length === 0 ? (
            <tr><td colSpan={9} className="py-10 text-center text-zinc-400 text-xs">Nenhuma solicitação nesta aba.</td></tr>
          ) : visiveis.map(s => {
            const prev = getPrevisaoBadge(s.previsaoEntrega);
            const st = STATUS_SOLICITACAO[s.status] ?? { rotulo: s.status, variante: 'apoio' as VarianteBadge };
            return (
              <tr key={s.id} onClick={() => setAbertaId(s.id)} className="cursor-pointer">
                <td className="whitespace-nowrap font-mono text-zinc-600">{formatDateOnly(s.createdAt)}</td>
                <td className="whitespace-nowrap font-mono font-bold">{s.productCode}</td>
                <td style={{ minWidth: 220, maxWidth: 360 }}>
                  <div className="font-medium">{s.productDescription}</div>
                  {s.observacoes && <div className="text-[10px] text-zinc-400 truncate" title={s.observacoes}>{s.observacoes}</div>}
                </td>
                <td className="whitespace-nowrap font-mono font-bold" style={{ textAlign: 'right' }}>
                  <div>{s.quantity.toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">{s.unit}</span></div>
                  {Boolean(s.quantityKg && s.unit === 'UN') && (
                    <div className="text-[10px] text-zinc-400 font-normal">≈ {Number(s.quantityKg).toLocaleString('pt-BR')} kg</div>
                  )}
                  {Boolean(s.quantityUn && s.unit === 'KG') && (
                    <div className="text-[10px] text-zinc-400 font-normal">≈ {Number(s.quantityUn).toLocaleString('pt-BR')} un</div>
                  )}
                </td>
                <td className="whitespace-nowrap">{s.fornecedor || '—'}</td>
                <td className="whitespace-nowrap">
                  {prev ? (
                    <span className={cn('inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border', prev.colorClass)}>{prev.label}</span>
                  ) : '—'}
                </td>
                <td className="whitespace-nowrap">
                  <div className="flex gap-1">
                    <StatusBadge variante={s.aprovacaoEmbalagem ? 'saudavel' : 'aguardando'} title={s.aprovacaoEmbalagem ? 'Embalagem aprovada' : 'Embalagem pendente'}>Emb.</StatusBadge>
                    <StatusBadge variante={s.aprovacaoMateriaPrima ? 'saudavel' : 'aguardando'} title={s.aprovacaoMateriaPrima ? 'Matéria-prima aprovada' : 'Matéria-prima pendente'}>MP</StatusBadge>
                  </div>
                </td>
                <td className="whitespace-nowrap"><StatusBadge variante={st.variante}>{st.rotulo}</StatusBadge></td>
                <td className="whitespace-nowrap font-mono font-bold">
                  {s.loteNumber ? (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); irParaLote(s.loteNumber as string); }}
                      className="hover:underline cursor-pointer"
                      title="Ir para o lote em acompanhamento"
                    >
                      #{s.loteNumber}
                    </button>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TabelaPainel>

      {/* Drawer de detalhe */}
      {aberta && (
        <Drawer
          onClose={() => setAbertaId(null)}
          size="md"
          title={`${aberta.productCode} — ${aberta.productDescription}`}
          subtitle={`Solicitação #${aberta.id}`}
          badge={<StatusBadge variante={STATUS_SOLICITACAO[aberta.status]?.variante ?? 'apoio'}>{rotuloStatus(aberta.status)}</StatusBadge>}
        >
          <div className="p-5 space-y-4">
            <Secao titulo="Dados">
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Quantidade">
                  {aberta.quantity.toLocaleString('pt-BR')} {aberta.unit}
                  {Boolean(aberta.quantityKg && aberta.unit === 'UN') && <span className="text-zinc-400"> (≈ {Number(aberta.quantityKg).toLocaleString('pt-BR')} kg)</span>}
                  {Boolean(aberta.quantityUn && aberta.unit === 'KG') && <span className="text-zinc-400"> (≈ {Number(aberta.quantityUn).toLocaleString('pt-BR')} un)</span>}
                </Campo>
                <Campo rotulo="Fornecedor">{aberta.fornecedor || '—'}</Campo>
                <Campo rotulo="Solicitado por">{aberta.solicitadoPor || '—'} · {formatDateTime(aberta.createdAt)}</Campo>
                <Campo rotulo="Lote vinculado">
                  {aberta.loteNumber ? (
                    <button type="button" className="font-mono font-bold hover:underline cursor-pointer" onClick={() => irParaLote(aberta.loteNumber as string)}>
                      #{aberta.loteNumber}
                    </button>
                  ) : '—'}
                </Campo>
                {aberta.vinculadoEm && <Campo rotulo="Vinculado em">{formatDateTime(aberta.vinculadoEm)}</Campo>}
                {aberta.statusEm && <Campo rotulo="Status desde">{formatDateTime(aberta.statusEm)}</Campo>}
                {aberta.finalizadoEm && <Campo rotulo="Finalizado em">{formatDateTime(aberta.finalizadoEm)}</Campo>}
                {aberta.canceladoEm && <Campo rotulo="Cancelado">{formatDateTime(aberta.canceladoEm)}{aberta.canceladoPor ? ` · ${aberta.canceladoPor}` : ''}</Campo>}
              </div>
              {aberta.observacoes && <Campo rotulo="Observações"><span className="whitespace-pre-wrap">{aberta.observacoes}</span></Campo>}
            </Secao>

            <Secao titulo="Aprovações">
              <div className="grid grid-cols-2 gap-2">
                {([
                  { tipo: 'embalagem' as const, nome: 'Embalagem', ok: aberta.aprovacaoEmbalagem, por: aberta.aprovacaoEmbalagemPor, em: aberta.aprovacaoEmbalagemEm },
                  { tipo: 'materia_prima' as const, nome: 'Matéria-prima', ok: aberta.aprovacaoMateriaPrima, por: aberta.aprovacaoMateriaPrimaPor, em: aberta.aprovacaoMateriaPrimaEm },
                ]).map(a => (
                  <button
                    key={a.tipo}
                    type="button"
                    disabled={travada}
                    onClick={() => alternarAprovacao(aberta, a.tipo)}
                    className={cn(
                      'text-left px-3 py-2 rounded-lg border text-xs transition-colors',
                      travada ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                      a.ok ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-zinc-50 border-dashed border-zinc-300 text-zinc-600'
                    )}
                  >
                    <div className="font-bold flex items-center gap-1">{a.ok && <Check className="h-3 w-3" />}{a.nome}: {a.ok ? 'aprovada' : 'pendente'}</div>
                    {a.ok && <div className="text-[10px] text-zinc-500 mt-0.5">{a.por || 'Operador'}{a.em ? ` · ${formatDateTime(a.em)}` : ''}</div>}
                  </button>
                ))}
              </div>
            </Secao>

            <Secao titulo="Previsão de entrega">
              <div className="flex items-center gap-2">
                <input type="date" value={previsaoDraft} onChange={e => setPrevisaoDraft(e.target.value)} className={cn(inputCls, 'max-w-[180px]')} />
                <BotaoAcao
                  primario
                  disabled={previsaoDraft === (aberta.previsaoEntrega ? aberta.previsaoEntrega.split('T')[0] : '')}
                  onClick={() => salvarPrevisao(aberta)}
                >
                  Salvar
                </BotaoAcao>
              </div>
            </Secao>

            {!travada && (
              <Secao titulo="Vínculo com lote do ERP">
                {aberta.loteNumber ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs">Vinculada ao lote <strong className="font-mono">#{aberta.loteNumber}</strong>.</span>
                    <BotaoAcao onClick={() => desvincular(aberta)}>Desvincular</BotaoAcao>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1.5">
                        Lotes recentes deste produto
                        {buscandoLotes && <RefreshCw className="h-3 w-3 animate-spin" />}
                      </span>
                      {lotesSugeridos.length > 0 && <span>{lotesSugeridos.length} disponível(is)</span>}
                    </div>
                    {lotesSugeridos.length > 0 ? (
                      <div className="border border-zinc-200 rounded-lg overflow-hidden divide-y divide-zinc-100 max-h-48 overflow-y-auto bg-white">
                        {lotesSugeridos.map(l => {
                          const sel = vincularLote === l.loteNumber;
                          return (
                            <button
                              key={loteRowKey(l)}
                              type="button"
                              onClick={() => setVincularLote(l.loteNumber)}
                              className={cn('w-full text-left px-3 py-2 flex items-center justify-between gap-3 text-xs cursor-pointer', sel ? 'bg-zinc-100 font-medium' : 'hover:bg-zinc-50')}
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="font-mono font-bold">#{l.loteNumber}</span>
                                <span className="text-[11px] text-zinc-500 truncate">
                                  {formatDateOnly(l.date || l.dataPrevisao)} · {l.pesoDesconhecido ? formatarUnidadesLote(l) : (l.quantity ? `${l.quantity.toLocaleString('pt-BR')} un` : '')}
                                  {l.quantityKg ? ` (${l.quantityKg.toLocaleString('pt-BR')} kg)` : ''}
                                </span>
                              </span>
                              <span className="flex items-center gap-2 shrink-0 text-[10px] text-zinc-500">
                                {l.customStatus || l.erpStatusLabel || l.erpStatus || 'Aguardando'}
                                {sel && <Check className="h-3.5 w-3.5 text-zinc-900" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : !buscandoLotes && (
                      <div className="text-[11px] text-zinc-500">Nenhum lote recente livre deste produto no ERP. Digite o número abaixo.</div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={vincularLote}
                        onChange={e => setVincularLote(e.target.value.trim())}
                        placeholder="Número do lote"
                        className={cn(inputCls, 'font-mono font-bold max-w-[200px]')}
                      />
                      <BotaoAcao primario disabled={!vincularLote.trim()} onClick={() => vincular(aberta)}>Vincular</BotaoAcao>
                    </div>
                  </div>
                )}
              </Secao>
            )}

            <Secao titulo="Andamento">
              {PROXIMO_PASSO[aberta.status] ? (
                <div>
                  <BotaoAcao primario onClick={() => mudarStatus(aberta, PROXIMO_PASSO[aberta.status]!.status, PROXIMO_PASSO[aberta.status]!.rotulo)}>
                    {PROXIMO_PASSO[aberta.status]!.rotulo}
                  </BotaoAcao>
                </div>
              ) : (
                <div className="text-[11px] text-zinc-500">
                  {aberta.status === 'SOLICITADO' || aberta.status === 'APROVADO'
                    ? 'Avança com as aprovações e o vínculo ao lote do ERP.'
                    : 'Sem próximo passo.'}
                </div>
              )}
              {aberta.status !== 'FINALIZADO' && aberta.status !== 'CANCELADO' && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    value={motivoCancelar}
                    onChange={e => setMotivoCancelar(e.target.value)}
                    placeholder="Motivo do cancelamento (opcional)"
                    className={inputCls}
                  />
                  <BotaoAcao onClick={() => cancelar(aberta)}>Cancelar solicitação</BotaoAcao>
                </div>
              )}
            </Secao>
          </div>
        </Drawer>
      )}

      {/* Drawer "Nova solicitação" */}
      {novaAberta && (
        <Drawer
          onClose={fecharNova}
          size="md"
          title="Nova solicitação"
          subtitle="Produto e quantidade para produzir com terceirista"
          footer={
            <div className="flex justify-end gap-2">
              <BotaoAcao onClick={fecharNova}>Cancelar</BotaoAcao>
              <BotaoAcao primario onClick={criar}>Criar</BotaoAcao>
            </div>
          }
        >
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1 space-y-1">
                <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                  <span>REF / SKU *</span>
                  {buscandoProduto && <RefreshCw className="h-3 w-3 animate-spin text-zinc-500" />}
                </label>
                <input type="text" value={codigo} onChange={e => aoDigitarCodigo(e.target.value)} placeholder="Ex: 5.11.002" className={cn(inputCls, 'font-mono font-bold')} autoFocus />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                  <span>Descrição do produto</span>
                  {pesoUn && pesoUn > 0 && (
                    <span className="text-[10px] font-bold text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                      {pesoUn >= 1 ? `${pesoUn} kg/un` : `${Math.round(pesoUn * 1000)} ml/un`}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={descricao}
                  onChange={e => {
                    setDescricao(e.target.value);
                    const w = parseUnitWeightFromDescription(e.target.value);
                    if (w && !pesoCustom) setPesoUn(w);
                  }}
                  placeholder="Puxada do cadastro"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5 text-zinc-500" />
                  Quantidades
                </span>
                {pesoUn && pesoUn > 0 && (
                  <button type="button" onClick={() => setPesoCustom(!pesoCustom)} className="text-[10px] text-zinc-600 hover:text-zinc-900 underline cursor-pointer">
                    {pesoCustom ? 'Ocultar fator' : 'Ajustar fator de conversão'}
                  </button>
                )}
              </div>
              {pesoCustom && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[11px] font-semibold shrink-0">Peso unitário:</span>
                  <input type="number" step="0.001" value={pesoUn || ''} onChange={e => aoMudarPeso(e.target.value)} placeholder="Ex: 0.5" className={cn(inputCls, 'w-24 font-mono font-bold')} />
                  <span className="text-[10px] text-zinc-500">kg/un</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">Quantidade em KG</label>
                  <input type="number" step="any" value={qtdKg} onChange={e => aoMudarKg(e.target.value)} placeholder="Ex: 1000" className={cn(inputCls, 'font-mono font-bold')} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">Quantidade em unidades</label>
                  <input type="number" step="any" value={qtdUn} onChange={e => aoMudarUn(e.target.value)} placeholder="Ex: 2000" className={cn(inputCls, 'font-mono font-bold')} />
                </div>
              </div>
              {Boolean(qtdKg && qtdUn && pesoUn) && (
                <div className="text-[11px] text-zinc-600">
                  {Number(qtdKg).toLocaleString('pt-BR')} KG equivalem a {Number(qtdUn).toLocaleString('pt-BR')} UN (fator {pesoUn} kg/un)
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Fornecedor / terceirista</label>
                <input type="text" list="terceiristas-sugeridos-list" value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="Ex: DAC Cosméticos" className={inputCls} />
                <datalist id="terceiristas-sugeridos-list">
                  {fornecedoresSugeridos.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Previsão de entrega</label>
                <input type="date" value={previsao} onChange={e => setPrevisao(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700">Número do lote do ERP (opcional)</label>
              <input type="text" value={loteNovo} onChange={e => setLoteNovo(e.target.value)} placeholder="Ex: 26038 (se já souber o lote)" className={cn(inputCls, 'font-mono font-bold')} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700">Observações</label>
              <textarea rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Embalagens, matéria-prima, envio de insumos..." className={inputCls} />
            </div>
          </div>
        </Drawer>
      )}

      {previaElemento}
    </div>
  );
}
