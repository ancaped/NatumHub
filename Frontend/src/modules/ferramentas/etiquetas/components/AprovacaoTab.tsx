import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, SearchX } from 'lucide-react';
import '../etiquetas.css';
import { BotaoAcao, FilterBar, ReportHeader, ReportTabs, StatusBadge, TabelaPainel, type AbaRelatorio } from '../../../geral/components/ui/ReportKit';
import { api } from '../../../geral/lib/api';
import type { FiscoQuimicaAnalysis, FiscoQuimicaPattern, ProcItem } from '../../../geral/lib/types';
import { checkAnalysisCompliance, isAnalysisInCorrection } from '../../../producao/fisco_quimica/lib/fiscoUtils';
import { describeFiscoLoteLabel, type FiscoLoteBulk } from '../../../producao/fisco_quimica/lib/fiscoLoteLabel';
import PrintModal from './PrintModal';
import { labelsApi, type LabelPrintHistoryItem } from '../lib/labelsApi';
import { preencherModelo } from '../lib/modelos';
import type { LabelTemplate } from '../lib/types';

const muted = { color: 'hsl(var(--text-secondary-hsl))' } as const;
const DIAS_PADRAO = 120;

function formatarData(v?: string | null): string {
  const m = (v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v || '—';
}
const normalizar = (c?: string | null) => (c ? String(c).replace(/\./g, '').trim().toLowerCase() : '');
const diaIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Props {
  /** Modelo `fisco_lote` (do sistema, já com a versão editada se houver). */
  modelo: LabelTemplate | undefined;
  onImpresso?: () => void;
}

/**
 * Lotes com laudo físico-químico aprovado, do mais recente para o mais antigo, com o registro de etiqueta impressa.
 * A regra de "aprovado" é a da Produção (`checkAnalysisCompliance`); aqui só lista e imprime o modelo `fisco_lote`.
 */
export default function AprovacaoTab({ modelo, onImpresso }: Props) {
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState('todos');
  const [analises, setAnalises] = useState<FiscoQuimicaAnalysis[]>([]);
  const [padroes, setPadroes] = useState<Map<string, FiscoQuimicaPattern>>(new Map());
  const [procs, setProcs] = useState<{ porCodigo: Record<string, ProcItem>; porNome: Record<string, ProcItem> }>({ porCodigo: {}, porNome: {} });
  const [historico, setHistorico] = useState<LabelPrintHistoryItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [preparando, setPreparando] = useState<string | null>(null);
  const [imprimindo, setImprimindo] = useState<{ analise: FiscoQuimicaAnalysis; etiqueta: LabelTemplate } | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    const q = busca.trim();
    const desde = new Date();
    desde.setDate(desde.getDate() - DIAS_PADRAO);
    Promise.all([
      api.getFiscoQuimicaAnalyses(q.length >= 2 ? { busca: q, limite: 500 } : { desde: diaIso(desde), limite: 500 }),
      api.getFiscoQuimicaPatterns(),
      api.getProcMap().catch(() => null),
      labelsApi.listHistory(500),
    ])
      .then(([a, p, pm, h]) => {
        setAnalises(a);
        setPadroes(new Map((p || []).map((x) => [normalizar(x.productCode), x])));
        setProcs({ porCodigo: pm?.byCode ?? {}, porNome: pm?.byDescription ?? {} });
        setHistorico(h);
        setErro('');
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar os laudos'))
      .finally(() => setCarregando(false));
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(carregar, 300);
    return () => clearTimeout(t);
  }, [carregar]);

  /** Aprovados, um por lote (o laudo mais recente), do mais recente para o mais antigo. */
  const linhas = useMemo(() => {
    const porLote = new Map<string, FiscoQuimicaAnalysis>();
    const ordenadas = [...analises].sort((x, y) => `${y.analysisDate}|${y.createdAt ?? ''}`.localeCompare(`${x.analysisDate}|${x.createdAt ?? ''}`));
    for (const a of ordenadas) {
      const lote = String(a.batch || '').trim();
      if (!lote || porLote.has(lote)) continue;
      const pad = padroes.get(normalizar(a.productCode)) ?? null;
      if (isAnalysisInCorrection(a) || !checkAnalysisCompliance(a, pad).isCompliant) continue;
      porLote.set(lote, a);
    }
    return [...porLote.values()];
  }, [analises, padroes]);

  const impressas = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of historico) {
      if (h.template_name !== modelo?.name || !h.lot_number) continue;
      m.set(h.lot_number, (m.get(h.lot_number) ?? 0) + (h.copies || 0));
    }
    return m;
  }, [historico, modelo]);
  const qtd = (a: FiscoQuimicaAnalysis) => impressas.get(String(a.batch).trim()) ?? 0;

  const abas: AbaRelatorio[] = [
    { id: 'todos', label: 'Todos', contagem: linhas.length },
    { id: 'pendentes', label: 'Sem etiqueta', contagem: linhas.filter((a) => qtd(a) === 0).length },
    { id: 'impressos', label: 'Com etiqueta', contagem: linhas.filter((a) => qtd(a) > 0).length },
  ];
  const visiveis = linhas.filter((a) => (aba === 'pendentes' ? qtd(a) === 0 : aba === 'impressos' ? qtd(a) > 0 : true));

  const preparar = async (a: FiscoQuimicaAnalysis) => {
    if (!modelo || preparando) return;
    setPreparando(a.id);
    try {
      const lote = String(a.batch).trim();
      let bulk: FiscoLoteBulk | null = null;
      try {
        const res = await api.getFiscoErpLotes({ search: lote, limit: 20 });
        const hit = (res.items || []).find((i) => String(i.lote).trim() === lote && normalizar(i.product_code) === normalizar(a.productCode))
          || (res.items || []).find((i) => String(i.lote).trim() === lote);
        if (hit) bulk = { qtyKg: Number(hit.qty_kg) || 0, unidades: Number(hit.unidades) || 0, qtdeCx: Number(hit.qtde_cx) || 0, date: hit.date_erp || '', productName: hit.product_name || '' };
      } catch {
        bulk = null;
      }
      const pad = padroes.get(normalizar(a.productCode)) ?? null;
      const proc = procs.porCodigo[normalizar(a.productCode)] ?? procs.porNome[(a.productName || '').trim().toLowerCase()] ?? null;
      const f = describeFiscoLoteLabel({ analysis: a, pattern: pad, procItem: proc, approved: true, bulk });
      const etiqueta = preencherModelo(modelo, {
        product_name: f.name,
        volume_line: f.volume,
        date: f.date,
        product_code: f.code,
        status: f.status,
        proc: f.proc,
        envase: f.envase,
        lot: f.batch,
      });
      setImprimindo({ analise: a, etiqueta });
    } finally {
      setPreparando(null);
    }
  };

  return (
    <>
      <ReportHeader
        titulo="Etiquetas de aprovação"
        subtitulo="Lotes com laudo físico-químico aprovado, do mais recente para o mais antigo. Busque por lote, código ou produto."
        acoes={
          <BotaoAcao onClick={carregar} disabled={carregando}>
            <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </BotaoAcao>
        }
      />
      <ReportTabs abas={abas} ativa={aba} onChange={setAba} />
      <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar lote, código ou produto..." />
      <div className="lote-wrap">
        <TabelaPainel>
          <thead>
            <tr>
              <th style={{ width: 80 }}>Lote</th>
              <th>Produto</th>
              <th style={{ width: 100 }}>Laudo</th>
              <th style={{ width: 150 }}>Etiqueta</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {carregando && analises.length === 0 && (
              <tr><td colSpan={5}><div className="lote-vazio">Carregando...</div></td></tr>
            )}
            {erro && (
              <tr><td colSpan={5}><div className="lote-vazio" style={{ color: 'hsl(0 70% 40%)' }}>{erro}</div></td></tr>
            )}
            {!carregando && !erro && visiveis.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="lote-vazio"><SearchX size={22} /> Nenhum lote aprovado encontrado.</div>
                </td>
              </tr>
            )}
            {visiveis.map((a) => {
              const n = qtd(a);
              return (
                <tr key={a.id} className="lote-linha">
                  <td className="c-lote"><span className="lote-chip">{a.batch}</span></td>
                  <td className="c-prod" style={{ maxWidth: 0 }}>
                    <div className="lote-nome" title={a.productName}>{a.productName}</div>
                    <div className="lote-sub"><span className="product-code">{a.productCode}</span></div>
                  </td>
                  <td className="c-meta" data-r="Laudo" style={{ fontSize: '0.75rem', ...muted }}>{formatarData(a.analysisDate)}</td>
                  <td className="c-etq">
                    {n > 0 ? <StatusBadge variante="saudavel">{n} impressas</StatusBadge> : <StatusBadge variante="descontinuado">Sem etiqueta</StatusBadge>}
                  </td>
                  <td className="c-acao" style={{ textAlign: 'right' }}>
                    <BotaoAcao primario={n === 0} disabled={!modelo || preparando !== null} onClick={() => preparar(a)}>
                      <span className="lote-imprimir"><Printer size={14} /> {preparando === a.id ? 'Preparando...' : 'Imprimir'}</span>
                    </BotaoAcao>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TabelaPainel>
      </div>

      {imprimindo && (
        <PrintModal
          template={imprimindo.etiqueta}
          isOpen
          onClose={() => setImprimindo(null)}
          onPrintSuccess={() => {
            setImprimindo(null);
            carregar();
            onImpresso?.();
          }}
          initialCopies={1}
          initialEnableSequence={false}
          history={{ product_code: imprimindo.analise.productCode, product_name: imprimindo.analise.productName, lot_number: String(imprimindo.analise.batch).trim() }}
        />
      )}
    </>
  );
}
