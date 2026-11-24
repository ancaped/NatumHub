import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Search, Trash2, Users } from 'lucide-react';
import { StatusBadge } from '../../geral/components/ui/ReportKit';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import type { PedidoPrevia } from '../../producao/lib/usePreviaServidor';
import { agruparLinhas, type LinhaBase } from '../../geral/lib/linhas';
import { fetchClientesSugestao, salvarAtacadista, salvarEstrutura } from './api';
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

  // --- Criar / Editar Estrutura ---
  const [editEstId, setEditEstId] = useState<string | null>(null);
  const [estNome, setEstNome] = useState('');
  const [estGalpao, setEstGalpao] = useState('Galpão 1 (Área Nobre)');
  const [estZona, setEstZona] = useState<'nobre' | 'afastado'>('nobre');
  const [estLinhas, setEstLinhas] = useState<Set<string>>(() => new Set());
  const [estLarg, setEstLarg] = useState('100');
  const [estComp, setEstComp] = useState('120');

  // --- Grade da estrutura selecionada ---
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

  const limparFormEstrutura = () => {
    setEditEstId(null);
    setEstNome('');
    setEstGalpao('Galpão 1 (Área Nobre)');
    setEstZona('nobre');
    setEstLinhas(new Set());
    setEstLarg('100');
    setEstComp('120');
  };

  const editarEstrutura = (e: Estrutura) => {
    setEditEstId(e.id);
    setEstNome(e.nome);
    setEstGalpao(e.galpao || 'Galpão 1 (Área Nobre)');
    setEstZona(e.zona === 'afastado' ? 'afastado' : 'nobre');
    setEstLinhas(new Set(e.linhasPermitidas));
    setEstLarg(String(e.estradoLarguraCm));
    setEstComp(String(e.estradoComprimentoCm));
    onChangeEstrutura(e.id);
  };

  const toggleLinhaEst = (prefix: string) => {
    setEstLinhas((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  const gravarEstrutura = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const existente = editEstId ? estruturas.find((e) => e.id === editEstId) : null;
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
        editEstId
          ? `Prateleira '${estNome}' atualizada.`
          : `Prateleira '${estNome}' criada.`,
        'sucesso',
      );
      limparFormEstrutura();
      await onSaved();
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'Erro ao salvar estrutura.', 'erro');
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

  const nomeLinha = (prefix: string) =>
    linhasPrincipais.find((l) => l.linha_prefix === prefix)?.nome_linha ?? prefix;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSub('estruturas')}
          className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer min-h-[42px] ${
            sub === 'estruturas'
              ? 'bg-zinc-900 text-white border-zinc-900'
              : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          Galpões & Prateleiras ({estruturas.length})
        </button>
        <button
          type="button"
          onClick={() => setSub('atacadistas')}
          className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer min-h-[42px] ${
            sub === 'atacadistas'
              ? 'bg-zinc-900 text-white border-zinc-900'
              : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Clientes Atacadistas ({atacadistas.length})
        </button>
      </div>

      {sub === 'estruturas' && (
        <div className="space-y-4 text-xs">
          {/* Lista de prateleiras cadastradas com dedicação por linha */}
          <div className="panel-card !p-4 space-y-3">
            <h3 className="text-sm font-bold text-zinc-900">
              Estruturas & Regras de Separação por Linha
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {estruturas.map((e) => {
                const selecionada = estAtiva?.id === e.id;
                return (
                  <div
                    key={e.id}
                    className={`rounded-xl border p-3 space-y-2 ${
                      selecionada ? 'border-zinc-900 bg-zinc-50/70' : 'border-zinc-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-zinc-900 truncate">{e.nome}</div>
                        <div className="text-[11px] text-zinc-500">
                          {e.galpao} · {e.zona === 'afastado' ? 'Área secundária' : 'Área nobre'}
                        </div>
                      </div>
                      <StatusBadge variante={e.zona === 'afastado' ? 'apoio' : 'saudavel'}>
                        {e.posicoesOcupadas}/{e.totalPosicoes} vãos
                      </StatusBadge>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[11px] text-zinc-500 mr-1">Linhas:</span>
                      {e.linhasPermitidas.length === 0 ? (
                        <StatusBadge variante="apoio">Todas as linhas (livre)</StatusBadge>
                      ) : (
                        e.linhasPermitidas.map((lp) => (
                          <StatusBadge key={lp} variante="ordem">
                            {nomeLinha(lp)}
                          </StatusBadge>
                        ))
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => onVerNoMapa(e.id)}
                        className="px-2.5 py-1.5 min-h-[36px] rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 font-bold cursor-pointer"
                      >
                        Abrir no Mapa 2D
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => editarEstrutura(e)}
                          className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-zinc-900 text-white font-bold cursor-pointer"
                        >
                          Editar regra & linhas
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Criar ou editar estrutura */}
          {canEdit && (
            <form onSubmit={gravarEstrutura} className="panel-card !p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900">
                  {editEstId ? `Editando: ${estNome}` : 'Nova prateleira / área de pátio'}
                </h3>
                {editEstId && (
                  <button
                    type="button"
                    onClick={limparFormEstrutura}
                    className="text-zinc-500 underline cursor-pointer"
                  >
                    Cancelar edição
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                <label className="space-y-1 lg:col-span-2">
                  <span className="font-semibold text-zinc-600 block">Nome da estante / área</span>
                  <input
                    required
                    value={estNome}
                    onChange={(e) => setEstNome(e.target.value)}
                    placeholder="Ex: Prateleira 2 — Natum"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">Galpão</span>
                  <input
                    required
                    value={estGalpao}
                    onChange={(e) => setEstGalpao(e.target.value)}
                    placeholder="Galpão 1 (Área Nobre)"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">Zona</span>
                  <select
                    value={estZona}
                    onChange={(e) =>
                      setEstZona(e.target.value === 'afastado' ? 'afastado' : 'nobre')
                    }
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-semibold"
                  >
                    <option value="nobre">Área Nobre (saída alta)</option>
                    <option value="afastado">Área Secundária (afastada)</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="space-y-1">
                    <span className="font-semibold text-zinc-600 block">Larg. (cm)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={estLarg}
                      onChange={(e) => setEstLarg(e.target.value)}
                      className="w-full px-2 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-semibold text-zinc-600 block">Comp. (cm)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={estComp}
                      onChange={(e) => setEstComp(e.target.value)}
                      className="w-full px-2 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-zinc-700 block">
                  Dedicar prateleira a linhas específicas (vazio = livre para todas; evita misturar Hair e Natum):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {linhasPrincipais.map((l) => {
                    const marcada = estLinhas.has(l.linha_prefix);
                    return (
                      <label
                        key={l.linha_prefix}
                        className={`px-2.5 py-1.5 min-h-[36px] rounded-lg border flex items-center gap-1.5 cursor-pointer font-semibold ${
                          marcada
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-700 border-zinc-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={() => toggleLinhaEst(l.linha_prefix)}
                        />
                        <span>{l.nome_linha}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="px-4 py-2 min-h-[40px] rounded-xl bg-zinc-900 text-white font-bold cursor-pointer"
              >
                {editEstId ? 'Salvar Prateleira' : 'Criar Prateleira'}
              </button>
            </form>
          )}

          {/* Grade de vãos da prateleira ativa */}
          {estAtiva && canEdit && (
            <div className="panel-card !p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">
                    Grade física de {estAtiva.nome}
                  </h3>
                  <p className="text-zinc-500">
                    Defina colunas (A–G ou P1–P6), prateleiras e altura dos vãos em cm.
                  </p>
                </div>
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
                        {
                          andar: prev.length + 1,
                          alturaCm: 74,
                          papel: 'pulmao',
                          lados: 2,
                        },
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
                        className="ml-auto text-rose-600 font-bold cursor-pointer"
                      >
                        Remover prateleira
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

              <button
                type="button"
                onClick={aplicarGrade}
                className="px-4 py-2 min-h-[40px] rounded-xl bg-zinc-900 text-white font-bold cursor-pointer"
              >
                Pré-visualizar e Aplicar Grade
              </button>
            </div>
          )}
        </div>
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
                    <StatusBadge variante={a.pedidosEncontrados > 0 ? 'saudavel' : 'apoio'}>
                      {a.pedidosEncontrados} pedidos ({janelaMeses}m)
                    </StatusBadge>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removerAtacadista(a)}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
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
    </div>
  );
}
