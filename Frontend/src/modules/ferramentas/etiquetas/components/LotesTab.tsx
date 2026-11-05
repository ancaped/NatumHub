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
      .replace(/{box_barcode}/g, l.codigo_barras_caixa || '')
      .replace(/{lot}/g, l.lote)
      .replace(/{manufacturing_date}/g, formatarData(l.data_producao))
      .replace(/{box_qty}/g, l.quantidade_caixa ? `${l.quantidade_caixa} unidades` : '');
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
  /** Lotes do ERP ou ordens de montagem de kit (o número da ordem é o lote). */
  tipo?: 'lotes' | 'kits' | 'coloracoes';
  modelo: LabelTemplate | undefined;
  /** Recarrega o histórico da tela depois de imprimir. */
  onImpresso?: () => void;
}

/**
 * Lotes do ERP, do mais recente para o mais antigo, com o registro de etiqueta impressa.
 * A impressão usa a tela padrão (`PrintModal`) já com a quantidade sugerida (caixas + 1).
 */
export default function LotesTab({ tipo = 'lotes', modelo, onImpresso }: LotesTabProps) {
  const kit = tipo === 'kits';
  const sem = tipo === 'coloracoes'; // coloração não tem lote: a lista é de produtos
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState('todos');
  const [lotes, setLotes] = useState<LoteEtiqueta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [imprimindo, setImprimindo] = useState<LoteEtiqueta | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    labelsApi
      .listLotes(busca, tipo)
      .then((d) => {
        setLotes(d);
        setErro('');
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar lotes'))
      .finally(() => setCarregando(false));
  }, [busca, tipo]);

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
        titulo={sem ? 'Etiquetas de coloração' : kit ? 'Etiquetas de kit' : 'Etiquetas de lote'}
        subtitulo={sem ? 'Produtos de Coloração. Não tem lote: imprima a quantidade que precisar.' : kit ? 'Ordens de montagem de kit, da mais recente para a mais antiga. O lote é o número da ordem.' : 'Lotes do ERP, do mais recente para o mais antigo. Busque por lote, código ou produto.'}
        acoes={
          <BotaoAcao onClick={carregar} disabled={carregando}>
            <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </BotaoAcao>
        }
      />
      <ReportTabs abas={abas} ativa={aba} onChange={setAba} />
      <FilterBar busca={busca} onBusca={setBusca} placeholder={sem ? 'Buscar código ou produto...' : kit ? 'Buscar ordem, código ou kit...' : 'Buscar lote, código ou produto...'} />
      <TabelaPainel>
        <thead>
          <tr>
            {!sem && <th style={{ width: 80 }}>Lote</th>}
            <th>Produto</th>
            {!sem && <th style={{ width: 100 }}>Data</th>}
            {!sem && <th style={{ width: 80, textAlign: 'right' }}>Unidades</th>}
            <th style={{ width: 70, textAlign: 'right' }}>{sem ? 'Un/cx' : 'Caixas'}</th>
            <th style={{ width: 150 }}>Etiqueta</th>
            <th style={{ width: 110 }} />
          </tr>
        </thead>
        <tbody>
          {carregando && lotes.length === 0 && (
            <tr>
              <td colSpan={sem ? 4 : 7} style={{ padding: 20, textAlign: 'center', ...muted }}>Carregando...</td>
            </tr>
          )}
          {erro && (
            <tr>
              <td colSpan={sem ? 4 : 7} style={{ padding: 20, textAlign: 'center', color: 'hsl(0 70% 40%)' }}>{erro}</td>
            </tr>
          )}
          {!carregando && !erro && linhas.length === 0 && (
            <tr>
              <td colSpan={sem ? 4 : 7} style={{ padding: 20, textAlign: 'center', ...muted }}>Nenhum lote encontrado.</td>
            </tr>
          )}
          {linhas.map((l) => (
            <tr key={`${l.lote}-${l.codigo}`}>
              {!sem && (
                <td style={{ fontWeight: 700 }}>
                  {l.lote}
                  {kit && l.status && (
                    <div style={{ fontSize: '0.62rem', fontWeight: 400, ...muted }}>{l.status === 'COMPLETED' ? 'Concluída' : 'Em aberto'}</div>
                  )}
                </td>
              )}
              <td style={{ maxWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.descricao}>
                    {l.descricao}
                  </span>
                  <span className="product-code" style={{ fontSize: '0.65rem', flexShrink: 0 }}>{l.codigo}</span>
                </div>
              </td>
              {!sem && <td style={{ fontSize: '0.75rem', ...muted }}>{formatarData(l.data_producao)}</td>}
              {!sem && <td style={{ textAlign: 'right' }}>{l.quantidade}</td>}
              <td style={{ textAlign: 'right' }} title={l.quantidade_caixa ? `${l.quantidade_caixa} un. por caixa` : 'Produto sem quantidade por caixa'}>
                {sem ? (l.quantidade_caixa ?? '—') : (l.caixas ?? '—')}
                {!sem && l.quantidade_caixa ? <div style={{ fontSize: '0.62rem', ...muted }}>{l.quantidade_caixa} un/cx</div> : null}
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
                  <StatusBadge variante="descontinuado">Sem etiqueta</StatusBadge>
                )}
              </td>
              <td style={{ textAlign: 'right' }}>
                <BotaoAcao disabled={!modelo} onClick={() => setImprimindo(l)}>
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
          history={{ product_code: imprimindo.codigo, product_name: imprimindo.descricao, lot_number: sem ? undefined : imprimindo.lote }}
        />
      )}
    </>
  );
}
