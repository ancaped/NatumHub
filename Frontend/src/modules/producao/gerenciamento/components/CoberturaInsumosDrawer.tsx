import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, EyeOff, Copy, Link2, Printer, RefreshCw } from 'lucide-react';
import Drawer, { DrawerTab } from '../../../geral/components/ui/Drawer';
import { apiJson } from '../../../geral/lib/http';

import { BASE_FONTE_ROTULO, fmt, fmtData } from './cobertura';
import { SemControleConfirmar, TabelaSemControle } from './semControle';
import { BotaoAcao, FilterBar, FiltroSelect, StatusBadge } from '../../../geral/components/ui/ReportKit';
import type { VarianteBadge } from '../../../geral/components/ui/ReportKit';
import type { BaseFonte, Equivalente, InsumoOrdem, TrocaInfo } from './cobertura';
import type { Cobertura } from './cobertura';

interface DesvioItem {
  lote: string;
  insumo: string;
  descricao: string;
  previsto: number;
  baixado: number;
  razao?: number | null;
}

interface Validacao {
  lotesAnalisados: number;
  itensComparados: number;
  dentroDe10pct: number;
  desvioMediano?: number | null;
  desvioP90?: number | null;
  baixadoSemPrevisao: number;
  previstoSemBaixa: number;
  lotesSemFormula: string[];
  piores: DesvioItem[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  semana: string;
  /** Texto legível de uma ordem do planejamento (produto, data, kg). */
  descreverOrdem: (id: string) => string;
  /** Abre o modal "Vincular lote ERP" já com o número sugerido. */
  onVincular: (ordemId: string, lote: string) => void;
  /** Abre o relatório imprimível de matérias-primas e embalagens da semana. */
  onImprimirRelatorio?: () => void;
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

const fmtPct = (n?: number | null) => (n == null ? '—' : `${(Number(n) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

function situacaoInsumo(i: InsumoOrdem): { variante: VarianteBadge; rotulo: string; detalhe?: string } {
  const ped = i.pedido ? `Pedido ${i.pedido}${i.fornecedor ? ` · ${i.fornecedor}` : ''}` : undefined;
  switch (i.status) {
    case 'chega_depois':
      return { variante: 'ordem', rotulo: `Chega ${fmtData(i.chegaEm).slice(0, 5)}`, detalhe: ped };
    case 'chega_sem_data':
      return { variante: 'aguardando', rotulo: 'Sem previsão', detalhe: ped };
    case 'depende_atrasado':
      return { variante: 'ordem', rotulo: 'Pedido atrasado', detalhe: ped };
    default:
      return { variante: 'critico', rotulo: 'Sem cobertura' };
  }
}

/** "COD — descrição · data · kg" -> [produto, detalhe]. */
function partesOrdem(texto: string): [string, string] {
  const i = texto.indexOf(' · ');
  return i < 0 ? [texto, ''] : [texto.slice(0, i), texto.slice(i + 3)];
}

const nowrap: React.CSSProperties = { whiteSpace: 'nowrap' };

/**
 * Cobertura de insumos da semana (somente leitura; só avisa, nunca bloqueia).
 * Regras e raciocínio no backend: Backend/src/modules/producao/cobertura/calc.rs.
 */
export default function CoberturaInsumosDrawer({ isOpen, onClose, semana, descreverOrdem, onVincular, onImprimirRelatorio, onMudou }: Props) {
  const [dados, setDados] = useState<Cobertura | null>(null);
  const [trocas, setTrocas] = useState<TrocaInfo[]>([]);
  const [trocaEmEdicao, setTrocaEmEdicao] = useState<{
    ordemId: string;
    produto: string;
    de: InsumoOrdem;
    para: Equivalente;
    soEsteProduto: boolean;
    impacto?: { composicoesAfetadas: number; ordensPlanejadasAfetadas: number; jaExiste: boolean };
  } | null>(null);
  const abrirTroca = useCallback(async (ordemId: string, produto: string, de: InsumoOrdem, para: Equivalente) => {
    setTrocaEmEdicao({ ordemId, produto, de, para, soEsteProduto: false });
    try {
      // 1º passo: prévia (nada é gravado)
      const p = await apiJson<{ composicoesAfetadas: number; ordensPlanejadasAfetadas: number; jaExiste: boolean }>(
        '/api/producao/trocas',
        { method: 'POST', body: JSON.stringify({ insumoDe: de.codigo, insumoPara: para.codigo, produto: null }) }
      );
      setTrocaEmEdicao((t) => (t && t.de.codigo === de.codigo && t.para.codigo === para.codigo ? { ...t, impacto: p } : t));
    } catch {
      // a prévia é informativa; o OK continua disponível
    }
  }, []);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<string>('faltas');
  const [busca, setBusca] = useState('');
  const [semControle, setSemControle] = useState<{ codigo: string; descricao: string } | null>(null);
  const [versaoSc, setVersaoSc] = useState(0);
  const [sit, setSit] = useState<'todas' | 'falta' | 'chega'>('todas');
  const [validacao, setValidacao] = useState<Validacao | null>(null);
  const [validando, setValidando] = useState(false);
  const [erroValidacao, setErroValidacao] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [d, t] = await Promise.all([
        apiJson<Cobertura>(`/api/producao/cobertura?week=${encodeURIComponent(semana)}`),
        apiJson<TrocaInfo[]>('/api/producao/trocas').catch(() => [] as TrocaInfo[]),
      ]);
      setDados(d ?? null);
      setTrocas(Array.isArray(t) ? t : []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a cobertura de insumos.');
    } finally {
      setLoading(false);
    }
  }, [semana]);

  useEffect(() => {
    if (isOpen) carregar();
  }, [isOpen, carregar]);

  const rodarValidacao = useCallback(async () => {
    setValidando(true);
    setErroValidacao(null);
    try {
      const v = await apiJson<Validacao>('/api/producao/cobertura/validacao?limite=30');
      setValidacao(v ?? null);
    } catch (e) {
      setErroValidacao(e instanceof Error ? e.message : 'Não foi possível rodar a validação.');
    } finally {
      setValidando(false);
    }
  }, []);

  const [salvando, setSalvando] = useState<string | null>(null);

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

  const gravarTroca = useCallback(async () => {
    if (!trocaEmEdicao) return;
    const { ordemId, produto, de, para, soEsteProduto } = trocaEmEdicao;
    setSalvando(ordemId);
    setErro(null);
    try {
      await apiJson('/api/producao/trocas', {
        method: 'POST',
        body: JSON.stringify({ insumoDe: de.codigo, insumoPara: para.codigo, produto: soEsteProduto ? produto : null, confirmar: true }),
      });
      setTrocaEmEdicao(null);
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar a troca.');
    } finally {
      setSalvando(null);
    }
  }, [trocaEmEdicao, carregar, onMudou]);

  const removerTroca = useCallback(
    async (id: number) => {
      setErro(null);
      try {
        await apiJson(`/api/producao/trocas/${id}?confirmar=true`, { method: 'DELETE' });
        await carregar();
        onMudou?.();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível remover a troca.');
      }
    },
    [carregar, onMudou]
  );

  const ordens = dados?.ordens ?? [];
  const insumos = dados?.insumos ?? [];
  const avisos = dados?.avisos ?? [];

  const ordensComBase = useMemo(() => ordens.filter((o) => (o.bases ?? []).length > 0), [ordens]);

  const insumosCriticos = useMemo(
    () =>
      [...insumos]
        .sort((a, b) => a.livre - a.consumoPrevisto - (b.livre - b.consumoPrevisto))
        .slice(0, 40),
    [insumos]
  );



  const faltas = useMemo(() => {
    const rows: Array<{ o: (typeof ordens)[number]; i: InsumoOrdem }> = [];
    for (const o of ordens) for (const i of o.insumos ?? []) if (i.status !== 'ok') rows.push({ o, i });
    return rows;
  }, [ordens]);
  const faltasVisiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return faltas.filter(({ o, i }) => {
      if (sit === 'falta' && i.status !== 'falta') return false;
      if (sit === 'chega' && i.status === 'falta') return false;
      return !q || `${descreverOrdem(o.id)} ${i.descricao} ${i.codigo}`.toLowerCase().includes(q);
    });
  }, [faltas, busca, sit, descreverOrdem]);

  const abas: DrawerTab[] = [
    { id: 'faltas', label: 'Faltas', badge: faltas.length || undefined },
    { id: 'revisar', label: 'Revisar', badge: avisos.length || undefined },
    { id: 'bases', label: 'Bases', badge: ordensComBase.length || undefined },
    { id: 'trocas', label: 'Trocas', badge: trocas.length || undefined },
    { id: 'sem_controle', label: 'Sem controle' },
    { id: 'insumos', label: 'Insumos' },
    { id: 'validacao', label: 'Calibração' },
  ];

  if (!isOpen) return null;

  const copiarValidacao = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(validacao, null, 2));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const vazio = (n: number, txt: string) =>
    n === 0 ? (
      <tr>
        <td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }}>
          {txt}
        </td>
      </tr>
    ) : null;

  return (
    <Drawer
      onClose={onClose}
      title="Insumos da semana"
      subtitle={`Semana ${semana.split('-W')[1] ?? semana} · só avisa, não bloqueia`}
      tabs={abas}
      activeTab={aba}
      onTabChange={setAba}
      size="2xl"
      loading={loading && !dados}
      loadingText="Calculando a cobertura..."
      headerActions={
        <div style={{ display: 'flex', gap: 6 }}>
          {onImprimirRelatorio && (
            <BotaoAcao onClick={onImprimirRelatorio} title="Relatório de matérias-primas e embalagens da semana, para imprimir">
              <Printer size={14} /> Relatório
            </BotaoAcao>
          )}
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
                    <th style={{ width: '34%' }}>Ordem</th>
                    <th>Insumo</th>
                    <th className="numeric-col">Necessário</th>
                    <th className="numeric-col">Livre</th>
                    <th className="numeric-col">Falta</th>
                    <th>Situação</th>
                    <th style={{ textAlign: 'center' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {vazio(faltasVisiveis.length, 'Nenhuma falta de insumo. Todas as ordens da semana estão cobertas.')}
                  {faltasVisiveis.map(({ o, i }, idx) => {
                    const primeira = idx === 0 || faltasVisiveis[idx - 1].o.id !== o.id;
                    const [prod, det] = partesOrdem(descreverOrdem(o.id));
                    const s = situacaoInsumo(i);
                    const un = i.unidade ? ` ${i.unidade}` : '';
                    const eq = i.equivalentes?.[0];
                    const editando = trocaEmEdicao?.ordemId === o.id && trocaEmEdicao.de.codigo === i.codigo;
                    return (
                      <React.Fragment key={`${o.id}-${i.codigo}`}>
                        <tr style={primeira && idx > 0 ? { borderTop: '2px solid hsl(var(--card-border-hsl))' } : undefined}>
                          <td>
                            {primeira && (
                              <>
                                <span className="product-code">{prod.split(' — ')[0]}</span>
                                <div style={{ fontWeight: 600, fontSize: '0.72rem' }}>{prod.split(' — ').slice(1).join(' — ')}</div>
                                <div style={{ fontSize: '0.62rem', color: 'hsl(var(--text-secondary-hsl))' }}>{det.replace('/2026', '')}</div>
                              </>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{i.descricao}</div>
                            <span className="product-code" style={{ fontSize: '0.65rem' }}>{i.codigo}</span>
                          </td>
                          <td className="numeric-col" style={nowrap}>{fmt(i.necessario)}{un}</td>
                          <td className="numeric-col" style={{ ...nowrap, color: 'hsl(var(--text-secondary-hsl))' }}>{fmt(i.livreNaData)}</td>
                          <td className="numeric-col" style={{ ...nowrap, fontWeight: 700, color: i.falta > 0 ? 'hsl(var(--danger-hsl))' : undefined }}>
                            {i.falta > 0 ? `${fmt(i.falta)}${un}` : '-'}
                          </td>
                          <td>
                            <StatusBadge variante={s.variante}>{s.rotulo}</StatusBadge>
                            {s.detalhe && <div style={{ fontSize: '0.62rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: 2 }}>{s.detalhe}</div>}
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="tab-btn"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '0.7rem', marginRight: 4 }}
                              title="O ERP não controla o estoque deste insumo: parar de acusar falta"
                              onClick={() => setSemControle({ codigo: i.codigo, descricao: i.descricao })}
                            >
                              <EyeOff size={12} /> Sem controle
                            </button>
                            {eq && (
                              <button
                                type="button"
                                className="tab-btn"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                                title={eq.cobreTudo ? `Tem ${fmt(eq.livre)} livre` : `Cobre ${fmt(eq.livre)} de ${fmt(i.necessario)}`}
                                onClick={() => abrirTroca(o.id, o.produto ?? '', i, eq)}
                              >
                                <ArrowLeftRight size={12} /> <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{eq.descricao || eq.codigo}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                        {editando && trocaEmEdicao && (
                          <tr>
                            <td colSpan={7} style={{ background: 'hsl(var(--background-hsl))', padding: '10px 14px' }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                                Trocar {trocaEmEdicao.de.descricao || trocaEmEdicao.de.codigo} por {trocaEmEdicao.para.descricao || trocaEmEdicao.para.codigo}
                              </div>
                              {!trocaEmEdicao.para.cobreTudo && (
                                <div style={{ fontSize: '0.7rem', color: 'hsl(var(--warning-hsl))' }}>
                                  O substituto tem só {fmt(trocaEmEdicao.para.livre)} livre: ainda vai faltar.
                                </div>
                              )}
                              {trocaEmEdicao.impacto && (
                                <div style={{ fontSize: '0.7rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                                  {trocaEmEdicao.impacto.composicoesAfetadas} composição(ões) e {trocaEmEdicao.impacto.ordensPlanejadasAfetadas} ordem(ns) usam este insumo.
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '0.75rem' }}>
                                  <input type="radio" checked={!trocaEmEdicao.soEsteProduto} onChange={() => setTrocaEmEdicao({ ...trocaEmEdicao, soEsteProduto: false })} /> Todos os produtos
                                </label>
                                <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '0.75rem' }}>
                                  <input type="radio" checked={trocaEmEdicao.soEsteProduto} onChange={() => setTrocaEmEdicao({ ...trocaEmEdicao, soEsteProduto: true })} /> Só {trocaEmEdicao.produto}
                                </label>
                                <BotaoAcao primario onClick={gravarTroca} disabled={salvando === o.id}>OK, trocar</BotaoAcao>
                                <BotaoAcao onClick={() => setTrocaEmEdicao(null)}>Cancelar</BotaoAcao>
                              </div>
                            </td>
                          </tr>
                        )}
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
                  <th style={{ width: '24%' }}>Ordem / Insumo</th>
                  <th>Aviso</th>
                  <th>O que fazer</th>
                  <th style={{ textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {vazio(avisos.length, 'Nada para revisar agora.')}
                {avisos.map((a, idx) => {
                  const t = TITULO_AVISO[a.tipo] ?? { rotulo: a.tipo, variante: 'ordem' as VarianteBadge };
                  const [prod, det] = a.ordemId ? partesOrdem(descreverOrdem(a.ordemId)) : [a.insumo ?? 'Pedido', a.pedido ? `Pedido ${a.pedido}${a.fornecedor ? ` · ${a.fornecedor}` : ''}` : ''];
                  const alvo = a.candidatos?.[0];
                  return (
                    <tr key={`${a.tipo}-${a.ordemId ?? a.insumo ?? ''}-${a.pedido ?? ''}-${idx}`}>
                      <td>
                        <div className="product-desc" style={{ fontWeight: 600 }}>{prod}</div>
                        <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))' }}>{det}</div>
                      </td>
                      <td><StatusBadge variante={t.variante}>{t.rotulo}</StatusBadge></td>
                      <td style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))' }}>{a.mensagem}</td>
                      <td style={{ textAlign: 'center' }}>
                        {a.tipo === 'lote_erp_sem_vinculo' && a.ordemId && a.lote && (
                          <button type="button" className="tab-btn" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '3px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }} onClick={() => onVincular(a.ordemId as string, a.lote as string)}>
                            <Link2 size={12} /> Vincular #{a.lote}
                          </button>
                        )}
                        {(a.tipo === 'sugestao_base' || a.tipo === 'base_tambem_planejada') && a.ordemId && alvo && (
                          <button type="button" className="tab-btn" disabled={salvando === a.ordemId} style={{ padding: '3px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }} onClick={() => definirBaseFonte(a.ordemId as string, alvo as BaseFonte)}>
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
                  <th style={{ width: '32%' }}>Ordem</th>
                  <th>Base</th>
                  <th>De onde sai</th>
                </tr>
              </thead>
              <tbody>
                {vazio(ordensComBase.length, 'Nenhuma ordem da semana usa base.')}
                {ordensComBase.map((o) => {
                  const [prod, det] = partesOrdem(descreverOrdem(o.id));
                  const atual = o.baseFonte ?? 'explodir';
                  return (
                    <tr key={o.id}>
                      <td>
                        <div className="product-desc" style={{ fontWeight: 600 }}>{prod}</div>
                        <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))' }}>{det}</div>
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

        {aba === 'sem_controle' && <TabelaSemControle versao={versaoSc} onMudou={() => { carregar(); onMudou?.(); }} />}

        {aba === 'trocas' && dados && (
          <div className="panel-card" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="data-table compacta">
              <thead>
                <tr>
                  <th>Troca</th>
                  <th>Vale para</th>
                  <th>Fórmula</th>
                  <th style={{ textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {vazio(trocas.length, 'Nenhuma troca de insumo ativa. As trocas nascem na aba Faltas, no botão ao lado do insumo.')}
                {trocas.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{t.descricaoDe || t.insumoDe}</span>
                      <span style={{ color: 'hsl(var(--text-secondary-hsl))' }}> → </span>
                      <span style={{ fontWeight: 600 }}>{t.descricaoPara || t.insumoPara}</span>
                    </td>
                    <td style={{ fontSize: '0.75rem' }}>{t.produto ? `só ${t.descricaoProduto || t.produto}` : 'todos os produtos'}</td>
                    <td>
                      {t.formulaCorrigida ? (
                        <StatusBadge variante="saudavel">Corrigida</StatusBadge>
                      ) : (
                        <StatusBadge variante="ordem" title="Troque o insumo na fórmula, ou exclua e adicione o correto. A troca não altera o ERP.">
                          Corrigir em {t.composicoesAfetadas}
                        </StatusBadge>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" className="tab-btn" style={{ padding: '3px 8px', fontSize: '0.7rem' }} onClick={() => removerTroca(t.id)}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {aba === 'insumos' && dados && (
          <>
            <section className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-900">Insumos mais apertados</h3>
              <p className="text-[11px] text-zinc-500">
                Livre = estoque − reserva do ERP. Consumo previsto = ordens ainda não abertas no ERP. Saldo não conta chegadas.
              </p>
              <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white">
                <table className="w-full text-[11px]">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="text-left px-2 py-1.5">Insumo</th>
                      <th className="text-right px-2 py-1.5">Estoque</th>
                      <th className="text-right px-2 py-1.5">Reserva</th>
                      <th className="text-right px-2 py-1.5">Livre</th>
                      <th className="text-right px-2 py-1.5">Consumo previsto</th>
                      <th className="text-right px-2 py-1.5">Saldo</th>
                      <th className="text-right px-2 py-1.5">Chegadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {insumosCriticos.map((i) => {
                      const saldo = i.livre - i.consumoPrevisto;
                      return (
                        <tr key={i.codigo}>
                          <td className="px-2 py-1.5 text-zinc-800">
                            {i.descricao || i.codigo}
                            <span className="text-zinc-400"> · {i.codigo}</span>
                            {i.calibrado && <span className="ml-1 text-[10px] text-sky-700">(estoque calibrado)</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right">{fmt(i.estoque)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(i.reserva)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(i.livre)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(i.consumoPrevisto)}</td>
                          <td className={`px-2 py-1.5 text-right font-bold ${saldo < 0 ? 'text-rose-700' : 'text-zinc-800'}`}>{fmt(saldo)}</td>
                          <td className="px-2 py-1.5 text-right">
                            {(i.chegadas ?? []).length === 0
                              ? '—'
                              : (i.chegadas ?? [])
                                  .map((c) => `${fmt(c.quantidade)} em ${fmtData(c.data)}${c.atrasado ? ' (atrasado)' : ''}`)
                                  .join('; ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {aba === 'validacao' && (
          <section className="space-y-3">
            <p className="text-[11px] text-zinc-600">
              Compara o que a fórmula prevê (com a base explodida em matérias-primas) com o que o ERP realmente baixou nos
              últimos lotes fechados. Serve para confiar nos números antes de usar a cobertura no planejamento.
            </p>
            <button
              type="button"
              onClick={rodarValidacao}
              disabled={validando}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={validando ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              {validando ? 'Validando...' : 'Rodar validação (últimos 30 lotes)'}
            </button>
            {erroValidacao && <p className="text-xs font-semibold text-rose-700">{erroValidacao}</p>}

            {validacao && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-lg font-bold">{validacao.lotesAnalisados}</div>lotes analisados
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-lg font-bold">{validacao.itensComparados}</div>itens comparados
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-lg font-bold">
                      {validacao.itensComparados > 0 ? fmtPct(validacao.dentroDe10pct / validacao.itensComparados) : '—'}
                    </div>
                    dentro de ±10%
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-lg font-bold">
                      {fmtPct(validacao.desvioMediano)} / {fmtPct(validacao.desvioP90)}
                    </div>
                    desvio mediano / p90
                  </div>
                </div>
                <p className="text-[11px] text-zinc-600">
                  Baixado sem previsão na fórmula: {validacao.baixadoSemPrevisao} · Previsto sem baixa: {validacao.previstoSemBaixa}
                  {(validacao.lotesSemFormula ?? []).length > 0 && ` · Lotes sem fórmula: ${(validacao.lotesSemFormula ?? []).join(', ')}`}
                </p>
                <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white">
                  <table className="w-full text-[11px]">
                    <thead className="bg-zinc-50 text-zinc-500">
                      <tr>
                        <th className="text-left px-2 py-1.5">Lote</th>
                        <th className="text-left px-2 py-1.5">Insumo</th>
                        <th className="text-right px-2 py-1.5">Previsto</th>
                        <th className="text-right px-2 py-1.5">Baixado</th>
                        <th className="text-right px-2 py-1.5">Razão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {(validacao.piores ?? []).map((p, idx) => (
                        <tr key={`${p.lote}-${p.insumo}-${idx}`}>
                          <td className="px-2 py-1.5">#{p.lote}</td>
                          <td className="px-2 py-1.5">
                            {p.descricao || p.insumo}
                            <span className="text-zinc-400"> · {p.insumo}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right">{fmt(p.previsto)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(p.baixado)}</td>
                          <td className="px-2 py-1.5 text-right font-bold">{p.razao == null ? '—' : p.razao.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={copiarValidacao}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiado ? 'Copiado' : 'Copiar resultado (JSON)'}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
      {semControle && (
        <SemControleConfirmar
          codigo={semControle.codigo}
          descricao={semControle.descricao}
          marcar
          onClose={() => setSemControle(null)}
          onDone={() => {
            setSemControle(null);
            setVersaoSc((v) => v + 1);
            carregar();
            onMudou?.();
          }}
        />
      )}
    </Drawer>
  );
}
