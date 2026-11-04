import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BotaoAcao, FilterBar, ReportHeader, ReportTabs, StatusBadge, TabelaPainel, type AbaRelatorio } from '../../../geral/components/ui/ReportKit';
import PrintModal from './PrintModal';
import { labelsApi, type LoteEtiqueta } from '../lib/labelsApi';
import type { LabelTemplate } from '../lib/types';

const muted = { color: 'hsl(var(--text-secondary-hsl))' } as const;

/** "2026-11-03 00:00:00" -> "03/11/2026". */
function formatarData(v?: string | null): string {
  const m = (v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v || '—';
}

/** Preenche o modelo de lote com os dados do lote do ERP. */
function montarEtiqueta(modelo: LabelTemplate, l: LoteEtiqueta): LabelTemplate {
  const trocar = (t: string) =>
    t
      .replace(/{product_name}/g, l.descricao)
      .replace(/{product_code}/g, l.codigo)
      .replace(/{lot}/g, l.lote)
      .replace(/{manufacturing_date}/g, formatarData(l.data_producao))
      .replace(/{box_qty}/g, l.quantidade_caixa ? `${l.quantidade_caixa} un.` : '');
  return {
    ...modelo,
    elements_json: modelo.elements_json.map((el) => {
      const props = { ...el.props };
      if (el.type === 'text' || el.type === 'badge') props.text = trocar(String(props.text || ''));
      if (el.type === 'barcode') props.value = trocar(String(props.value || ''));
      return { ...el, props };
    }),
  };
}

interface LotesTabProps {
  modelo: LabelTemplate | undefined;
  /** Recarrega o histórico da tela depois de imprimir. */
  onImpresso?: () => void;
}

/**
 * Lotes do ERP, do mais recente para o mais antigo, com o registro de etiqueta impressa.
 * A impressão usa a tela padrão (`PrintModal`) já com a quantidade sugerida (caixas + 1).
 */
export default function LotesTab({ modelo, onImpresso }: LotesTabProps) {
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState('todos');
  const [lotes, setLotes] = useState<LoteEtiqueta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [imprimindo, setImprimindo] = useState<LoteEtiqueta | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    labelsApi
      .listLotes(busca)
      .then((d) => {
        setLotes(d);
        setErro('');
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar lotes'))
      .finally(() => setCarregando(false));
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const abas: AbaRelatorio[] = [
    { id: 'todos', label: 'Todos', contagem: lotes.length },
    { id: 'pendentes', label: 'Sem etiqueta', contagem: lotes.filter((l) => l.etiquetas_impressas === 0).length },
    { id: 'impressos', label: 'Com etiqueta', contagem: lotes.filter((l) => l.etiquetas_impressas > 0).length },
  ];
  const linhas = useMemo(
    () =>
      lotes.filter((l) => (aba === 'pendentes' ? l.etiquetas_impressas === 0 : aba === 'impressos' ? l.etiquetas_impressas > 0 : true)),
    [lotes, aba],
  );

  const etiqueta = useMemo(() => (imprimindo && modelo ? montarEtiqueta(modelo, imprimindo) : null), [imprimindo, modelo]);

  return (
    <>
      <ReportHeader
        titulo="Etiquetas de lote"
        subtitulo="Lotes do ERP, do mais recente para o mais antigo. Busque por lote, código ou produto."
        acoes={
          <BotaoAcao onClick={carregar} disabled={carregando}>
            <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </BotaoAcao>
        }
      />
      <ReportTabs abas={abas} ativa={aba} onChange={setAba} />
      <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar lote, código ou produto..." />
      <TabelaPainel>
        <thead>
          <tr>
            <th style={{ width: 90 }}>Lote</th>
            <th>Produto</th>
            <th style={{ width: 100 }}>Data</th>
            <th style={{ width: 80, textAlign: 'right' }}>Unidades</th>
            <th style={{ width: 70, textAlign: 'right' }}>Caixas</th>
            <th style={{ width: 150 }}>Etiqueta</th>
            <th style={{ width: 110 }} />
          </tr>
        </thead>
        <tbody>
          {carregando && lotes.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: 20, textAlign: 'center', ...muted }}>Carregando...</td>
            </tr>
          )}
          {erro && (
            <tr>
              <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'hsl(0 70% 40%)' }}>{erro}</td>
            </tr>
          )}
          {!carregando && !erro && linhas.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: 20, textAlign: 'center', ...muted }}>Nenhum lote encontrado.</td>
            </tr>
          )}
          {linhas.map((l) => (
            <tr key={`${l.lote}-${l.codigo}`}>
              <td style={{ fontWeight: 700 }}>{l.lote}</td>
              <td>
                <div style={{ fontWeight: 600 }}>{l.descricao}</div>
                <span className="product-code" style={{ fontSize: '0.65rem' }}>{l.codigo}</span>
              </td>
              <td style={{ fontSize: '0.75rem', ...muted }}>{formatarData(l.data_producao)}</td>
              <td style={{ textAlign: 'right' }}>{l.quantidade}</td>
              <td style={{ textAlign: 'right' }} title={l.quantidade_caixa ? `${l.quantidade_caixa} un. por caixa` : 'Produto sem quantidade por caixa'}>
                {l.caixas ?? '—'}
              </td>
              <td>
                {l.etiquetas_impressas > 0 ? (
                  <StatusBadge
                    variante="saudavel"
                    title={l.ultima_impressao ? `Última: ${new Date(l.ultima_impressao).toLocaleString('pt-BR')}` : undefined}
                  >
                    {l.etiquetas_impressas} impressas
                  </StatusBadge>
                ) : (
                  <StatusBadge variante="aguardando">Sem etiqueta</StatusBadge>
                )}
              </td>
              <td style={{ textAlign: 'right' }}>
                <BotaoAcao primario={l.etiquetas_impressas === 0} disabled={!modelo} onClick={() => setImprimindo(l)}>
                  Imprimir
                </BotaoAcao>
              </td>
            </tr>
          ))}
        </tbody>
      </TabelaPainel>

      {imprimindo && etiqueta && (
        <PrintModal
          template={etiqueta}
          isOpen
          onClose={() => setImprimindo(null)}
          onPrintSuccess={() => {
            setImprimindo(null);
            carregar();
            onImpresso?.();
          }}
          initialCopies={imprimindo.etiquetas_sugeridas ?? 1}
          initialEnableSequence={false}
          history={{ product_code: imprimindo.codigo, product_name: imprimindo.descricao, lot_number: imprimindo.lote }}
        />
      )}
    </>
  );
}
