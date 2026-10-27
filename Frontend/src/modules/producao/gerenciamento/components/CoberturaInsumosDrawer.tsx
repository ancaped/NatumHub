import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Link2, Printer, RefreshCw, Tags } from 'lucide-react';
import Drawer, { DrawerTab } from '../../../geral/components/ui/Drawer';
import { apiJson } from '../../../geral/lib/http';
import { printHtmlViaIframe } from '../../../geral/lib/printCleanup';
import { BASE_FONTE_ROTULO, fmt, fmtData } from './cobertura';
import type { BaseFonte, Cobertura, InsumoOrdem, ResultadoOrdem } from './cobertura';
import { BotaoAcao, FilterBar, FiltroSelect, StatusBadge } from '../../../geral/components/ui/ReportKit';
import type { VarianteBadge } from '../../../geral/components/ui/ReportKit';
import { ClassificarInsumo, TabelaClassificacao } from './classificacao';
import PedidoResumoDrawer from '../../../compras/controle_pedidos/PedidoResumoDrawer';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  semana: string;
  /** Texto legível de uma ordem do planejamento (produto, data, kg). */
  descreverOrdem: (id: string) => string;
  /** Abre o modal "Vincular lote ERP" já com o número sugerido. */
  onVincular: (ordemId: string, lote: string) => void;
  /** Avisa o quadro que uma decisão mudou (para atualizar os selos). */
  onMudou?: () => void;
}

const TITULO_AVISO: Record<string, { rotulo: string; variante: VarianteBadge }> = {
  lote_erp_sem_vinculo: { rotulo: 'Lote sem vínculo', variante: 'ordem' },
  lote_nao_encontrado: { rotulo: 'Lote não achado', variante: 'critico' },
  pedido_possivelmente_recebido: { rotulo: 'Já recebido?', variante: 'ordem' },
  recebimento_parcial: { rotulo: 'Recebimento parcial', variante: 'ordem' },
  pedido_atrasado: { rotulo: 'Pedido atrasado', variante: 'ordem' },
  pedido_sem_previsao: { rotulo: 'Sem previsão', variante: 'ordem' },
  base_tambem_planejada: { rotulo: 'Base em dobro?', variante: 'ordem' },
  base_sem_ordem: { rotulo: 'Base sem ordem', variante: 'critico' },
  manual_antigo: { rotulo: 'Manual antigo', variante: 'ordem' },
  sugestao_base: { rotulo: 'Sugestão', variante: 'descontinuado' },
};

function situacaoInsumo(i: InsumoOrdem): { variante: VarianteBadge; rotulo: string } {
  switch (i.status) {
    case 'chega_depois':
      return { variante: 'ordem', rotulo: `Chega ${fmtData(i.chegaEm).slice(0, 5)}` };
    case 'chega_sem_data':
      return { variante: 'aguardando', rotulo: 'Sem previsão' };
    case 'depende_atrasado':
      return { variante: 'ordem', rotulo: 'Pedido atrasado' };
    default:
      return { variante: 'critico', rotulo: 'Sem cobertura' };
  }
}

/** "COD — descrição · data · kg" -> [código, descrição, detalhe]. */
function partesOrdem(texto: string): [string, string, string] {
  const i = texto.indexOf(' · ');
  const [prod, det] = i < 0 ? [texto, ''] : [texto.slice(0, i), texto.slice(i + 3)];
  const k = prod.indexOf(' — ');
  return k < 0 ? [prod, '', det] : [prod.slice(0, k), prod.slice(k + 3), det.replace('/2026', '')];
}

const nowrap: React.CSSProperties = { whiteSpace: 'nowrap' };

/** Conta do livre, explicada: de onde vêm os números e por que falta. */
function ComoFoiCalculado({ i }: { i: InsumoOrdem }) {
  const un = i.unidade ? ` ${i.unidade}` : '';
  const linha = (rotulo: string, valor: number, destaque?: boolean, sinal?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, fontWeight: destaque ? 700 : 400 }}>
      <span>{sinal ? `${sinal} ` : ''}{rotulo}</span>
      <span>{fmt(valor)}{un}</span>
    </div>
  );
  return (
    <div style={{ fontSize: '0.72rem', maxWidth: 420 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Como foi calculado</div>
      {linha('Estoque no ERP', i.estoque ?? 0)}
      {linha('Reserva dos lotes abertos (fórmula)', i.reserva ?? 0, false, '−')}
      {(i.chegadas ?? 0) !== 0 && linha('Pedidos que chegam até a data', i.chegadas ?? 0, false, '+')}
      {(i.manuais ?? 0) !== 0 && linha('Ordens manuais', i.manuais ?? 0, false, '+')}
      {linha('Consumo das ordens anteriores', i.consumoAnterior ?? 0, false, '−')}
      <div style={{ borderTop: '1px solid hsl(var(--card-border-hsl))', margin: '3px 0' }} />
      {linha('Livre na data', i.livreNaData, true, '=')}
      {linha('Esta ordem precisa de', i.necessario)}
      {linha('Falta', i.falta, true)}
      {(i.estoque ?? 0) < 0 && (
        <p style={{ color: 'hsl(var(--warning-hsl))', marginTop: 4 }}>
          O estoque no ERP está negativo. Se este insumo não tem controle de estoque, classifique como "Sem controle".
        </p>
      )}
    </div>
  );
}

/**
 * Insumos da semana: faltas por ordem (expansíveis), o que revisar, origem das bases e a classificação dos
 * insumos. Só avisa, nunca bloqueia. Regras e raciocínio no backend: cobertura/calc.rs.
 */
export default function CoberturaInsumosDrawer({ isOpen, onClose, semana, descreverOrdem, onVincular, onMudou }: Props) {
  const [dados, setDados] = useState<Cobertura | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<string>('faltas');
  const [busca, setBusca] = useState('');
  const [sit, setSit] = useState<'todas' | 'falta' | 'chega'>('todas');
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<Set<string>>(new Set());
  const [classificar, setClassificar] = useState<{ ordem: ResultadoOrdem; i: InsumoOrdem } | null>(null);
  const [versaoCl, setVersaoCl] = useState(0);
  const [pedido, setPedido] = useState<number | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setDados(await apiJson<Cobertura>(`/api/producao/cobertura?week=${encodeURIComponent(semana)}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a cobertura de insumos.');
    } finally {
      setLoading(false);
    }
  }, [semana]);

  useEffect(() => {
    if (isOpen) carregar();
  }, [isOpen, carregar]);

  const definirBaseFonte = useCallback(
    async (ordemId: string, fonte: BaseFonte) => {
      setSalvando(ordemId);
      setErro(null);
      try {
        await apiJson(`/api/producao/cobertura/ordens/${encodeURIComponent(ordemId)}/base-fonte`, {
          method: 'PUT',
          body: JSON.stringify({ fonte, confirmar: true }),
        });
        await carregar();
        onMudou?.();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível gravar a origem da base.');
      } finally {
        setSalvando(null);
      }
    },
    [carregar, onMudou]
  );

  const ordens = dados?.ordens ?? [];
  const avisos = dados?.avisos ?? [];
  const ordensComBase = useMemo(() => ordens.filter((o) => (o.bases ?? []).length > 0), [ordens]);
  const insumos = dados?.insumos ?? [];

  // Mesma conta da aba Insumos (estoque, reserva, consumo previsto), pior saldo primeiro.
  const imprimir = () => {
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const linhas = [...insumos]
      .sort((a, b) => a.livre - a.consumoPrevisto - (b.livre - b.consumoPrevisto))
      .map((i) => {
        const saldo = i.livre - i.consumoPrevisto;
        const un = i.unidade ? ` ${esc(i.unidade)}` : '';
        return `<tr><td>${esc(i.descricao || i.codigo)}<br><small>${esc(i.codigo)}</small></td><td>${fmt(i.estoque)}${un}</td><td>${fmt(i.reserva)}</td><td>${fmt(i.livre)}</td><td>${fmt(i.consumoPrevisto)}</td><td style="font-weight:700;color:${saldo < 0 ? '#b91c1c' : '#18181b'}">${fmt(saldo)}</td></tr>`;
      })
      .join('');
    printHtmlViaIframe(
      `<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:11px;margin:16px}h1{font-size:14px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d4d4d8;padding:4px 6px;text-align:left}th{background:#f4f4f5}td:nth-child(n+2){text-align:right}small{color:#71717a}</style></head><body><h1>Insumos da semana ${esc(semana)}</h1><table><thead><tr><th>Insumo</th><th>Estoque</th><th>Reserva</th><th>Livre</th><th>Consumo previsto</th><th>Saldo</th></tr></thead><tbody>${linhas}</tbody></table></body></html>`
    );
  };

  // ordens com algum insumo que não está OK, já filtradas pela busca e pela situação
  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const out: Array<{ o: ResultadoOrdem; itens: InsumoOrdem[] }> = [];
    for (const o of ordens) {
      const itens = (o.insumos ?? []).filter((i) => {
        if (i.status === 'ok') return false;
        if (sit === 'falta' && i.status !== 'falta') return false;
        if (sit === 'chega' && i.status === 'falta') return false;
        return !q || `${descreverOrdem(o.id)} ${i.descricao} ${i.codigo}`.toLowerCase().includes(q);
      });
      if (itens.length > 0) out.push({ o, itens });
    }
    return out;
  }, [ordens, busca, sit, descreverOrdem]);
  const totalFaltas = useMemo(() => ordens.reduce((n, o) => n + (o.insumos ?? []).filter((i) => i.status !== 'ok').length, 0), [ordens]);

  const alternar = (set: Set<string>, setter: (s: Set<string>) => void, chave: string) => {
    const n = new Set(set);
    if (n.has(chave)) n.delete(chave);
    else n.add(chave);
    setter(n);
  };

  const abas: DrawerTab[] = [
    { id: 'faltas', label: 'Faltas', badge: totalFaltas || undefined },
    { id: 'revisar', label: 'Revisar', badge: avisos.length || undefined },
    { id: 'bases', label: 'Bases', badge: ordensComBase.length || undefined },
    { id: 'classificacao', label: 'Classificação' },
    { id: 'insumos', label: 'Insumos' },
  ];

  if (!isOpen) return null;

  const vazio = (n: number, colSpan: number, txt: string) =>
    n === 0 ? (
      <tr>
        <td colSpan={colSpan} style={{ padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }}>{txt}</td>
      </tr>
    ) : null;

  const linkPedido = (n?: number) =>
    n ? (
      <button type="button" onClick={() => setPedido(n)} style={{ color: 'hsl(var(--text-primary-hsl))', textDecoration: 'underline', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, fontSize: 'inherit' }} title="Abrir o pedido">
        Pedido {n}
      </button>
    ) : null;

  return (
    <Drawer
      onClose={onClose}
      title="Insumos da semana"
      subtitle={`Semana ${semana.split('-W')[1] ?? semana} · só avisa, não bloqueia`}
      tabs={abas}
      activeTab={aba}
      onTabChange={setAba}
      size="lg"
      loading={loading && !dados}
      loadingText="Calculando a cobertura..."
      headerActions={
        <div style={{ display: 'flex', gap: 6 }}>
          <BotaoAcao onClick={imprimir} disabled={!dados} title="Imprime os insumos da semana com a mesma conta desta tela">
            <Printer size={14} /> Imprimir
          </BotaoAcao>
          <BotaoAcao onClick={carregar} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </BotaoAcao>
        </div>
      }
    >
      <div style={{ padding: 16 }}>
        {erro && <p style={{ fontSize: '0.78rem', color: 'hsl(var(--danger-hsl))', marginBottom: 8 }}>{erro}</p>}

        {aba === 'faltas' && dados && (
          <>
            <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar ordem ou insumo...">
              <FiltroSelect
                value={sit}
                onChange={(v) => setSit(v as 'todas' | 'falta' | 'chega')}
                opcoes={[
                  { valor: 'todas', rotulo: 'Todas as situações' },
                  { valor: 'falta', rotulo: 'Sem cobertura' },
                  { valor: 'chega', rotulo: 'Chega depois' },
                ]}
              />
            </FilterBar>
            <div className="panel-card" style={{ overflowX: 'auto', padding: 0 }}>
              <table className="data-table compacta">
                <thead>
                  <tr>
                    <th>Ordem / insumo</th>
                    <th className="numeric-col">Falta</th>
                    <th>Situação</th>
                    <th style={{ textAlign: 'center' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {vazio(grupos.length, 4, 'Nenhuma falta de insumo. Todas as ordens da semana estão cobertas.')}
                  {grupos.map(({ o, itens }) => {
                    const aberta = abertas.has(o.id) || busca.trim().length > 0;
                    const [cod, desc, det] = partesOrdem(descreverOrdem(o.id));
                    const semCob = itens.filter((i) => i.status === 'falta').length;
                    return (
                      <React.Fragment key={o.id}>
                        <tr style={{ cursor: 'pointer', background: 'hsl(var(--background-hsl))' }} onClick={() => alternar(abertas, setAbertas, o.id)}>
                          <td colSpan={2}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span className="product-code">{cod}</span>
                              <span style={{ fontWeight: 600, fontSize: '0.75rem' }}>{desc}</span>
                              <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))' }}>{det}</span>
                            </span>
                          </td>
                          <td colSpan={2}>
                            {semCob > 0 && <StatusBadge variante="critico">{semCob} sem cobertura</StatusBadge>}{' '}
                            {itens.length - semCob > 0 && <StatusBadge variante="ordem">{itens.length - semCob} chega depois</StatusBadge>}
                          </td>
                        </tr>
                        {aberta &&
                          itens.map((i) => {
                            const s = situacaoInsumo(i);
                            const un = i.unidade ? ` ${i.unidade}` : '';
                            const chave = `${o.id}-${i.codigo}`;
                            const aberto = detalhe.has(chave);
                            return (
                              <React.Fragment key={chave}>
                                <tr>
                                  <td style={{ paddingLeft: 30 }}>
                                    <button
                                      type="button"
                                      onClick={() => alternar(detalhe, setDetalhe, chave)}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                      title="Ver como foi calculado"
                                    >
                                      {aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                      <span>
                                        <span style={{ fontWeight: 600 }}>{i.descricao}</span>
                                        <span className="product-code" style={{ fontSize: '0.65rem', marginLeft: 6 }}>{i.codigo}</span>
                                      </span>
                                    </button>
                                  </td>
                                  <td className="numeric-col" style={{ ...nowrap, fontWeight: 700, color: i.falta > 0 ? 'hsl(var(--danger-hsl))' : undefined }}>
                                    {i.falta > 0 ? `${fmt(i.falta)}${un}` : '-'}
                                  </td>
                                  <td>
                                    <StatusBadge variante={s.variante}>{s.rotulo}</StatusBadge>
                                    {i.pedido ? <div style={{ fontSize: '0.62rem', marginTop: 2 }}>{linkPedido(i.pedido)}{i.fornecedor ? ` · ${i.fornecedor}` : ''}</div> : null}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      className="tab-btn"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                                      title="Sem controle, não usado mais ou trocado por outro insumo"
                                      onClick={() => setClassificar({ ordem: o, i })}
                                    >
                                      <Tags size={12} /> Classificar
                                    </button>
                                  </td>
                                </tr>
                                {aberto && (
                                  <tr>
                                    <td colSpan={4} style={{ paddingLeft: 48, background: 'hsl(var(--background-hsl))' }}>
                                      <ComoFoiCalculado i={i} />
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {aba === 'revisar' && dados && (
          <div className="panel-card" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="data-table compacta">
              <thead>
                <tr>
                  <th style={{ width: '26%' }}>Ordem / insumo</th>
                  <th>Aviso</th>
                  <th>O que fazer</th>
                  <th style={{ textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {vazio(avisos.length, 4, 'Nada para revisar agora.')}
                {avisos.map((a, idx) => {
                  const t = TITULO_AVISO[a.tipo] ?? { rotulo: a.tipo, variante: 'ordem' as VarianteBadge };
                  const [cod, desc, det] = a.ordemId ? partesOrdem(descreverOrdem(a.ordemId)) : [a.insumo ?? 'Pedido', '', ''];
                  const alvo = a.candidatos?.[0];
                  return (
                    <tr key={`${a.tipo}-${a.ordemId ?? a.insumo ?? ''}-${a.pedido ?? ''}-${idx}`}>
                      <td>
                        <span className="product-code">{cod}</span>
                        <div style={{ fontWeight: 600, fontSize: '0.72rem' }}>{desc}</div>
                        <div style={{ fontSize: '0.62rem', color: 'hsl(var(--text-secondary-hsl))' }}>{det}</div>
                      </td>
                      <td>
                        <StatusBadge variante={t.variante}>{t.rotulo}</StatusBadge>
                        {a.pedido ? <div style={{ fontSize: '0.62rem', marginTop: 2 }}>{linkPedido(a.pedido)}{a.fornecedor ? ` · ${a.fornecedor}` : ''}</div> : null}
                      </td>
                      <td style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))' }}>{a.mensagem}</td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {a.pedido ? (
                          <button type="button" className="tab-btn" style={{ padding: '3px 8px', fontSize: '0.7rem', marginRight: 4 }} onClick={() => setPedido(a.pedido as number)}>
                            Abrir pedido
                          </button>
                        ) : null}
                        {a.tipo === 'lote_erp_sem_vinculo' && a.ordemId && a.lote && (
                          <button type="button" className="tab-btn" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '3px 8px', fontSize: '0.7rem' }} onClick={() => onVincular(a.ordemId as string, a.lote as string)}>
                            <Link2 size={12} /> Vincular #{a.lote}
                          </button>
                        )}
                        {(a.tipo === 'sugestao_base' || a.tipo === 'base_tambem_planejada') && a.ordemId && alvo && (
                          <button type="button" className="tab-btn" disabled={salvando === a.ordemId} style={{ padding: '3px 8px', fontSize: '0.7rem' }} onClick={() => definirBaseFonte(a.ordemId as string, alvo as BaseFonte)}>
                            {a.tipo === 'sugestao_base' ? 'Aplicar' : 'Usar ordem da base'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {aba === 'bases' && dados && (
          <div className="panel-card" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="data-table compacta">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Ordem</th>
                  <th>Base</th>
                  <th>De onde sai</th>
                </tr>
              </thead>
              <tbody>
                {vazio(ordensComBase.length, 3, 'Nenhuma ordem da semana usa base.')}
                {ordensComBase.map((o) => {
                  const [cod, desc, det] = partesOrdem(descreverOrdem(o.id));
                  const atual = o.baseFonte ?? 'explodir';
                  return (
                    <tr key={o.id}>
                      <td>
                        <span className="product-code">{cod}</span>
                        <div style={{ fontWeight: 600, fontSize: '0.72rem' }}>{desc}</div>
                        <div style={{ fontSize: '0.62rem', color: 'hsl(var(--text-secondary-hsl))' }}>{det}</div>
                      </td>
                      <td style={{ fontSize: '0.75rem' }}>{(o.bases ?? []).map((b) => b.descricao || b.codigo).join(', ')}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(Object.keys(BASE_FONTE_ROTULO) as BaseFonte[]).map((f) => (
                            <button
                              key={f}
                              type="button"
                              className={`tab-btn ${atual === f ? 'active' : ''}`}
                              disabled={salvando === o.id}
                              style={{ padding: '3px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                              onClick={() => atual !== f && definirBaseFonte(o.id, f)}
                            >
                              {BASE_FONTE_ROTULO[f]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {aba === 'classificacao' && (
          <TabelaClassificacao
            versao={versaoCl}
            onMudou={() => {
              carregar();
              onMudou?.();
            }}
          />
        )}

        {aba === 'insumos' && dados && (
          <div className="panel-card" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="data-table compacta">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th className="numeric-col">Estoque</th>
                  <th className="numeric-col">Reserva</th>
                  <th className="numeric-col">Livre</th>
                  <th className="numeric-col">Consumo previsto</th>
                  <th className="numeric-col">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {vazio(insumos.length, 6, 'Nenhum insumo com consumo previsto.')}
                {[...insumos]
                  .sort((a, b) => a.livre - a.consumoPrevisto - (b.livre - b.consumoPrevisto))
                  .slice(0, 60)
                  .map((i) => {
                    const saldo = i.livre - i.consumoPrevisto;
                    return (
                      <tr key={i.codigo}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{i.descricao || i.codigo}{i.calibrado ? <span style={{ fontSize: '0.62rem', marginLeft: 6 }}>(estoque ajustado)</span> : null}</div>
                          <span className="product-code" style={{ fontSize: '0.65rem' }}>{i.codigo}</span>
                        </td>
                        <td className="numeric-col" style={nowrap}>{fmt(i.estoque)}</td>
                        <td className="numeric-col" style={nowrap}>{fmt(i.reserva)}</td>
                        <td className="numeric-col" style={nowrap}>{fmt(i.livre)}</td>
                        <td className="numeric-col" style={nowrap}>{fmt(i.consumoPrevisto)}</td>
                        <td className="numeric-col" style={{ ...nowrap, fontWeight: 700, color: saldo < 0 ? 'hsl(var(--danger-hsl))' : undefined }}>{fmt(saldo)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {classificar && (
        <ClassificarInsumo
          codigo={classificar.i.codigo}
          descricao={classificar.i.descricao}
          produto={classificar.ordem.produto}
          sugestoes={(classificar.i.equivalentes ?? []).map((e) => ({ codigo: e.codigo, descricao: e.descricao, livre: e.livre }))}
          onClose={() => setClassificar(null)}
          onDone={() => {
            setClassificar(null);
            setVersaoCl((v) => v + 1);
            carregar();
            onMudou?.();
          }}
        />
      )}
      {pedido !== null && <PedidoResumoDrawer nRegistro={pedido} onClose={() => setPedido(null)} />}
    </Drawer>
  );
}
