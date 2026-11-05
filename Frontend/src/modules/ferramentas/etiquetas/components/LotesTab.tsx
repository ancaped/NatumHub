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
      .replace(/{barcode}/g, l.codigo_barras || '')
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
  /** Coloração: códigos marcados para imprimir 1 etiqueta de cada de uma vez. */
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [emLote, setEmLote] = useState<LoteEtiqueta[] | null>(null);
  /** Unidades por caixa ajustadas na tela; valem só para a etiqueta, o cadastro do produto não muda. */
  const [porCaixa, setPorCaixa] = useState<Record<string, number>>({});
  const chave = (l: LoteEtiqueta) => `${l.lote}|${l.codigo}`;
  const efetivo = (l: LoteEtiqueta): LoteEtiqueta => {
    const cx = porCaixa[chave(l)] ?? l.quantidade_caixa ?? null;
    const caixas = !sem && cx && cx > 0 && l.quantidade > 0 ? Math.ceil(l.quantidade / cx) : null;
    return { ...l, quantidade_caixa: cx, caixas, etiquetas_sugeridas: sem ? 1 : caixas != null ? caixas + 1 : 1 };
  };

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
    ...(sem
      ? [
          { id: 'coloracao', label: 'Coloração', contagem: lotes.filter((l) => l.tipo !== 'tonalizante').length },
          { id: 'tonalizante', label: 'Tonalizante', contagem: lotes.filter((l) => l.tipo === 'tonalizante').length },
        ]
      : []),
    { id: 'pendentes', label: 'Sem etiqueta', contagem: lotes.filter((l) => l.etiquetas_impressas === 0).length },
    { id: 'impressos', label: 'Com etiqueta', contagem: lotes.filter((l) => l.etiquetas_impressas > 0).length },
  ];
  const linhas = useMemo(
    () =>
      lotes.filter((l) => (aba === 'coloracao' ? l.tipo !== 'tonalizante' : aba === 'tonalizante' ? l.tipo === 'tonalizante' : aba === 'pendentes' ? l.etiquetas_impressas === 0 : aba === 'impressos' ? l.etiquetas_impressas > 0 : true)),
    [lotes, aba],
  );

  const visiveisMarcados = linhas.filter((l) => marcados.has(l.codigo));
  const todosMarcados = linhas.length > 0 && visiveisMarcados.length === linhas.length;
  const alternar = (codigo: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(codigo)) n.delete(codigo);
      else n.add(codigo);
      return n;
    });
  const alternarTodos = () =>
    setMarcados((m) => {
      const n = new Set(m);
      if (todosMarcados) linhas.forEach((l) => n.delete(l.codigo));
      else linhas.forEach((l) => n.add(l.codigo));
      return n;
    });

  const etiqueta = useMemo(() => (imprimindo && modelo ? montarEtiqueta(modelo, imprimindo) : null), [imprimindo, modelo]);

  return (
    <>
      <ReportHeader
        titulo={sem ? 'Etiquetas de coloração' : kit ? 'Etiquetas de kit' : 'Etiquetas de lote'}
        subtitulo={sem ? 'Produtos de Coloração. Não tem lote: imprima a quantidade que precisar.' : kit ? 'Ordens de montagem de kit, da mais recente para a mais antiga. O lote é o número da ordem.' : 'Lotes do ERP, do mais recente para o mais antigo. Busque por lote, código ou produto.'}
        acoes={
          <>
            {sem && (
              <BotaoAcao primario disabled={!modelo || visiveisMarcados.length === 0 || visiveisMarcados.length > 80} onClick={() => setEmLote(visiveisMarcados.map(efetivo))}>
                Imprimir selecionadas{visiveisMarcados.length > 80 ? ' (máx. 80 por vez)' : visiveisMarcados.length > 0 ? ` (${visiveisMarcados.length})` : ''}
              </BotaoAcao>
            )}
          <BotaoAcao onClick={carregar} disabled={carregando}>
            <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </BotaoAcao>
          </>
        }
      />
      <ReportTabs abas={abas} ativa={aba} onChange={setAba} />
      <FilterBar busca={busca} onBusca={setBusca} placeholder={sem ? 'Buscar código ou produto...' : kit ? 'Buscar ordem, código ou kit...' : 'Buscar lote, código ou produto...'} />
      <TabelaPainel>
        <thead>
          <tr>
            {sem && (
              <th style={{ width: 34 }}>
                <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} title="Marcar todas as listadas" />
              </th>
            )}
            {!sem && <th style={{ width: 80 }}>Lote</th>}
            <th>Produto</th>
            {!sem && <th style={{ width: 100 }}>Data</th>}
            {!sem && <th style={{ width: 80, textAlign: 'right' }}>Unidades</th>}
            {!sem && <th style={{ width: 70, textAlign: 'right' }}>Caixas</th>}
            <th style={{ width: 90, textAlign: 'center' }}>Un/cx</th>
            <th style={{ width: 150 }}>Etiqueta</th>
            <th style={{ width: 110 }} />
          </tr>
        </thead>
        <tbody>
          {carregando && lotes.length === 0 && (
            <tr>
              <td colSpan={sem ? 5 : 8} style={{ padding: 20, textAlign: 'center', ...muted }}>Carregando...</td>
            </tr>
          )}
          {erro && (
            <tr>
              <td colSpan={sem ? 5 : 8} style={{ padding: 20, textAlign: 'center', color: 'hsl(0 70% 40%)' }}>{erro}</td>
            </tr>
          )}
          {!carregando && !erro && linhas.length === 0 && (
            <tr>
              <td colSpan={sem ? 5 : 8} style={{ padding: 20, textAlign: 'center', ...muted }}>Nenhum lote encontrado.</td>
            </tr>
          )}
          {linhas.map((l0) => {
            const l = efetivo(l0);
            return (
            <tr key={`${l.lote}-${l.codigo}`}>
              {sem && (
                <td>
                  <input type="checkbox" checked={marcados.has(l.codigo)} onChange={() => alternar(l.codigo)} />
                </td>
              )}
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
              {!sem && (
                <td style={{ textAlign: 'right' }} title={l.quantidade_estimada ? 'Estimado: kg do lote / peso da unidade (sem conferência no envase)' : undefined}>
                  {l.quantidade_estimada ? '~' : ''}{l.quantidade}
                </td>
              )}
              {!sem && <td style={{ textAlign: 'right' }}>{l.caixas ?? '—'}</td>}
              <td style={{ textAlign: 'center' }}>
                <input
                  type="number"
                  min={1}
                  value={l.quantidade_caixa ?? ''}
                  placeholder="—"
                  title="Unidades por caixa na etiqueta. Muda só a etiqueta, não o cadastro do produto."
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setPorCaixa((m) => {
                      const { [chave(l0)]: _, ...resto } = m;
                      return n > 0 ? { ...resto, [chave(l0)]: n } : resto;
                    });
                  }}
                  style={{
                    width: 58,
                    textAlign: 'center',
                    fontSize: '0.8rem',
                    padding: '3px 4px',
                    borderRadius: 6,
                    border: `1px solid ${porCaixa[chave(l0)] != null ? 'hsl(var(--text-primary-hsl, 240 6% 10%))' : 'hsl(var(--card-border-hsl))'}`,
                    background: 'transparent',
                  }}
                />
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
            );
          })}
        </tbody>
      </TabelaPainel>

      {emLote && modelo && emLote.length > 0 && (
        <PrintModal
          template={montarEtiqueta(modelo, emLote[0])}
          batchTemplates={emLote.map((l) => montarEtiqueta(modelo, l))}
          batchHistory={emLote.map((l) => ({ product_code: l.codigo, product_name: l.descricao }))}
          isOpen
          onClose={() => setEmLote(null)}
          onPrintSuccess={() => {
            setEmLote(null);
            setMarcados(new Set());
            carregar();
            onImpresso?.();
          }}
        />
      )}

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
