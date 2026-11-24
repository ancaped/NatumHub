import React, { useMemo, useState } from 'react';
import { Box, CheckCircle2, Plus, Search, Wrench } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import {
  BotaoAcao,
  FiltroSelect,
  ReportTabs,
  StatusBadge,
  TabelaPainel,
} from '../../geral/components/ui/ReportKit';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import type { PedidoPrevia } from '../../producao/lib/usePreviaServidor';
import {
  agruparLinhas,
  prefixosDaLinha,
  rotuloLinha,
  type LinhaBase,
} from '../../geral/lib/linhas';
import { salvarCaixa, salvarVinculoProdutoCaixa } from './api';
import type { Caixa, InsumoCaixaErpNaoVinculado, ProdutoDimensao } from './types';

function rotuloPendencia(s: string): string {
  switch (s) {
    case 'sem_caixa':
      return 'Sem caixa';
    case 'sem_qtde_cx':
      return 'Sem qtde/cx';
    case 'sem_endereco':
      return 'Sem endereço';
    case 'estoque_acima_capacidade':
      return 'Acima cap.';
    case 'estouro_vao':
      return 'Estouro vão';
    default:
      return s;
  }
}

interface CaixasTabProps {
  caixas: Caixa[];
  produtos: ProdutoDimensao[];
  linhasConfigs: LinhaBase[];
  insumosCaixaErp: InsumoCaixaErpNaoVinculado[];
  canEdit: boolean;
  onSaved: () => Promise<void>;
  onAbrirProduto: (p: ProdutoDimensao) => void;
  avisar: (msg: string, tipo?: TipoAviso) => void;
  pedirPrevia: (p: PedidoPrevia) => Promise<void>;
}

export function CaixasTab({
  caixas,
  produtos,
  linhasConfigs,
  insumosCaixaErp,
  canEdit,
  onSaved,
  onAbrirProduto,
  avisar,
  pedirPrevia,
}: CaixasTabProps) {
  const [sub, setSub] = useState<'caixas' | 'conferencia'>('caixas');

  // --- Drawer de Caixa ---
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editCxId, setEditCxId] = useState<string | null>(null);
  const [cxCod, setCxCod] = useState('');
  const [cxNome, setCxNome] = useState('');
  const [cxAlt, setCxAlt] = useState('22.5');
  const [cxComp, setCxComp] = useState('19.5');
  const [cxLarg, setCxLarg] = useState('14.7');
  const [cxEmp, setCxEmp] = useState('4');
  const [cxInsumo, setCxInsumo] = useState('');
  const [salvandoCx, setSalvandoCx] = useState(false);

  // --- Conferência ERP + Lote ---
  const [buscaPend, setBuscaPend] = useState('');
  const [linhaPend, setLinhaPend] = useState('ALL');
  const [tipoPend, setTipoPend] = useState('ALL');
  const [mostrarTodasPend, setMostrarTodasPend] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [loteCaixaId, setLoteCaixaId] = useState('KEEP');
  const [loteQtde, setLoteQtde] = useState('');
  const [caixaInline, setCaixaInline] = useState<Record<string, string>>({});
  const [qtdeInline, setQtdeInline] = useState<Record<string, string>>({});
  const [vincularInsumoCaixaId, setVincularInsumoCaixaId] = useState<Record<string, string>>({});

  const opcoesLinhasPend = useMemo(() => {
    const presentesSet = new Set(produtos.map((p) => p.linhaPrefix));
    const presentes = linhasConfigs.filter((c) =>
      prefixosDaLinha(linhasConfigs, c.linha_prefix).some((x) => presentesSet.has(x)),
    );
    const ordenadas = agruparLinhas(presentes).map((g) => g.linha.linha_prefix);
    const fora = Array.from(presentesSet)
      .filter((k) => !ordenadas.includes(k))
      .sort();
    return [...ordenadas, ...fora].map((prefix) => ({
      valor: prefix,
      rotulo:
        rotuloLinha(linhasConfigs, prefix) === prefix
          ? produtos.find((p) => p.linhaPrefix === prefix)?.nomeLinha ?? prefix
          : rotuloLinha(linhasConfigs, prefix),
    }));
  }, [produtos, linhasConfigs]);

  const todasPendencias = useMemo(
    () => produtos.filter((p) => p.situacaoAlocacao !== 'ok'),
    [produtos],
  );

  const pendenciasFiltradas = useMemo(() => {
    const q = buscaPend.trim().toLowerCase();
    const prefixos =
      linhaPend === 'ALL' ? null : new Set(prefixosDaLinha(linhasConfigs, linhaPend));
    return todasPendencias.filter((p) => {
      if (prefixos && !prefixos.has(p.linhaPrefix)) return false;
      if (tipoPend !== 'ALL' && p.situacaoAlocacao !== tipoPend) return false;
      if (!q) return true;
      return (
        p.codigo.toLowerCase().includes(q) ||
        p.descricao.toLowerCase().includes(q) ||
        (p.insumoCaixaErp ?? '').toLowerCase().includes(q)
      );
    });
  }, [todasPendencias, buscaPend, linhaPend, tipoPend, linhasConfigs]);

  const pendencias = useMemo(
    () => (mostrarTodasPend ? pendenciasFiltradas : pendenciasFiltradas.slice(0, 80)),
    [pendenciasFiltradas, mostrarTodasPend],
  );

  const abrirNovaCaixa = () => {
    setEditCxId(null);
    setCxCod('');
    setCxNome('');
    setCxAlt('22.5');
    setCxComp('19.5');
    setCxLarg('14.7');
    setCxEmp('4');
    setCxInsumo('');
    setDrawerOpen(true);
  };

  const abrirEditarCaixa = (c: Caixa) => {
    setEditCxId(c.id);
    setCxCod(c.codigo);
    setCxNome(c.nome);
    setCxAlt(String(c.alturaCm));
    setCxComp(String(c.comprimentoCm));
    setCxLarg(String(c.larguraCm));
    setCxEmp(String(c.empilhamentoMax));
    setCxInsumo(c.insumoErpCodigo ?? '');
    setDrawerOpen(true);
  };

  const gravarCaixa = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSalvandoCx(true);
    try {
      await salvarCaixa(
        editCxId,
        {
          codigo: cxCod.trim(),
          nome: cxNome.trim(),
          alturaCm: Number(cxAlt),
          comprimentoCm: Number(cxComp),
          larguraCm: Number(cxLarg),
          empilhamentoMax: Math.max(1, parseInt(cxEmp || '4', 10)),
          insumoErpCodigo: cxInsumo.trim() || null,
          ativo: true,
          observacoes: null,
        },
        true,
      );
      avisar(`Caixa ${cxCod} salva.`, 'sucesso');
      setDrawerOpen(false);
      await onSaved();
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'Erro ao salvar caixa.', 'erro');
    } finally {
      setSalvandoCx(false);
    }
  };

  const removerCaixa = (c: Caixa) => {
    void pedirPrevia({
      url: `/expedicao/alocacao/caixas/${encodeURIComponent(c.id)}`,
      init: { method: 'DELETE' },
      titulo: 'Excluir caixa de embarque',
      confirmarRotulo: 'Excluir caixa',
      pedirMotivo: true,
      linhas: () => [
        {
          titulo: `Caixa ${c.codigo} — ${c.nome}`,
          detalhe: `${c.alturaCm}×${c.comprimentoCm}×${c.larguraCm} cm`,
        },
      ],
      erroPadrao: 'Não foi possível excluir a caixa.',
      aoConcluir: async () => {
        avisar(`Caixa ${c.codigo} excluída.`, 'sucesso');
        await onSaved();
      },
    });
  };

  const vincularInsumoNaCaixa = async (ingCode: string) => {
    const cxId = vincularInsumoCaixaId[ingCode];
    const cx = caixas.find((c) => c.id === cxId);
    if (!cx) {
      avisar('Selecione uma caixa para vincular o código ERP.', 'erro');
      return;
    }
    const listaAtual = (cx.insumoErpCodigo ?? '')
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!listaAtual.includes(ingCode)) listaAtual.push(ingCode);
    try {
      await salvarCaixa(
        cx.id,
        {
          codigo: cx.codigo,
          nome: cx.nome,
          alturaCm: cx.alturaCm,
          comprimentoCm: cx.comprimentoCm,
          larguraCm: cx.larguraCm,
          empilhamentoMax: cx.empilhamentoMax,
          insumoErpCodigo: listaAtual.join(', '),
          ativo: cx.ativo,
          observacoes: cx.observacoes,
        },
        true,
      );
      avisar(`Insumo ${ingCode} vinculado à caixa ${cx.codigo}.`, 'sucesso');
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao vincular insumo ERP.', 'erro');
    }
  };

  const salvarInlineProduto = async (p: ProdutoDimensao) => {
    const cid = caixaInline[p.codigo] ?? p.caixaId ?? '';
    const qRaw = qtdeInline[p.codigo];
    const qMan = qRaw && qRaw.trim() ? parseInt(qRaw.trim(), 10) : null;
    try {
      await salvarVinculoProdutoCaixa(
        p.codigo,
        {
          caixaId: cid || null,
          qtdeCxManual: qMan,
          camadasOverride: p.camadasOverride,
          observacoes: null,
        },
        true,
      );
      avisar(`Dados de caixa salvos para ${p.codigo}.`, 'sucesso');
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao salvar vínculo.', 'erro');
    }
  };

  const toggleSelecionado = (codigo: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const todosFiltradosSelecionados =
    pendenciasFiltradas.length > 0 &&
    pendenciasFiltradas.every((p) => selecionados.has(p.codigo));

  const toggleTodosFiltrados = () => {
    if (todosFiltradosSelecionados) {
      setSelecionados((prev) => {
        const next = new Set(prev);
        for (const p of pendenciasFiltradas) next.delete(p.codigo);
        return next;
      });
    } else {
      setSelecionados((prev) => {
        const next = new Set(prev);
        for (const p of pendenciasFiltradas) next.add(p.codigo);
        return next;
      });
    }
  };

  const aplicarEmLote = () => {
    const codigos = Array.from(selecionados);
    if (codigos.length === 0) return;
    const qtdeNum = loteQtde.trim() ? parseInt(loteQtde.trim(), 10) : null;
    if (qtdeNum !== null && !(qtdeNum > 0)) {
      avisar('Informe uma Qtde/Cx válida maior que zero.', 'erro');
      return;
    }
    const payload = {
      produtoCodigos: codigos,
      caixaId: loteCaixaId === 'KEEP' || loteCaixaId === 'CLEAR' ? null : loteCaixaId,
      limparCaixa: loteCaixaId === 'CLEAR',
      qtdeCxManual: qtdeNum,
      limparQtdeCx: false,
    };
    if (!payload.caixaId && !payload.limparCaixa && payload.qtdeCxManual === null) {
      avisar('Escolha uma caixa ou digite Qtde/Cx para aplicar em lote.', 'erro');
      return;
    }
    const caixaLabel =
      loteCaixaId === 'KEEP'
        ? 'Manter caixa atual'
        : loteCaixaId === 'CLEAR'
          ? 'Remover caixa'
          : `CX ${caixas.find((c) => c.id === loteCaixaId)?.codigo ?? loteCaixaId}`;
    void pedirPrevia({
      url: '/expedicao/alocacao/produtos-lote',
      init: { method: 'POST', body: JSON.stringify(payload) },
      titulo: `Aplicar conferência em lote (${codigos.length} produtos)`,
      confirmarRotulo: `Aplicar em ${codigos.length} produtos`,
      linhas: (d) => [
        {
          titulo: 'Produtos encontrados para atualização',
          detalhe: String(d?.resultado?.atualizadosCount ?? d?.atualizadosCount ?? codigos.length),
        },
        { titulo: 'Caixa de embarque', detalhe: caixaLabel },
        {
          titulo: 'Qtde/Cx manual',
          detalhe: qtdeNum !== null ? `${qtdeNum} un/cx` : 'Manter valor atual',
        },
      ],
      erroPadrao: 'Erro ao aplicar alterações em lote.',
      aoConcluir: async (d) => {
        const count = d?.resultado?.atualizadosCount ?? d?.atualizadosCount ?? codigos.length;
        avisar(`Dados atualizados em lote para ${count} produtos.`, 'sucesso');
        setSelecionados(new Set());
        setLoteQtde('');
        await onSaved();
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ReportTabs
          ativa={sub}
          onChange={(id) => setSub(id as 'caixas' | 'conferencia')}
          abas={[
            {
              id: 'caixas',
              label: 'Caixas & Medidas',
              icone: <Box className="h-3.5 w-3.5" />,
              contagem: caixas.length,
            },
            {
              id: 'conferencia',
              label: 'Conferência ERP & Lote',
              icone: <CheckCircle2 className="h-3.5 w-3.5" />,
              contagem: todasPendencias.length,
            },
          ]}
        />
        {sub === 'caixas' && canEdit && (
          <BotaoAcao primario onClick={abrirNovaCaixa}>
            <Plus className="h-3.5 w-3.5" />
            Nova Caixa
          </BotaoAcao>
        )}
      </div>

      {sub === 'caixas' && (
        <>
          <div className="hidden md:block">
            <TabelaPainel>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th className="text-right">Alt × Comp × Larg (cm)</th>
                  <th className="text-center">Empilh. máx.</th>
                  <th>Insumo ERP</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {caixas.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono font-bold text-zinc-900">CX {c.codigo}</td>
                    <td>{c.nome}</td>
                    <td className="text-right font-mono">
                      {c.alturaCm} × {c.comprimentoCm} × {c.larguraCm}
                    </td>
                    <td className="text-center font-mono">{c.empilhamentoMax}</td>
                    <td className="font-mono text-xs text-zinc-600">
                      {c.insumoErpCodigo ?? '—'}
                    </td>
                    <td className="text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEditarCaixa(c)}
                            className="text-xs font-bold text-zinc-700 hover:underline cursor-pointer"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removerCaixa(c)}
                            className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TabelaPainel>
          </div>

          <div className="md:hidden space-y-2">
            {caixas.map((c) => (
              <div key={c.id} className="panel-card !p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-zinc-900">CX {c.codigo}</span>
                    <span className="text-zinc-600 ml-1.5">{c.nome}</span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => abrirEditarCaixa(c)}
                        className="px-2.5 py-1.5 min-h-[38px] rounded-lg border border-zinc-200 font-semibold"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => removerCaixa(c)}
                        className="px-2.5 py-1.5 min-h-[38px] rounded-lg border border-red-200 text-red-600 font-semibold"
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
                <div className="font-mono text-[11px] text-zinc-500">
                  {c.alturaCm}×{c.comprimentoCm}×{c.larguraCm} cm · Empilh. máx.{' '}
                  {c.empilhamentoMax}
                  {c.insumoErpCodigo ? ` · ERP ${c.insumoErpCodigo}` : ''}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {sub === 'conferencia' && (
        <div className="space-y-4">
          {insumosCaixaErp.length > 0 && (
            <div className="panel-card !p-4 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
                  <Wrench className="h-4 w-4" /> Caixas nas fórmulas/kits sem vínculo ({insumosCaixaErp.length})
                </h3>
                <p className="text-xs text-zinc-500">
                  Vincule o código 9.04.xxx a uma caixa cadastrada para preencher todos os produtos e kits que usam esse insumo.
                </p>
              </div>
              <div className="space-y-2">
                {insumosCaixaErp.map((ins) => (
                  <div
                    key={ins.ingredientCode}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50/50 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-mono font-bold text-zinc-900">
                        {ins.ingredientCode}
                      </span>{' '}
                      — <span className="font-semibold text-zinc-700">{ins.description}</span>{' '}
                      <span className="text-zinc-500">
                        ({ins.qtdProdutos} itens, ex.: {ins.exemplosProdutos.slice(0, 2).join(', ')})
                      </span>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                        <select
                          value={vincularInsumoCaixaId[ins.ingredientCode] ?? ''}
                          onChange={(e) =>
                            setVincularInsumoCaixaId((m) => ({
                              ...m,
                              [ins.ingredientCode]: e.target.value,
                            }))
                          }
                          className="flex-1 sm:w-56 min-w-0 px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white text-xs"
                        >
                          <option value="">Escolher caixa...</option>
                          {caixas.map((c) => (
                            <option key={c.id} value={c.id}>
                              CX {c.codigo} — {c.nome}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void vincularInsumoNaCaixa(ins.ingredientCode)}
                          className="px-3 py-1.5 min-h-[36px] rounded-lg bg-zinc-900 text-white font-bold shrink-0 cursor-pointer"
                        >
                          Vincular
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel-card !p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-900">
                  Pendências de caixa e Qtde/Cx ({pendenciasFiltradas.length})
                </h3>
                <p className="text-xs text-zinc-500">
                  Vincule caixas ou Qtde/Cx individualmente ou selecione vários produtos para atualizar em lote.
                </p>
              </div>
              {pendenciasFiltradas.length > 80 && !mostrarTodasPend && (
                <button
                  type="button"
                  onClick={() => setMostrarTodasPend(true)}
                  className="text-xs font-bold text-zinc-800 underline cursor-pointer"
                >
                  Mostrar todos ({pendenciasFiltradas.length})
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={buscaPend}
                  onChange={(e) => setBuscaPend(e.target.value)}
                  placeholder="Filtrar por código, descrição ou 9.04..."
                  className="w-full pl-8 pr-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white text-xs"
                />
              </div>
              <FiltroSelect
                value={linhaPend}
                onChange={setLinhaPend}
                opcoes={[{ valor: 'ALL', rotulo: 'Todas as linhas' }, ...opcoesLinhasPend]}
              />
              <FiltroSelect
                value={tipoPend}
                onChange={setTipoPend}
                opcoes={[
                  { valor: 'ALL', rotulo: 'Pendência: Todas' },
                  { valor: 'sem_caixa', rotulo: 'Sem caixa' },
                  { valor: 'sem_qtde_cx', rotulo: 'Sem qtde/cx' },
                  { valor: 'sem_endereco', rotulo: 'Sem endereço' },
                  { valor: 'estoque_acima_capacidade', rotulo: 'Acima capacidade' },
                ]}
              />
              {canEdit && pendenciasFiltradas.length > 0 && (
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-zinc-50 cursor-pointer font-semibold text-zinc-700 min-h-[34px]">
                  <input
                    type="checkbox"
                    checked={todosFiltradosSelecionados}
                    onChange={toggleTodosFiltrados}
                  />
                  <span>Selecionar todos ({pendenciasFiltradas.length})</span>
                </label>
              )}
            </div>

            {canEdit && selecionados.size > 0 && (
              <div className="rounded-xl border border-zinc-300 bg-zinc-900 text-white p-3 flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-2 mr-auto">
                  <span className="font-bold">
                    {selecionados.size}{' '}
                    {selecionados.size === 1 ? 'produto selecionado' : 'produtos selecionados'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelecionados(new Set())}
                    className="text-zinc-300 hover:text-white underline cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>
                <select
                  aria-label="Caixa de embarque em lote"
                  value={loteCaixaId}
                  onChange={(e) => setLoteCaixaId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-white text-zinc-900 font-semibold text-xs min-w-[160px]"
                >
                  <option value="KEEP">Manter caixa atual</option>
                  <option value="CLEAR">Remover caixa vinculada</option>
                  {caixas.map((c) => (
                    <option key={c.id} value={c.id}>
                      CX {c.codigo} — {c.nome}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  aria-label="Qtde/Cx manual em lote"
                  value={loteQtde}
                  onChange={(e) => setLoteQtde(e.target.value)}
                  placeholder="Qtde/Cx"
                  className="w-28 px-2.5 py-1.5 rounded-lg bg-white text-zinc-900 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={aplicarEmLote}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 text-zinc-900 font-bold cursor-pointer"
                >
                  Aplicar em {selecionados.size}
                </button>
              </div>
            )}

            <div className="hidden md:block">
              <TabelaPainel>
                <thead>
                  <tr>
                    {canEdit && <th className="w-8 text-center" />}
                    <th>Produto</th>
                    <th>Pendência</th>
                    <th>Fórmula / Kit</th>
                    <th>Caixa Embarque</th>
                    <th>Qtde/Cx</th>
                    <th className="text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {pendencias.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6} className="text-center py-6 text-zinc-500">
                        Nenhuma pendência encontrada.
                      </td>
                    </tr>
                  ) : (
                    pendencias.map((p) => {
                      const marcado = selecionados.has(p.codigo);
                      return (
                        <tr key={p.codigo} className={marcado ? 'bg-zinc-50' : undefined}>
                          {canEdit && (
                            <td className="text-center">
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={() => toggleSelecionado(p.codigo)}
                              />
                            </td>
                          )}
                          <td>
                            <button
                              type="button"
                              onClick={() => onAbrirProduto(p)}
                              className="text-left cursor-pointer hover:underline"
                            >
                              <span className="font-mono font-bold text-zinc-900">{p.codigo}</span>{' '}
                              <span className="text-zinc-600">{p.descricao}</span>
                            </button>
                          </td>
                          <td>
                            <StatusBadge variante="ordem">{rotuloPendencia(p.situacaoAlocacao)}</StatusBadge>
                          </td>
                          <td className="font-mono text-xs text-zinc-500">
                            {p.insumoCaixaErp ?? '—'}
                          </td>
                          <td>
                            <select
                              disabled={!canEdit}
                              value={caixaInline[p.codigo] ?? p.caixaId ?? ''}
                              onChange={(e) =>
                                setCaixaInline((m) => ({ ...m, [p.codigo]: e.target.value }))
                              }
                              className="px-2 py-1 border border-zinc-200 rounded-lg bg-white text-xs"
                            >
                              <option value="">Sem caixa</option>
                              {caixas.map((c) => (
                                <option key={c.id} value={c.id}>
                                  CX {c.codigo}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-zinc-500">
                                ERP: {p.qtdeCxErp ?? '—'}
                              </span>
                              <input
                                type="number"
                                min={1}
                                disabled={!canEdit}
                                value={
                                  qtdeInline[p.codigo] ??
                                  (p.qtdeCxOrigem === 'manual' && p.qtdeCxEfetiva
                                    ? String(p.qtdeCxEfetiva)
                                    : '')
                                }
                                onChange={(e) =>
                                  setQtdeInline((m) => ({ ...m, [p.codigo]: e.target.value }))
                                }
                                placeholder="Manual"
                                className="w-20 px-2 py-1 border border-zinc-200 rounded-lg font-mono text-xs"
                              />
                            </div>
                          </td>
                          <td className="text-right">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => void salvarInlineProduto(p)}
                                className="px-2.5 py-1 rounded-lg bg-zinc-900 text-white text-xs font-bold cursor-pointer"
                              >
                                Salvar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </TabelaPainel>
            </div>

            <div className="md:hidden space-y-2">
              {pendencias.map((p) => {
                const marcado = selecionados.has(p.codigo);
                return (
                  <div
                    key={p.codigo}
                    className={`rounded-xl border p-3 space-y-2 text-xs ${
                      marcado ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2 cursor-pointer min-w-0">
                        {canEdit && (
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => toggleSelecionado(p.codigo)}
                            className="mt-0.5 h-4 w-4 shrink-0"
                          />
                        )}
                        <span className="font-bold text-zinc-900">
                          {p.codigo} — {p.descricao}
                        </span>
                      </label>
                      <StatusBadge variante="ordem">{rotuloPendencia(p.situacaoAlocacao)}</StatusBadge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        disabled={!canEdit}
                        value={caixaInline[p.codigo] ?? p.caixaId ?? ''}
                        onChange={(e) =>
                          setCaixaInline((m) => ({ ...m, [p.codigo]: e.target.value }))
                        }
                        className="flex-1 min-w-[120px] px-2.5 py-2 border border-zinc-200 rounded-lg bg-white"
                      >
                        <option value="">Sem caixa</option>
                        {caixas.map((c) => (
                          <option key={c.id} value={c.id}>
                            CX {c.codigo}
                          </option>
                        ))}
                      </select>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => void salvarInlineProduto(p)}
                          className="px-3 py-2 rounded-lg bg-zinc-900 text-white font-bold cursor-pointer min-h-[40px]"
                        >
                          Salvar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Drawer canônico para Criar/Editar Caixa */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="md"
        title={editCxId ? `Editar Caixa ${cxCod}` : 'Nova Caixa de Embarque'}
        subtitle="Informe código, medidas externas em cm e vínculo opcional com insumo 9.04.xxx"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-zinc-200 bg-white text-zinc-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={salvandoCx || !cxCod.trim() || !cxNome.trim()}
              onClick={() => void gravarCaixa()}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
            >
              {salvandoCx ? 'Salvando...' : editCxId ? 'Salvar Caixa' : 'Cadastrar Caixa'}
            </button>
          </div>
        }
      >
        <form onSubmit={gravarCaixa} className="p-4 sm:p-5 space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Código</span>
              <input
                required
                value={cxCod}
                onChange={(e) => setCxCod(e.target.value)}
                placeholder="Ex: 29"
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-semibold text-zinc-600 block">Nome / Descrição</span>
              <input
                required
                value={cxNome}
                onChange={(e) => setCxNome(e.target.value)}
                placeholder="Caixa 29 (20×23×15)"
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Altura (cm)</span>
              <input
                required
                type="number"
                step="0.1"
                value={cxAlt}
                onChange={(e) => setCxAlt(e.target.value)}
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Compr. (cm)</span>
              <input
                required
                type="number"
                step="0.1"
                value={cxComp}
                onChange={(e) => setCxComp(e.target.value)}
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Largura (cm)</span>
              <input
                required
                type="number"
                step="0.1"
                value={cxLarg}
                onChange={(e) => setCxLarg(e.target.value)}
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Empilh. máx.</span>
              <input
                required
                type="number"
                min={1}
                value={cxEmp}
                onChange={(e) => setCxEmp(e.target.value)}
                className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white font-mono"
              />
            </label>
          </div>

          <label className="space-y-1 block">
            <span className="font-semibold text-zinc-600 block">
              Insumo ERP (código na fórmula ou composição de kit, ex.: 9.04.063)
            </span>
            <input
              value={cxInsumo}
              onChange={(e) => setCxInsumo(e.target.value)}
              placeholder="Opcional — separa múltiplos por vírgula"
              className="w-full px-2.5 py-2 border border-zinc-200 rounded-lg bg-white font-mono"
            />
          </label>
        </form>
      </Drawer>
    </div>
  );
}
