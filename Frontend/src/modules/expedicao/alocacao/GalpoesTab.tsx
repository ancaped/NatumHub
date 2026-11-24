import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Search, Trash2, Users } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import {
  BotaoAcao,
  ReportTabs,
  StatusBadge,
  TabelaPainel,
} from '../../geral/components/ui/ReportKit';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import type { PedidoPrevia } from '../../producao/lib/usePreviaServidor';
import { agruparLinhas, type LinhaBase } from '../../geral/lib/linhas';
import {
  fetchClientesSugestao,
  rotuloGrupoAlocacao,
  salvarAtacadista,
  salvarEstrutura,
} from './api';
import type { Atacadista, ClienteSugestao, Estrutura, PosicaoComItens } from './types';

interface GalpoesTabProps {
  estruturaAtivaId: string;
  onChangeEstrutura: (id: string) => void;
  estruturas: Estrutura[];
  posicoes: PosicaoComItens[];
  atacadistas: Atacadista[];
  linhasConfigs: LinhaBase[];
  janelaMeses: number;
  canEdit: boolean;
  onSaved: () => Promise<void>;
  onVerNoMapa: (estId: string) => void;
  avisar: (msg: string, tipo?: TipoAviso) => void;
  pedirPrevia: (p: PedidoPrevia) => Promise<void>;
}

export function GalpoesTab({
  estruturaAtivaId,
  onChangeEstrutura,
  estruturas,
  posicoes,
  atacadistas,
  linhasConfigs,
  janelaMeses,
  canEdit,
  onSaved,
  onVerNoMapa,
  avisar,
  pedirPrevia,
}: GalpoesTabProps) {
  const [sub, setSub] = useState<'estruturas' | 'atacadistas'>('estruturas');

  const linhasPrincipais = useMemo(
    () =>
      agruparLinhas(linhasConfigs)
        .filter((g) => g.nivel === 0)
        .map((g) => g.linha),
    [linhasConfigs],
  );

  // Opções de dedicação: linhas principais + Kits da linha + Coloração
  const opcoesGruposDedicacao = useMemo(() => {
    const out: Array<{ valor: string; rotulo: string }> = [];
    for (const l of linhasPrincipais) {
      out.push({ valor: l.linha_prefix, rotulo: l.nome_linha });
      out.push({ valor: `kits:${l.linha_prefix}`, rotulo: `Kits — ${l.nome_linha}` });
    }
    out.push({ valor: 'coloracao', rotulo: 'Coloração (cat_coloracao)' });
    return out;
  }, [linhasPrincipais]);

  // --- Drawer Criar/Editar Prateleira ---
  const [drawerEstOpen, setDrawerEstOpen] = useState(false);
  const [editEstId, setEditEstId] = useState<string | null>(null);
  const [estNome, setEstNome] = useState('');
  const [estGalpao, setEstGalpao] = useState('Galpão 1 (Área Nobre)');
  const [estZona, setEstZona] = useState<'nobre' | 'afastado'>('nobre');
  const [estLinhas, setEstLinhas] = useState<Set<string>>(() => new Set());
  const [estLarg, setEstLarg] = useState('100');
  const [estComp, setEstComp] = useState('120');
  const [salvandoEst, setSalvandoEst] = useState(false);

  // --- Drawer Configurar Grade ---
  const [drawerGradeOpen, setDrawerGradeOpen] = useState(false);
  const estAtiva = estruturas.find((e) => e.id === estruturaAtivaId) ?? estruturas[0] ?? null;
  const [gradeColunas, setGradeColunas] = useState('A,B,C,D,E,F,G');
  const [gradeLarg, setGradeLarg] = useState('100');
  const [gradeComp, setGradeComp] = useState('120');
  const [gradeSubstituir, setGradeSubstituir] = useState(false);
  const [gradePrateleiras, setGradePrateleiras] = useState<
    Array<{ andar: number; alturaCm: number; papel: 'picking' | 'pulmao'; lados: number }>
  >([
    { andar: 1, alturaCm: 74.1, papel: 'picking', lados: 2 },
    { andar: 2, alturaCm: 74, papel: 'picking', lados: 2 },
    { andar: 3, alturaCm: 74, papel: 'pulmao', lados: 2 },
    { andar: 4, alturaCm: 100, papel: 'pulmao', lados: 2 },
    { andar: 5, alturaCm: 74, papel: 'pulmao', lados: 2 },
    { andar: 6, alturaCm: 74, papel: 'pulmao', lados: 2 },
  ]);

  // --- Atacadistas ---
  const [atNome, setAtNome] = useState('');
  const [atTermo, setAtTermo] = useState('');
  const [atCod, setAtCod] = useState('');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clientesErp, setClientesErp] = useState<ClienteSugestao[]>([]);
  const [carregandoClientes, setCarregandoClientes] = useState(false);

  useEffect(() => {
    if (!estAtiva) return;
    setGradeLarg(String(estAtiva.estradoLarguraCm));
    setGradeComp(String(estAtiva.estradoComprimentoCm));
    if (posicoes.length > 0 && posicoes[0].estruturaId === estAtiva.id) {
      const cols = Array.from(
        new Map(posicoes.map((p) => [p.coluna, p.colunaOrdem])).entries(),
      )
        .sort((a, b) => a[1] - b[1])
        .map((e) => e[0]);
      if (cols.length > 0) setGradeColunas(cols.join(','));

      const porPrat = new Map<number, PosicaoComItens[]>();
      for (const p of posicoes) {
        if (!p.ativo) continue;
        porPrat.set(p.andar, [...(porPrat.get(p.andar) ?? []), p]);
      }
      if (porPrat.size > 0) {
        const lista = Array.from(porPrat.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([andar, ps]) => ({
            andar,
            alturaCm: ps[0].alturaCm,
            papel: (ps[0].papel === 'pulmao' ? 'pulmao' : 'picking') as 'picking' | 'pulmao',
            lados: Math.max(1, Math.min(2, new Set(ps.map((x) => x.lado)).size)),
          }));
        setGradePrateleiras(lista);
      }
    }
  }, [estAtiva, posicoes]);

  const buscarClientesErp = async () => {
    setCarregandoClientes(true);
    try {
      const lista = await fetchClientesSugestao(buscaCliente, janelaMeses);
      setClientesErp(lista);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao buscar clientes do ERP.', 'erro');
    } finally {
      setCarregandoClientes(false);
    }
  };

  useEffect(() => {
    if (sub === 'atacadistas' && clientesErp.length === 0) {
      void buscarClientesErp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  const abrirNovaEstrutura = () => {
    setEditEstId(null);
    setEstNome('');
    setEstGalpao('Galpão 1 (Área Nobre)');
    setEstZona('nobre');
    setEstLinhas(new Set());
    setEstLarg('100');
    setEstComp('120');
    setDrawerEstOpen(true);
  };

  const abrirEditarEstrutura = (e: Estrutura) => {
    setEditEstId(e.id);
    setEstNome(e.nome);
    setEstGalpao(e.galpao || 'Galpão 1 (Área Nobre)');
    setEstZona(e.zona === 'afastado' ? 'afastado' : 'nobre');
    setEstLinhas(new Set(e.linhasPermitidas));
    setEstLarg(String(e.estradoLarguraCm));
    setEstComp(String(e.estradoComprimentoCm));
    onChangeEstrutura(e.id);
    setDrawerEstOpen(true);
  };

  const abrirGradeEstrutura = (e: Estrutura) => {
    onChangeEstrutura(e.id);
    setDrawerGradeOpen(true);
  };

  const toggleLinhaEst = (prefix: string) => {
    setEstLinhas((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  const gravarEstrutura = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    const existente = editEstId ? estruturas.find((e) => e.id === editEstId) : null;
    setSalvandoEst(true);
    try {
      await salvarEstrutura(
        editEstId,
        {
          nome: estNome.trim(),
          descricao: existente?.descricao ?? null,
          galpao: estGalpao.trim() || 'Galpão 1 (Área Nobre)',
          zona: estZona,
          linhasPermitidas: Array.from(estLinhas),
          estradoLarguraCm: Number(estLarg) || 100,
          estradoComprimentoCm: Number(estComp) || 120,
          ordem: existente?.ordem ?? estruturas.length + 1,
          ativo: existente?.ativo ?? true,
        },
        true,
      );
      avisar(
        editEstId ? `Prateleira '${estNome}' atualizada.` : `Prateleira '${estNome}' criada.`,
        'sucesso',
      );
      setDrawerEstOpen(false);
      await onSaved();
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'Erro ao salvar estrutura.', 'erro');
    } finally {
      setSalvandoEst(false);
    }
  };

  const aplicarGrade = () => {
    if (!estAtiva) return;
    const cols = gradeColunas
      .split(/[,;\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const body = {
      colunas: cols,
      andares: gradePrateleiras,
      larguraCm: Number(gradeLarg) || 100,
      comprimentoCm: Number(gradeComp) || 120,
      substituirNaoFixadas: gradeSubstituir,
    };
    void pedirPrevia({
      url: `/expedicao/alocacao/estruturas/${encodeURIComponent(estAtiva.id)}/gerar-grade`,
      init: { method: 'POST', body: JSON.stringify(body) },
      titulo: `Gerar/Atualizar grade de ${estAtiva.nome}`,
      confirmarRotulo: 'Aplicar Grade',
      linhas: (d) => [
        { titulo: 'Colunas', detalhe: cols.join(', ') },
        { titulo: 'Posições criadas', detalhe: String(d?.resultado?.criadas ?? d?.criadas ?? 0) },
        {
          titulo: 'Posições atualizadas',
          detalhe: String(d?.resultado?.atualizadas ?? d?.atualizadas ?? 0),
        },
        {
          titulo: 'Posições desativadas',
          detalhe: String(d?.resultado?.desativadas ?? d?.desativadas ?? 0),
        },
      ],
      erroPadrao: 'Erro ao gerar grade.',
      aoConcluir: async () => {
        avisar('Grade da estrutura atualizada.', 'sucesso');
        setDrawerGradeOpen(false);
        await onSaved();
      },
    });
  };

  const aplicarPresetEstrutura = (tipo: 'estante' | 'patio') => {
    if (tipo === 'patio') {
      setGradeColunas('P1,P2,P3,P4,P5,P6');
      setGradeLarg('100');
      setGradeComp('120');
      setGradePrateleiras([{ andar: 1, alturaCm: 180, papel: 'pulmao', lados: 1 }]);
    } else {
      setGradeColunas('A,B,C,D,E,F,G');
      setGradeLarg('100');
      setGradeComp('120');
      setGradePrateleiras([
        { andar: 1, alturaCm: 74.1, papel: 'picking', lados: 2 },
        { andar: 2, alturaCm: 74, papel: 'picking', lados: 2 },
        { andar: 3, alturaCm: 74, papel: 'pulmao', lados: 2 },
        { andar: 4, alturaCm: 100, papel: 'pulmao', lados: 2 },
        { andar: 5, alturaCm: 74, papel: 'pulmao', lados: 2 },
        { andar: 6, alturaCm: 74, papel: 'pulmao', lados: 2 },
      ]);
    }
  };

  const gravarAtacadista = async (
    nomeExibicao: string,
    termoBusca: string,
    clienteCodigo: number | null,
  ) => {
    try {
      await salvarAtacadista(
        null,
        { nomeExibicao, termoBusca, clienteCodigo, ativo: true },
        true,
      );
      avisar(`Atacadista '${nomeExibicao}' adicionado.`, 'sucesso');
      setAtNome('');
      setAtTermo('');
      setAtCod('');
      await onSaved();
      void buscarClientesErp();
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'Erro ao adicionar atacadista.', 'erro');
    }
  };

  const removerAtacadista = (a: Atacadista) => {
    void pedirPrevia({
      url: `/expedicao/alocacao/atacadistas/${encodeURIComponent(a.id)}`,
      init: { method: 'DELETE' },
      titulo: 'Remover cliente atacadista',
      confirmarRotulo: 'Remover',
      pedirMotivo: true,
      linhas: () => [{ titulo: a.nomeExibicao, detalhe: `Termo: ${a.termoBusca}` }],
      erroPadrao: 'Erro ao remover atacadista.',
      aoConcluir: async () => {
        avisar(`Atacadista '${a.nomeExibicao}' removido.`, 'sucesso');
        await onSaved();
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ReportTabs
          ativa={sub}
          onChange={(id) => setSub(id as 'estruturas' | 'atacadistas')}
          abas={[
            {
              id: 'estruturas',
              label: 'Galpões & Prateleiras',
              icone: <Building2 className="h-3.5 w-3.5" />,
              contagem: estruturas.length,
            },
            {
              id: 'atacadistas',
              label: 'Clientes Atacadistas',
              icone: <Users className="h-3.5 w-3.5" />,
              contagem: atacadistas.length,
            },
          ]}
        />
        {sub === 'estruturas' && canEdit && (
          <BotaoAcao primario onClick={abrirNovaEstrutura}>
            <Plus className="h-3.5 w-3.5" />
            Nova Prateleira
          </BotaoAcao>
        )}
      </div>

      {sub === 'estruturas' && (
        <>
          <div className="hidden md:block">
            <TabelaPainel>
              <thead>
                <tr>
                  <th>Estrutura</th>
                  <th>Galpão / Zona</th>
                  <th>Grupos Dedicados</th>
                  <th className="text-center">Vãos</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {estruturas.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="font-bold text-zinc-900">{e.nome}</div>
                      <div className="text-[11px] font-mono text-zinc-500">
                        Estrado {e.estradoLarguraCm}×{e.estradoComprimentoCm} cm
                      </div>
                    </td>
                    <td>
                      <div className="text-zinc-800">{e.galpao}</div>
                      <div className="mt-0.5">
                        <StatusBadge
                          variante={e.zona === 'afastado' ? 'aguardando' : 'saudavel'}
                        >
                          {e.zona === 'afastado' ? 'Área Secundária' : 'Área Nobre'}
                        </StatusBadge>
                      </div>
                    </td>
                    <td>
                      {e.linhasPermitidas.length === 0 ? (
                        <StatusBadge variante="descontinuado">Livre (Todas)</StatusBadge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {e.linhasPermitidas.map((lp) => (
                            <StatusBadge key={lp} variante="ordem">
                              {rotuloGrupoAlocacao(lp, linhasConfigs)}
                            </StatusBadge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="text-center font-mono">
                      {e.posicoesOcupadas}/{e.totalPosicoes}{' '}
                      <span className="text-[11px] text-zinc-500">
                        ({Math.round(e.ocupacaoMediaPct ?? 0)}%)
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onVerNoMapa(e.id)}
                          className="text-xs font-bold text-zinc-700 hover:underline cursor-pointer"
                        >
                          Mapa 2D
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => abrirEditarEstrutura(e)}
                              className="text-xs font-bold text-zinc-900 hover:underline cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirGradeEstrutura(e)}
                              className="text-xs font-bold text-zinc-600 hover:underline cursor-pointer"
                            >
                              Grade
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TabelaPainel>
          </div>

          <div className="md:hidden space-y-2">
            {estruturas.map((e) => (
              <div key={e.id} className="panel-card !p-3 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-zinc-900 truncate">{e.nome}</div>
                    <div className="text-[11px] text-zinc-500">
                      {e.galpao} · {e.posicoesOcupadas}/{e.totalPosicoes} vãos
                    </div>
                  </div>
                  <StatusBadge variante={e.zona === 'afastado' ? 'aguardando' : 'saudavel'}>
                    {e.zona === 'afastado' ? 'Secundária' : 'Nobre'}
                  </StatusBadge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {e.linhasPermitidas.length === 0 ? (
                    <StatusBadge variante="descontinuado">Livre (Todas)</StatusBadge>
                  ) : (
                    e.linhasPermitidas.map((lp) => (
                      <StatusBadge key={lp} variante="ordem">
                        {rotuloGrupoAlocacao(lp, linhasConfigs)}
                      </StatusBadge>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onVerNoMapa(e.id)}
                    className="px-3 py-2 min-h-[40px] rounded-lg border border-zinc-200 bg-white font-semibold"
                  >
                    Mapa 2D
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => abrirEditarEstrutura(e)}
                        className="px-3 py-2 min-h-[40px] rounded-lg bg-zinc-900 text-white font-semibold"
                      >
                        Editar regra
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirGradeEstrutura(e)}
                        className="px-3 py-2 min-h-[40px] rounded-lg border border-zinc-200 bg-white font-semibold"
                      >
                        Grade
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {sub === 'atacadistas' && (
        <div className="space-y-4">
          <div className="panel-card !p-4 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-zinc-900">
              Clientes Atacadistas ({atacadistas.length})
            </h3>
            <p className="text-zinc-500">
              Pedidos desses clientes alimentam o dimensionamento de <strong>Pulmão</strong>; todo o restante entra como <strong>Varejo (Picking)</strong>.
            </p>
            <div className="space-y-2">
              {atacadistas.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-zinc-200 bg-white"
                >
                  <div>
                    <span className="font-bold text-zinc-900">{a.nomeExibicao}</span>{' '}
                    <span className="font-mono text-zinc-500">
                      (termo: {a.termoBusca}
                      {a.clienteCodigo != null ? ` · cód. ${a.clienteCodigo}` : ''})
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      variante={a.pedidosEncontrados > 0 ? 'saudavel' : 'descontinuado'}
                    >
                      {a.pedidosEncontrados} pedidos ({janelaMeses}m)
                    </StatusBadge>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removerAtacadista(a)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {canEdit && (
              <div className="pt-2 border-t border-zinc-100 flex flex-wrap items-end gap-2">
                <label className="space-y-1 flex-1 min-w-[160px]">
                  <span className="font-semibold text-zinc-600 block">Nome exibição</span>
                  <input
                    value={atNome}
                    onChange={(e) => setAtNome(e.target.value)}
                    placeholder="Ex: Casa Aladim"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white"
                  />
                </label>
                <label className="space-y-1 flex-1 min-w-[160px]">
                  <span className="font-semibold text-zinc-600 block">Termo no ERP</span>
                  <input
                    value={atTermo}
                    onChange={(e) => setAtTermo(e.target.value)}
                    placeholder="Ex: CASA ALADIM"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white uppercase"
                  />
                </label>
                <label className="space-y-1 w-28">
                  <span className="font-semibold text-zinc-600 block">Cód. ERP (opc.)</span>
                  <input
                    type="number"
                    value={atCod}
                    onChange={(e) => setAtCod(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void gravarAtacadista(
                      atNome,
                      atTermo,
                      atCod.trim() ? parseInt(atCod.trim(), 10) : null,
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-zinc-900 text-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </button>
              </div>
            )}
          </div>

          <div className="panel-card !p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-zinc-800">
                Maiores compradores no ERP ({janelaMeses} meses)
              </h4>
              <div className="flex gap-2">
                <input
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                  placeholder="Filtrar cliente ERP..."
                  className="px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white"
                />
                <button
                  type="button"
                  onClick={() => void buscarClientesErp()}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5" />
                  {carregandoClientes ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 border border-zinc-200 rounded-xl bg-white">
              {clientesErp.map((c, idx) => (
                <div
                  key={`${c.codigo ?? 'x'}-${c.nome}-${idx}`}
                  className="px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-zinc-900 truncate">
                      {c.codigo != null ? `[${c.codigo}] ` : ''}
                      {c.nome}
                    </div>
                    <div className="text-zinc-500 font-mono text-[11px]">
                      {c.pedidos} pedidos · {c.unidades.toLocaleString('pt-BR')} unidades
                    </div>
                  </div>
                  {c.jaAtacadista ? (
                    <StatusBadge variante="saudavel">Atacadista</StatusBadge>
                  ) : (
                    canEdit && (
                      <button
                        type="button"
                        onClick={() => void gravarAtacadista(c.nome, c.nome, c.codigo)}
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 font-bold shrink-0 cursor-pointer"
                      >
                        + Atacadista
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Drawer Criar / Editar Prateleira e Dedicação */}
      <Drawer
        isOpen={drawerEstOpen}
        onClose={() => setDrawerEstOpen(false)}
        size="lg"
        title={editEstId ? `Editar: ${estNome}` : 'Nova Prateleira / Área de Pátio'}
        subtitle="Defina galpão, zona e grupos permitidos (linhas, kits e coloração)"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDrawerEstOpen(false)}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-zinc-200 bg-white text-zinc-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={salvandoEst || !estNome.trim()}
              onClick={() => void gravarEstrutura()}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
            >
              {salvandoEst ? 'Salvando...' : editEstId ? 'Salvar Prateleira' : 'Criar Prateleira'}
            </button>
          </div>
        }
      >
        <form onSubmit={gravarEstrutura} className="p-4 sm:p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 sm:col-span-2">
              <span className="font-semibold text-zinc-600 block">Nome da prateleira / área</span>
              <input
                required
                value={estNome}
                onChange={(e) => setEstNome(e.target.value)}
                placeholder="Ex: Prateleira 2 — Natum"
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Galpão</span>
              <input
                required
                value={estGalpao}
                onChange={(e) => setEstGalpao(e.target.value)}
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Zona</span>
              <select
                value={estZona}
                onChange={(e) => setEstZona(e.target.value === 'afastado' ? 'afastado' : 'nobre')}
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white font-semibold"
              >
                <option value="nobre">Área Nobre (saída alta)</option>
                <option value="afastado">Área Secundária (afastada)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Largura estrado (cm)</span>
              <input
                type="number"
                step="0.1"
                value={estLarg}
                onChange={(e) => setEstLarg(e.target.value)}
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Comprimento estrado (cm)</span>
              <input
                type="number"
                step="0.1"
                value={estComp}
                onChange={(e) => setEstComp(e.target.value)}
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white font-mono"
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="font-semibold text-zinc-700 block">
              Grupos dedicados (vazio = livre para todas; separa Linhas, Kits e Coloração):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {opcoesGruposDedicacao.map((op) => {
                const marcada = estLinhas.has(op.valor);
                return (
                  <label
                    key={op.valor}
                    className={`px-2.5 py-1.5 min-h-[36px] rounded-lg border flex items-center gap-1.5 cursor-pointer font-semibold ${
                      marcada
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => toggleLinhaEst(op.valor)}
                    />
                    <span>{op.rotulo}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </form>
      </Drawer>

      {/* Drawer Grade Física */}
      <Drawer
        isOpen={drawerGradeOpen}
        onClose={() => setDrawerGradeOpen(false)}
        size="lg"
        title={`Grade Física: ${estAtiva?.nome ?? ''}`}
        subtitle="Configure colunas, prateleiras e altura livre dos vãos em cm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDrawerGradeOpen(false)}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-zinc-200 bg-white text-zinc-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={aplicarGrade}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-900 text-white cursor-pointer"
            >
              Pré-visualizar e Aplicar Grade
            </button>
          </div>
        }
      >
        <div className="p-4 sm:p-5 space-y-4 text-xs">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => aplicarPresetEstrutura('estante')}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 font-bold cursor-pointer"
            >
              Porta-paletes (6 prateleiras × 2)
            </button>
            <button
              type="button"
              onClick={() => aplicarPresetEstrutura('patio')}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 font-bold cursor-pointer"
            >
              Área de Pátio / Chão (1 nível)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Colunas / Módulos</span>
              <input
                value={gradeColunas}
                onChange={(e) => setGradeColunas(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono uppercase"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Largura posição (cm)</span>
              <input
                type="number"
                step="0.1"
                value={gradeLarg}
                onChange={(e) => setGradeLarg(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Comprimento (cm)</span>
              <input
                type="number"
                step="0.1"
                value={gradeComp}
                onChange={(e) => setGradeComp(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-800">
                Prateleiras / Níveis ({gradePrateleiras.length})
              </span>
              <button
                type="button"
                onClick={() =>
                  setGradePrateleiras((prev) => [
                    ...prev,
                    { andar: prev.length + 1, alturaCm: 74, papel: 'pulmao', lados: 2 },
                  ])
                }
                className="px-2.5 py-1 rounded-lg border border-zinc-300 bg-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar prateleira
              </button>
            </div>

            {gradePrateleiras.map((a, idx) => (
              <div
                key={a.andar}
                className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-zinc-200 bg-zinc-50/50"
              >
                <span className="font-mono font-bold w-28 text-zinc-900">
                  {gradePrateleiras.length === 1
                    ? 'Pátio (nível único)'
                    : `Prateleira ${a.andar}`}
                </span>
                <label className="flex items-center gap-1">
                  <span className="text-zinc-500">Vão (cm):</span>
                  <input
                    type="number"
                    step="0.1"
                    value={a.alturaCm}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 74;
                      setGradePrateleiras((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, alturaCm: val } : x)),
                      );
                    }}
                    className="w-20 px-2 py-1 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
                <select
                  value={a.papel}
                  onChange={(e) => {
                    const papel = e.target.value === 'pulmao' ? 'pulmao' : 'picking';
                    setGradePrateleiras((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, papel } : x)),
                    );
                  }}
                  className="px-2 py-1 border border-zinc-200 rounded-lg bg-white font-semibold"
                >
                  <option value="picking">Picking</option>
                  <option value="pulmao">Pulmão</option>
                </select>
                <select
                  value={a.lados}
                  onChange={(e) => {
                    const lados = Number(e.target.value) === 1 ? 1 : 2;
                    setGradePrateleiras((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, lados } : x)),
                    );
                  }}
                  className="px-2 py-1 border border-zinc-200 rounded-lg bg-white"
                >
                  <option value={2}>2 posições/col (ímpar/par)</option>
                  <option value={1}>1 posição/col</option>
                </select>
                {gradePrateleiras.length > 1 && idx === gradePrateleiras.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setGradePrateleiras((prev) => prev.slice(0, -1))}
                    className="ml-auto text-red-600 font-bold cursor-pointer"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-zinc-600">
            <input
              type="checkbox"
              checked={gradeSubstituir}
              onChange={(e) => setGradeSubstituir(e.target.checked)}
            />
            <span>Desativar posições antigas que ficarem fora desta grade</span>
          </label>
        </div>
      </Drawer>
    </div>
  );
}
