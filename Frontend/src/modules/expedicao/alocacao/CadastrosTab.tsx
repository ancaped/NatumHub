import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Building2,
  CheckCircle2,
  Plus,
  Search,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { StatusBadge, TabelaPainel, FiltroSelect } from '../../geral/components/ui/ReportKit';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import type { PedidoPrevia } from '../../producao/lib/usePreviaServidor';
import {
  agruparLinhas,
  prefixosDaLinha,
  rotuloLinha,
  type LinhaBase,
} from '../../geral/lib/linhas';
import {
  fetchClientesSugestao,
  salvarAtacadista,
  salvarCaixa,
  salvarEstrutura,
  salvarVinculoProdutoCaixa,
} from './api';
import type {
  Atacadista,
  Caixa,
  ClienteSugestao,
  Estrutura,
  InsumoCaixaErpNaoVinculado,
  PosicaoComItens,
  ProdutoDimensao,
} from './types';

type SubSecao = 'conferencia' | 'caixas' | 'atacadistas' | 'estruturas';

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

interface CadastrosTabProps {
  subSecaoInicial?: SubSecao;
  estruturaAtivaId: string;
  estruturas: Estrutura[];
  posicoes: PosicaoComItens[];
  caixas: Caixa[];
  atacadistas: Atacadista[];
  produtos: ProdutoDimensao[];
  linhasConfigs?: LinhaBase[];
  insumosCaixaErp: InsumoCaixaErpNaoVinculado[];
  janelaMeses: number;
  canEdit: boolean;
  onSaved: () => Promise<void>;
  onAbrirProduto: (p: ProdutoDimensao) => void;
  avisar: (msg: string, tipo?: TipoAviso) => void;
  pedirPrevia: (p: PedidoPrevia) => Promise<void>;
}

export function CadastrosTab({
  subSecaoInicial = 'conferencia',
  estruturaAtivaId,
  estruturas,
  posicoes,
  caixas,
  atacadistas,
  produtos,
  linhasConfigs = [],
  insumosCaixaErp,
  janelaMeses,
  canEdit,
  onSaved,
  onAbrirProduto,
  avisar,
  pedirPrevia,
}: CadastrosTabProps) {
  const [sub, setSub] = useState<SubSecao>(subSecaoInicial);

  useEffect(() => {
    setSub(subSecaoInicial);
  }, [subSecaoInicial]);

  // --- Conferência ERP + Lote ---
  const [buscaPend, setBuscaPend] = useState('');
  const [linhaPend, setLinhaPend] = useState('ALL');
  const [tipoPend, setTipoPend] = useState('ALL');
  const [mostrarTodasPend, setMostrarTodasPend] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [loteCaixaId, setLoteCaixaId] = useState('KEEP');
  const [loteQtde, setLoteQtde] = useState('');

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

  const [caixaInline, setCaixaInline] = useState<Record<string, string>>({});
  const [qtdeInline, setQtdeInline] = useState<Record<string, string>>({});
  const [vincularInsumoCaixaId, setVincularInsumoCaixaId] = useState<Record<string, string>>({});

  // --- Caixas CRUD ---
  const [editCxId, setEditCxId] = useState<string | null>(null);
  const [cxCod, setCxCod] = useState('');
  const [cxNome, setCxNome] = useState('');
  const [cxAlt, setCxAlt] = useState('22.5');
  const [cxComp, setCxComp] = useState('19.5');
  const [cxLarg, setCxLarg] = useState('14.7');
  const [cxEmp, setCxEmp] = useState('4');
  const [cxInsumo, setCxInsumo] = useState('');
  const [salvandoCx, setSalvandoCx] = useState(false);

  // --- Atacadistas CRUD ---
  const [atNome, setAtNome] = useState('');
  const [atTermo, setAtTermo] = useState('');
  const [atCod, setAtCod] = useState('');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clientesErp, setClientesErp] = useState<ClienteSugestao[]>([]);
  const [carregandoClientes, setCarregandoClientes] = useState(false);

  // --- Estruturas & Grade ---
  const estAtiva = estruturas.find((e) => e.id === estruturaAtivaId) ?? estruturas[0] ?? null;
  const [novaEstNome, setNovaEstNome] = useState('');
  const [novaEstLarg, setNovaEstLarg] = useState('100');
  const [novaEstComp, setNovaEstComp] = useState('120');

  const [gradeColunas, setGradeColunas] = useState('A,B,C,D,E,F,G');
  const [gradeLarg, setGradeLarg] = useState('100');
  const [gradeComp, setGradeComp] = useState('120');
  const [gradeSubstituir, setGradeSubstituir] = useState(false);
  const [gradeAndares, setGradeAndares] = useState<
    Array<{ andar: number; alturaCm: number; papel: 'picking' | 'pulmao'; lados: number }>
  >([
    { andar: 1, alturaCm: 74.1, papel: 'picking', lados: 2 },
    { andar: 2, alturaCm: 74, papel: 'picking', lados: 2 },
    { andar: 3, alturaCm: 74, papel: 'pulmao', lados: 2 },
    { andar: 4, alturaCm: 100, papel: 'pulmao', lados: 2 },
    { andar: 5, alturaCm: 74, papel: 'pulmao', lados: 2 },
    { andar: 6, alturaCm: 74, papel: 'pulmao', lados: 2 },
  ]);

  useEffect(() => {
    if (!estAtiva) return;
    setGradeLarg(String(estAtiva.estradoLarguraCm));
    setGradeComp(String(estAtiva.estradoComprimentoCm));
    if (posicoes.length > 0) {
      const cols = Array.from(
        new Map(posicoes.map((p) => [p.coluna, p.colunaOrdem])).entries(),
      )
        .sort((a, b) => a[1] - b[1])
        .map((e) => e[0]);
      if (cols.length > 0) setGradeColunas(cols.join(','));

      const porAndar = new Map<number, PosicaoComItens[]>();
      for (const p of posicoes) {
        if (!p.ativo) continue;
        porAndar.set(p.andar, [...(porAndar.get(p.andar) ?? []), p]);
      }
      if (porAndar.size > 0) {
        const lista = Array.from(porAndar.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([andar, ps]) => ({
            andar,
            alturaCm: ps[0].alturaCm,
            papel: (ps[0].papel === 'pulmao' ? 'pulmao' : 'picking') as 'picking' | 'pulmao',
            lados: Math.max(1, Math.min(2, new Set(ps.map((x) => x.lado)).size)),
          }));
        setGradeAndares(lista);
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

  const preencherCaixaForm = (c: Caixa) => {
    setEditCxId(c.id);
    setCxCod(c.codigo);
    setCxNome(c.nome);
    setCxAlt(String(c.alturaCm));
    setCxComp(String(c.comprimentoCm));
    setCxLarg(String(c.larguraCm));
    setCxEmp(String(c.empilhamentoMax));
    setCxInsumo(c.insumoErpCodigo ?? '');
  };

  const limparCaixaForm = () => {
    setEditCxId(null);
    setCxCod('');
    setCxNome('');
    setCxAlt('22.5');
    setCxComp('19.5');
    setCxLarg('14.7');
    setCxEmp('4');
    setCxInsumo('');
  };

  const gravarCaixa = async (e: React.FormEvent) => {
    e.preventDefault();
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
      limparCaixaForm();
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
      linhas: () => [{ titulo: `Caixa ${c.codigo} — ${c.nome}`, detalhe: `${c.alturaCm}×${c.comprimentoCm}×${c.larguraCm} cm` }],
      erroPadrao: 'Não foi possível excluir a caixa.',
      aoConcluir: async () => {
        avisar(`Caixa ${c.codigo} excluída.`, 'sucesso');
        await onSaved();
      },
    });
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

  const criarNovaEstrutura = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await salvarEstrutura(
        null,
        {
          nome: novaEstNome.trim(),
          descricao: null,
          estradoLarguraCm: Number(novaEstLarg) || 100,
          estradoComprimentoCm: Number(novaEstComp) || 120,
          ordem: estruturas.length + 1,
          ativo: true,
        },
        true,
      );
      avisar(`Estrutura '${novaEstNome}' criada.`, 'sucesso');
      setNovaEstNome('');
      await onSaved();
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'Erro ao criar estrutura.', 'erro');
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
      andares: gradeAndares,
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
        { titulo: 'Posições atualizadas', detalhe: String(d?.resultado?.atualizadas ?? d?.atualizadas ?? 0) },
        { titulo: 'Posições desativadas', detalhe: String(d?.resultado?.desativadas ?? d?.desativadas ?? 0) },
      ],
      erroPadrao: 'Erro ao gerar grade.',
      aoConcluir: async () => {
        avisar('Grade da estrutura atualizada.', 'sucesso');
        await onSaved();
      },
    });
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

  const aplicarPresetEstrutura = (tipo: 'estante' | 'patio') => {
    if (tipo === 'patio') {
      setGradeColunas('P1,P2,P3,P4');
      setGradeLarg('100');
      setGradeComp('120');
      setGradeAndares([{ andar: 1, alturaCm: 180, papel: 'picking', lados: 1 }]);
    } else {
      setGradeColunas('A,B,C,D,E,F,G');
      setGradeLarg('100');
      setGradeComp('120');
      setGradeAndares([
        { andar: 1, alturaCm: 74.1, papel: 'picking', lados: 2 },
        { andar: 2, alturaCm: 74, papel: 'picking', lados: 2 },
        { andar: 3, alturaCm: 74, papel: 'pulmao', lados: 2 },
        { andar: 4, alturaCm: 100, papel: 'pulmao', lados: 2 },
        { andar: 5, alturaCm: 74, papel: 'pulmao', lados: 2 },
        { andar: 6, alturaCm: 74, papel: 'pulmao', lados: 2 },
      ]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          {
            id: 'conferencia',
            label: `Conferência ERP (${todasPendencias.length})`,
            icon: CheckCircle2,
          },
          { id: 'caixas', label: `Caixas (${caixas.length})`, icon: Box },
          { id: 'atacadistas', label: `Atacadistas (${atacadistas.length})`, icon: Users },
          { id: 'estruturas', label: `Estantes & Prateleiras (${estruturas.length})`, icon: Building2 },
        ].map((item) => {
          const Icon = item.icon;
          const ativo = sub === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSub(item.id as SubSecao)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer min-h-[40px] ${
                ativo
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* 1) Conferência ERP */}
      {sub === 'conferencia' && (
        <div className="space-y-4">
          {insumosCaixaErp.length > 0 && (
            <div className="panel-card !p-4 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
                  <Wrench className="h-4 w-4" /> Caixas encontradas nas fórmulas do ERP sem vínculo ({insumosCaixaErp.length})
                </h3>
                <p className="text-xs text-zinc-500">
                  Vincule o código de insumo do ERP (ex.: 9.04.xxx) a uma caixa cadastrada para preencher automaticamente todos os produtos da fórmula.
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
                        ({ins.qtdProdutos} produtos, ex.: {ins.exemplosProdutos.slice(0, 2).join(', ')})
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
                          onClick={() => vincularInsumoNaCaixa(ins.ingredientCode)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white font-bold shrink-0 cursor-pointer"
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
                  Conferência de produtos com pendência ({pendenciasFiltradas.length})
                </h3>
                <p className="text-xs text-zinc-500">
                  Filtre por linha ou tipo de pendência e vincule caixas ou Qtde/Cx individualmente ou em lote.
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

            {/* Filtros da Conferência ERP */}
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
                  <span>Selecionar todos filtrados ({pendenciasFiltradas.length})</span>
                </label>
              )}
            </div>

            {/* Barra de edição em lote */}
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
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-extrabold cursor-pointer"
                >
                  Aplicar em {selecionados.size} produtos
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
                    <th>Fórmula ERP</th>
                    <th>Caixa Embarque</th>
                    <th>Qtde/Cx (ERP / Manual)</th>
                    <th className="text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {pendencias.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6} className="text-center py-6 text-zinc-500">
                        Nenhuma pendência encontrada com os filtros atuais.
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
                                aria-label={`Selecionar ${p.codigo}`}
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
                                onClick={() => salvarInlineProduto(p)}
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
                          onClick={() => salvarInlineProduto(p)}
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

      {/* 2) Caixas de Embarque */}
      {sub === 'caixas' && (
        <div className="space-y-4">
          {canEdit && (
            <form onSubmit={gravarCaixa} className="panel-card !p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900">
                  {editCxId ? `Editando Caixa ${cxCod}` : 'Nova Caixa de Embarque'}
                </h3>
                {editCxId && (
                  <button
                    type="button"
                    onClick={limparCaixaForm}
                    className="text-zinc-500 underline cursor-pointer"
                  >
                    Cancelar edição
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">Código</span>
                  <input
                    required
                    value={cxCod}
                    onChange={(e) => setCxCod(e.target.value)}
                    placeholder="Ex: 29"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white"
                  />
                </label>
                <label className="space-y-1 col-span-2">
                  <span className="font-semibold text-zinc-600 block">Nome / Descrição</span>
                  <input
                    required
                    value={cxNome}
                    onChange={(e) => setCxNome(e.target.value)}
                    placeholder="Caixa 29 (20×23×15)"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">Alt. (cm)</span>
                  <input
                    required
                    type="number"
                    step="0.1"
                    value={cxAlt}
                    onChange={(e) => setCxAlt(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">Comp. (cm)</span>
                  <input
                    required
                    type="number"
                    step="0.1"
                    value={cxComp}
                    onChange={(e) => setCxComp(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">Larg. (cm)</span>
                  <input
                    required
                    type="number"
                    step="0.1"
                    value={cxLarg}
                    onChange={(e) => setCxLarg(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
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
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[200px] space-y-1">
                  <span className="font-semibold text-zinc-600 block">
                    Insumo ERP (código na fórmula, ex.: 9.04.063)
                  </span>
                  <input
                    value={cxInsumo}
                    onChange={(e) => setCxInsumo(e.target.value)}
                    placeholder="Opcional — separa múltiplos por vírgula"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
                <button
                  type="submit"
                  disabled={salvandoCx}
                  className="px-4 py-2 rounded-xl bg-zinc-900 text-white font-bold cursor-pointer"
                >
                  {salvandoCx ? 'Salvando...' : editCxId ? 'Salvar Caixa' : 'Cadastrar Caixa'}
                </button>
              </div>
            </form>
          )}

          <TabelaPainel>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th className="text-right">A × C × L (cm)</th>
                <th className="text-center">Empilh. máx.</th>
                <th>Insumo ERP</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {caixas.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono font-bold text-zinc-900">{c.codigo}</td>
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
                          onClick={() => preencherCaixaForm(c)}
                          className="text-xs font-bold text-zinc-700 hover:underline cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => removerCaixa(c)}
                          className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
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
      )}

      {/* 3) Clientes Atacadistas */}
      {sub === 'atacadistas' && (
        <div className="space-y-4">
          <div className="panel-card !p-4 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-zinc-900">
              Clientes Atacadistas ({atacadistas.length})
            </h3>
            <p className="text-zinc-500">
              Pedidos desses clientes alimentam o dimensionamento de <strong>Pulmão</strong>; todo o restante entra como <strong>Varejo (Picking)</strong>. A busca de termo respeita palavra inteira (ex.: DAC não confunde com SOCIEDADE).
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
                      variante={a.pedidosEncontrados > 0 ? 'saudavel' : 'apoio'}
                    >
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
                    gravarAtacadista(
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
                  onClick={buscarClientesErp}
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
                        onClick={() => gravarAtacadista(c.nome, c.nome, c.codigo)}
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

      {/* 4) Estruturas & Prateleiras */}
      {sub === 'estruturas' && (
        <div className="space-y-4 text-xs">
          {canEdit && (
            <form onSubmit={criarNovaEstrutura} className="panel-card !p-4 space-y-2.5">
              <h3 className="text-sm font-bold text-zinc-900">
                Adicionar nova estante / área de pátio
              </h3>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[200px] space-y-1">
                  <span className="font-semibold text-zinc-600 block">Nome da estrutura</span>
                  <input
                    required
                    value={novaEstNome}
                    onChange={(e) => setNovaEstNome(e.target.value)}
                    placeholder="Ex: Pátio Leste ou Estante B"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white"
                  />
                </label>
                <label className="w-28 space-y-1">
                  <span className="font-semibold text-zinc-600 block">Estrado Larg. (cm)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={novaEstLarg}
                    onChange={(e) => setNovaEstLarg(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
                <label className="w-28 space-y-1">
                  <span className="font-semibold text-zinc-600 block">Estrado Comp. (cm)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={novaEstComp}
                    onChange={(e) => setNovaEstComp(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-zinc-900 text-white font-bold cursor-pointer"
                >
                  Criar Estrutura
                </button>
              </div>
            </form>
          )}

          {estAtiva && canEdit && (
            <div className="panel-card !p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">
                    Configurar Grade e Prateleiras: {estAtiva.nome}
                  </h3>
                  <p className="text-zinc-500">
                    Escolha um modelo pronto (Porta-paletes ou Pátio no chão) ou personalize colunas, prateleiras e vãos.
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
                <label className="space-y-1 sm:col-span-1">
                  <span className="font-semibold text-zinc-600 block">
                    Colunas / Módulos (separados por vírgula)
                  </span>
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
                  <span className="font-semibold text-zinc-600 block">Comprimento posição (cm)</span>
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
                    Prateleiras / Níveis ({gradeAndares.length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setGradeAndares((prev) => [
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

                {gradeAndares.map((a, idx) => (
                  <div
                    key={a.andar}
                    className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-zinc-200 bg-zinc-50/50"
                  >
                    <span className="font-mono font-bold w-28 text-zinc-900">
                      {gradeAndares.length === 1 ? 'Pátio (nível único)' : `Prateleira ${a.andar}`}
                    </span>
                    <label className="flex items-center gap-1">
                      <span className="text-zinc-500">Vão (cm):</span>
                      <input
                        type="number"
                        step="0.1"
                        value={a.alturaCm}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 74;
                          setGradeAndares((prev) =>
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
                        setGradeAndares((prev) =>
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
                        setGradeAndares((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, lados } : x)),
                        );
                      }}
                      className="px-2 py-1 border border-zinc-200 rounded-lg bg-white"
                    >
                      <option value={2}>2 posições/col (ímpar/par)</option>
                      <option value={1}>1 posição/col</option>
                    </select>
                    {gradeAndares.length > 1 && idx === gradeAndares.length - 1 && (
                      <button
                        type="button"
                        onClick={() => setGradeAndares((prev) => prev.slice(0, -1))}
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
                className="px-4 py-2 rounded-xl bg-zinc-900 text-white font-bold cursor-pointer"
              >
                Pré-visualizar e Aplicar Grade
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
