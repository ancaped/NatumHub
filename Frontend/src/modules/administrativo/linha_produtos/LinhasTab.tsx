import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Edit, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';
import Drawer from '../../geral/components/ui/Drawer';
import type { PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';
import LinhaResumo from './LinhaResumo';
import { useAtendimentos } from './useAtendimentos';
import { ATENDIMENTOS_UI, SITUACOES_UI } from './tipos';
import type { LineConfig, PedirBulkOpts, ProductResult } from './tipos';

interface Props {
  /** Contagem de produtos por linha e lista dos produtos da linha aberta. */
  products: ProductResult[];
  configs: LineConfig[];
  /** Ação em lote em 2 passos (usada ao marcar um prefixo como terceirizado). */
  pedirBulk: (opts: PedirBulkOpts) => Promise<void>;
  pedirPrevia: (previa: PreviaAcao) => void;
  avisar: (mensagem: string, tipo?: 'sucesso' | 'erro' | 'info') => void;
  /** Recarrega os dados da tela depois de gravar. */
  onReload: () => Promise<void> | void;
}

/** Aba Definição de Linhas da Linha de Produtos: linhas por prefixo, aviso de prefixos sem linha e painel de edição. */
export default function LinhasTab({ products, configs, pedirBulk, pedirPrevia, avisar, onReload }: Props) {
  const [editingLineConfig, setEditingLineConfig] = useState<LineConfig | null>(null);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [abaLinha, setAbaLinha] = useState<'produtos' | 'resumo' | 'parametros'>('produtos');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [buscaProd, setBuscaProd] = useState('');
  const [linePrefixForm, setLinePrefixForm] = useState('');
  const [lineNameForm, setLineNameForm] = useState('');
  const [idealMultForm, setIdealMultForm] = useState('3.0');
  const [ordemMultForm, setOrdemMultForm] = useState('1.5');
  const [prodMultForm, setProdMultForm] = useState('1.0');
  const [fatorZForm, setFatorZForm] = useState('1.65');
  const [visibleLineForm, setVisibleLineForm] = useState('1');
  const [semLinhaVersao, setSemLinhaVersao] = useState(0);
  const [soAtivas, setSoAtivas] = useState(true);
  const [atendimentoForm, setAtendimentoForm] = useState('estoque');
  const atend = useAtendimentos(configs);
  const atendimentoDaLinha = (prefixo: string) => atend.linhas[prefixo]?.atendimento || 'estoque';
  const situacaoDe = (codigo: string, status: string | null) =>
    atend.produtos[codigo]?.situacao || (status === 'terceirizado' || !status ? 'ativo' : status);

  const [lineFormError, setLineFormError] = useState<string | null>(null);
  const [lineSaving, setLineSaving] = useState(false);
  const [linhaSearch, setLinhaSearch] = useState('');
  const [semLinha, setSemLinha] = useState<{ prefixo: string; produtos: number; exemploCodigo: string; exemploDescricao: string; codigos: string[] }[]>([]);

  // Prefixos com produto ativo em Outros/Geral (sem linha cadastrada); recarrega ao abrir e ao fechar o painel da linha.
  useEffect(() => {
    if (isLineModalOpen) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await apiFetch('/admin/produtos-ativos/sem-linha');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelado) setSemLinha(Array.isArray(data?.prefixos) ? data.prefixos : []);
      } catch {
        if (!cancelado) setSemLinha([]);
      }
    })();
    return () => { cancelado = true; };
  }, [isLineModalOpen, semLinhaVersao]);

  const configsFiltradas = useMemo(() => {
    const q = linhaSearch.trim().toLowerCase();
    const base = soAtivas ? configs.filter(c => c.visivel !== 0) : configs;
    const lista = q
      ? base.filter(c => c.linha_prefix.toLowerCase().includes(q) || (c.nome_linha || '').toLowerCase().includes(q))
      : base;
    // Prefixo em ordem numérica (9.15 depois de 9, antes de 10); DEFAULT por último.
    const chave = (prefixo: string) => (prefixo === 'DEFAULT' ? Infinity : parseFloat(prefixo));
    return [...lista].sort((a, b) => {
      const ka = chave(a.linha_prefix);
      const kb = chave(b.linha_prefix);
      return ka === kb ? a.linha_prefix.localeCompare(b.linha_prefix) : (Number.isNaN(ka) ? Infinity : ka) - (Number.isNaN(kb) ? Infinity : kb);
    });
  }, [configs, linhaSearch, soAtivas]);
  const inativas = useMemo(() => configs.filter(c => c.visivel === 0).length, [configs]);

  const produtosPorLinha = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of products) {
      const linha = p.linha_prefix_manual || p.linha_prefix || 'DEFAULT';
      mapa.set(linha, (mapa.get(linha) || 0) + 1);
    }
    return mapa;
  }, [products]);

  // Produtos ativos do prefixo que estão em Outros/Geral viram terceirizados (2 passos: prévia e OK).
  const marcarPrefixoTerceirizado = async (prefixo: string, codigos: string[]) => {
    await pedirBulk({
      titulo: `Marcar ${codigos.length} produto(s) do prefixo ${prefixo} como terceirizado`,
      codigos,
      action: 'set_status',
      value: 'terceirizado',
      confirmarRotulo: 'Marcar terceirizado',
      aoConcluir: async () => {
        await onReload();
        setSemLinhaVersao(v => v + 1);
      },
    });
  };

  const LIMITE_LISTA = 300;
  const produtosDaLinha = useMemo(() => {
    if (!editingLineConfig) return [] as ProductResult[];
    const q = buscaProd.trim().toLowerCase();
    return products
      .filter(p => (p.linha_prefix_manual || p.linha_prefix || 'DEFAULT') === editingLineConfig.linha_prefix)
      .filter(p => !q || p.codigo.toLowerCase().includes(q) || (p.descricao || '').toLowerCase().includes(q));
  }, [products, editingLineConfig, buscaProd]);
  const todosMarcados = produtosDaLinha.length > 0 && produtosDaLinha.every(p => marcados.has(p.codigo));
  const alternarProduto = (codigo: string) => {
    const n = new Set(marcados);
    if (n.has(codigo)) n.delete(codigo);
    else n.add(codigo);
    setMarcados(n);
  };

  // Mover produtos de linha ou mudar o status dos selecionados: prévia do servidor e só grava no OK.
  const pedirMudancaEmLote = async (action: 'set_line' | 'set_status' | 'set_atendimento', value: string) => {
    if (!value || marcados.size === 0) return;
    const rotuloLinha = value === 'AUTO' ? 'a linha do prefixo' : configs.find(c => c.linha_prefix === value)?.nome_linha || value;
    await pedirBulk({
      titulo: action === 'set_line' ? `Mover ${marcados.size} produto(s) para ${rotuloLinha}` : action === 'set_atendimento' ? `Mudar o atendimento de ${marcados.size} produto(s)` : `Mudar a situação de ${marcados.size} produto(s)`,
      codigos: Array.from(marcados),
      action,
      value,
      confirmarRotulo: action === 'set_line' ? 'Mover produtos' : 'Aplicar',
      aoConcluir: async () => {
        setMarcados(new Set());
        await onReload();
      },
    });
  };

  const STATUS_BADGE: Record<string, string> = {
    ativo: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    lancamento: 'bg-zinc-900 text-white border-zinc-900',
    saindo_de_linha: 'bg-amber-50 text-amber-700 border-amber-200',
    descontinuado: 'bg-red-50 text-red-700 border-red-200',
  };
  const STATUS_ROTULO: Record<string, string> = { ativo: 'Ativo', lancamento: 'Lançamento', saindo_de_linha: 'Saindo de linha', descontinuado: 'Inativo' };

  const handleOpenLineModal = (cfg: LineConfig | null = null) => {
    setEditingLineConfig(cfg);
    setLineFormError(null);
    setAbaLinha(cfg ? 'produtos' : 'parametros');
    setMarcados(new Set());
    setBuscaProd('');
    if (cfg) {
      setLinePrefixForm(cfg.linha_prefix);
      setLineNameForm(cfg.nome_linha);
      setIdealMultForm(cfg.estoque_ideal_mult.toString());
      setOrdemMultForm(cfg.abrir_ordem_mult.toString());
      setProdMultForm(cfg.abrir_prod_mult.toString());
      setFatorZForm(cfg.fator_seguranca_z.toString());
      setVisibleLineForm(cfg.visivel === 0 ? '0' : '1');
      setAtendimentoForm(atendimentoDaLinha(cfg.linha_prefix));
    } else {
      setLinePrefixForm('');
      setLineNameForm('');
      setIdealMultForm('3.0');
      setOrdemMultForm('1.5');
      setProdMultForm('1.0');
      setFatorZForm('1.65');
      setVisibleLineForm('1');
    }
    setIsLineModalOpen(true);
  };

  const handleSaveLineConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linePrefixForm.trim() || !lineNameForm.trim()) {
      setLineFormError("Prefixo e Nome da Linha são obrigatórios.");
      return;
    }
    setLineSaving(true);
    setLineFormError(null);
    try {
      const cfg: LineConfig = {
        linha_prefix: editingLineConfig ? editingLineConfig.linha_prefix : linePrefixForm.trim(),
        nome_linha: lineNameForm.trim(),
        estoque_ideal_mult: parseFloat(idealMultForm) || 3.0,
        abrir_ordem_mult: parseFloat(ordemMultForm) || 1.5,
        abrir_prod_mult: parseFloat(prodMultForm) || 1.0,
        fator_seguranca_z: parseFloat(fatorZForm) || 1.65,
        visivel: visibleLineForm === '0' ? 0 : 1
      };
      const res = await apiFetch(`/configs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (res.ok) {
        setIsLineModalOpen(false);
        await onReload();
        avisar('Linha salva. Use "Recalcular linhas dos produtos" para aplicar aos produtos.', 'info');
      } else {
        const errData = await res.json();
        setLineFormError(errData.error || "Erro ao salvar a configuração de linha.");
      }
    } catch (err) {
      console.error(err);
      setLineFormError("Falha de conexão ao salvar.");
    } finally {
      setLineSaving(false);
    }
  };

  // Troca o prefixo (a chave da linha): a prévia vem do servidor e só grava no OK.
  const handleTrocarPrefixo = async () => {
    if (!editingLineConfig) return;
    const atual = editingLineConfig.linha_prefix;
    const novo = linePrefixForm.trim();
    const corpo = JSON.stringify({ prefixoAtual: atual, prefixoNovo: novo });
    const chamar = (confirmar: boolean) => apiFetch(`/admin/produtos-ativos/linhas/prefixo${confirmar ? '?confirmar=true' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corpo,
    });
    try {
      const res = await chamar(false);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLineFormError(data.error || 'Não foi possível calcular a troca.');
        return;
      }
      setLineFormError(null);
      const r = data.resultado || {};
      type Item = { codigo: string; descricao: string; linhaAtual?: string; linhaNova?: string };
      const entram: Item[] = r.entram || [];
      const saem: Item[] = r.saem || [];
      const nomeLinha = (p?: string) => (p === 'DEFAULT' ? 'DEFAULT (sem linha)' : configs.find(c => c.linha_prefix === p)?.nome_linha || p || '');
      const avisos: string[] = [];
      if (r.listaTruncada) avisos.push('Listas limitadas a 100 produtos; os totais acima são completos.');
      avisos.push('Nome e parâmetros da linha continuam os mesmos. Depois de gravar, o painel fecha.');
      pedirPrevia({
        titulo: `Trocar o prefixo ${atual} por ${novo}`,
        linhas: [
          { titulo: 'Produtos que continuam na linha', detalhe: String(r.produtosContinuam ?? 0) },
          { titulo: 'Produtos que passam a pertencer à linha', detalhe: String(r.produtosEntram ?? 0) },
          ...entram.map(i => ({ titulo: `   ${i.codigo} · ${i.descricao}`, detalhe: `de ${nomeLinha(i.linhaAtual)}` })),
          { titulo: 'Produtos que deixam a linha', detalhe: String(r.produtosSaem ?? 0) },
          ...saem.map(i => ({ titulo: `   ${i.codigo} · ${i.descricao}`, detalhe: `para ${nomeLinha(i.linhaNova)}` })),
          { titulo: 'Ajustes manuais de linha atualizados', detalhe: String(r.ajustesManuaisAtualizados ?? 0) },
          { titulo: 'Regras de produção da linha atualizadas', detalhe: String(r.regrasDeProducaoAtualizadas ?? 0) },
        ],
        avisos,
        confirmarRotulo: 'Trocar prefixo',
        executar: async () => {
          const r2 = await chamar(true);
          if (!r2.ok) {
            const e = await r2.json().catch(() => ({}));
            throw new Error(e.error || 'Erro ao trocar o prefixo.');
          }
          setIsLineModalOpen(false);
          await onReload();
          avisar(`Prefixo trocado para ${novo}.`, 'sucesso');
        },
      });
    } catch (err) {
      console.error(err);
      setLineFormError('Falha de conexão ao preparar a troca.');
    }
  };

  // Atendimento padrão da linha: prévia do servidor (quantos produtos mudam de efeito) e só grava no OK.
  const handleAtendimentoLinha = async () => {
    if (!editingLineConfig) return;
    const prefixo = editingLineConfig.linha_prefix;
    const corpo = JSON.stringify({ prefixo, atendimento: atendimentoForm });
    const chamar = (confirmar: boolean) => apiFetch(`/admin/produtos-ativos/linhas/classificacao${confirmar ? '?confirmar=true' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corpo,
    });
    try {
      const res = await chamar(false);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLineFormError(data.error || 'Não foi possível calcular a mudança.');
        return;
      }
      setLineFormError(null);
      const r = data.resultado || {};
      const rotulo = (v: string) => ATENDIMENTOS_UI.find(a => a.value === v)?.label || v;
      pedirPrevia({
        titulo: `Atendimento da linha ${editingLineConfig.nome_linha}`,
        linhas: [
          { titulo: 'Atendimento padrão', detalhe: `${rotulo(r.antes?.atendimento)} → ${rotulo(r.depois?.atendimento)}` },
          { titulo: 'Produtos na linha', detalhe: String(r.produtosNaLinha ?? 0) },
          { titulo: 'Produtos que mudam de efeito', detalhe: String(r.produtosQueMudamDeEfeito ?? 0) },
          { titulo: 'Produtos com exceção própria (não mudam)', detalhe: String(r.produtosComExcecaoDeAtendimento ?? 0) },
        ],
        avisos: r.avisos || [],
        confirmarRotulo: 'Mudar atendimento',
        executar: async () => {
          const r2 = await chamar(true);
          if (!r2.ok) {
            const e = await r2.json().catch(() => ({}));
            throw new Error(e.error || 'Erro ao mudar o atendimento.');
          }
          await onReload();
          avisar('Atendimento da linha atualizado.', 'sucesso');
        },
      });
    } catch (err) {
      console.error(err);
      setLineFormError('Falha de conexão ao preparar a mudança.');
    }
  };

  const handleDeleteLineConfig = async (prefix: string) => {
    if (prefix === 'DEFAULT') {
      avisar("A linha DEFAULT não pode ser excluída.", 'erro');
      return;
    }
    try {
      const res = await apiFetch(`/configs/${prefix}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisar(data.error || "Erro ao excluir.", 'erro');
        return;
      }
      const r = data.resultado || {};
      pedirPrevia({
        titulo: `Excluir a linha "${prefix}"`,
        linhas: [
          { titulo: 'Produtos que voltam para DEFAULT', detalhe: String(r.produtosParaDefault ?? 0) },
          { titulo: 'Ajustes manuais de linha que voltam para DEFAULT', detalhe: String(r.overridesParaDefault ?? 0) },
        ],
        avisos: [`As regras da linha "${prefix}" são apagadas.`],
        confirmarRotulo: 'Excluir linha',
        pedirMotivo: true,
        executar: async (motivo) => {
          const r2 = await apiFetch(`/configs/${prefix}?confirmar=true&motivo=${encodeURIComponent(motivo ?? '')}`, { method: 'DELETE' });
          if (!r2.ok) {
            const e = await r2.json().catch(() => ({}));
            throw new Error(e.error || 'Erro ao excluir.');
          }
          await onReload();
          avisar('Linha excluída. Use "Recalcular linhas dos produtos" para reaplicar as linhas restantes.', 'info');
        },
      });
    } catch (err) {
      console.error(err);
      avisar("Falha de conexão ao excluir.", 'erro');
    }
  };

  const handleRecalcularLinhas = async () => {
    try {
      const res = await apiFetch(`/configs/recalcular-linhas`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisar(data.error || 'Erro ao calcular a prévia.', 'erro');
        return;
      }
      const r = data.resultado || {};
      const lista: { codigo: string; descricao: string; de: string; para: string }[] = r.lista || [];
      const avisos: string[] = [];
      if (r.listaTruncada) avisos.push(`Mostrando ${lista.length} de ${r.produtosQueMudam} produtos que mudam.`);
      avisos.push('Os ajustes manuais de linha dos produtos não mudam.');
      pedirPrevia({
        titulo: 'Recalcular linhas dos produtos',
        linhas: lista.map(i => ({ titulo: `${i.codigo} · ${i.descricao}`, detalhe: `${i.de} → ${i.para}` })),
        avisos: (r.produtosQueMudam ?? 0) === 0 ? ['Nenhum produto muda de linha.'] : avisos,
        confirmarRotulo: 'Recalcular',
        executar: async () => {
          const r2 = await apiFetch(`/configs/recalcular-linhas?confirmar=true`, { method: 'POST' });
          if (!r2.ok) {
            const e = await r2.json().catch(() => ({}));
            throw new Error(e.error || 'Erro ao recalcular as linhas.');
          }
          await onReload();
        },
      });
    } catch (err) {
      console.error(err);
      avisar('Falha de conexão ao preparar o recálculo.', 'erro');
    }
  };

  return (
    <>
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2 shrink-0">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar linha por prefixo ou nome..."
                    value={linhaSearch}
                    onChange={(e) => setLinhaSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm font-medium"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={soAtivas}
                    onClick={() => setSoAtivas(v => !v)}
                    title={soAtivas ? `${inativas} linha(s) inativa(s) escondida(s)` : 'Mostrando todas as linhas'}
                    className={cn('text-xs font-bold px-3 py-2 min-h-[44px] sm:min-h-0 rounded-xl border transition-all cursor-pointer', soAtivas ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50')}
                  >
                    Só ativas{inativas > 0 ? ` (${inativas} inativas)` : ''}
                  </button>
                  <button
                    onClick={handleRecalcularLinhas}
                    className="bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 border border-zinc-200 transition-all cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Recalcular linhas dos produtos
                  </button>
                  <button
                    onClick={() => handleOpenLineModal(null)}
                    className="bg-zinc-900 hover:bg-zinc-850 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    Nova Linha
                  </button>
                </div>
              </div>

              {semLinha.length > 0 && (
                <div className="table-card !rounded-2xl !mb-0 overflow-hidden">
                  <div className="px-6 py-3 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-700">
                      Sem linha cadastrada ({semLinha.length} {semLinha.length === 1 ? 'prefixo' : 'prefixos'})
                    </span>
                    <span className="text-[11px] text-zinc-500">Produtos ativos que estão em Outros/Geral</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <tbody className="divide-y divide-zinc-100">
                      {semLinha.map(g => (
                        <tr key={g.prefixo} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-2.5 w-28 font-mono font-bold text-zinc-500">{g.prefixo}</td>
                          <td className="px-6 py-2.5 text-zinc-700">
                            <span className="font-mono text-zinc-400 mr-2">{g.exemploCodigo}</span>{g.exemploDescricao}
                          </td>
                          <td className="px-6 py-2.5 text-right text-zinc-600 whitespace-nowrap">{g.produtos} {g.produtos === 1 ? 'produto' : 'produtos'}</td>
                          <td className="px-6 py-2.5 text-right">
                            <button
                              onClick={() => void marcarPrefixoTerceirizado(g.prefixo, g.codigos)}
                              className="mr-2 px-2.5 py-1 bg-white hover:bg-zinc-50 rounded-lg font-bold text-zinc-700 transition-colors cursor-pointer border border-zinc-200"
                            >
                              Marcar terceirizado
                            </button>
                            <button
                              onClick={() => { handleOpenLineModal(null); setLinePrefixForm(g.prefixo); }}
                              className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-lg font-bold text-zinc-700 transition-colors cursor-pointer border border-zinc-200"
                            >
                              Cadastrar linha
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* Config Table Card */}
              <div className="table-card !rounded-2xl !mb-0 overflow-hidden flex flex-col">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-155 font-bold text-zinc-500">
                    <tr>
                      <th className="px-6 py-3 w-28 text-[10px] uppercase tracking-wider">Prefixo</th>
                      <th className="px-6 py-3 text-[10px] uppercase tracking-wider">Linha</th>
                      <th className="px-6 py-3 text-right text-[10px] uppercase tracking-wider">Produtos</th>
                      <th className="px-6 py-3 text-right text-[10px] uppercase tracking-wider">Estoque ideal</th>
                      <th className="px-6 py-3 text-right text-[10px] uppercase tracking-wider">Abrir ordem</th>
                      <th className="px-6 py-3 text-right text-[10px] uppercase tracking-wider">Abrir produção</th>
                      <th className="px-6 py-3 text-right text-[10px] uppercase tracking-wider">Fator Z</th>
                      <th className="px-6 py-3 text-center text-[10px] uppercase tracking-wider">Situação</th>
                      <th className="px-6 py-3 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {configsFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-zinc-400">Nenhuma configuração de linha encontrada.</td>
                      </tr>
                    ) : (
                      configsFiltradas.map(cfg => (
                        <tr
                          key={cfg.linha_prefix}
                          onClick={() => handleOpenLineModal(cfg)}
                          className="hover:bg-zinc-50/70 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-2.5 font-mono font-bold text-zinc-500">{cfg.linha_prefix}</td>
                          <td className="px-6 py-2.5 font-bold text-zinc-800">
                            {cfg.nome_linha}
                            {atendimentoDaLinha(cfg.linha_prefix) !== 'estoque' && (
                              <span className="ml-2 align-middle inline-flex items-center px-2 py-0.5 border border-zinc-300 bg-white text-zinc-600 text-[10px] font-bold rounded-full whitespace-nowrap">
                                {atendimentoDaLinha(cfg.linha_prefix) === 'terceirizado' ? 'Terceirizada' : 'Por encomenda'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-2.5 text-right tabular-nums text-zinc-700">{produtosPorLinha.get(cfg.linha_prefix) || 0}</td>
                          <td className="px-6 py-2.5 text-right tabular-nums text-zinc-700">{cfg.estoque_ideal_mult.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} meses</td>
                          <td className="px-6 py-2.5 text-right tabular-nums text-zinc-600">{cfg.abrir_ordem_mult.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}x</td>
                          <td className="px-6 py-2.5 text-right tabular-nums text-zinc-600">{cfg.abrir_prod_mult.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}x</td>
                          <td className="px-6 py-2.5 text-right tabular-nums text-zinc-600">{cfg.fator_seguranca_z.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-6 py-2.5 text-center">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-600">
                              <span className={cn("h-1.5 w-1.5 rounded-full", cfg.visivel === 0 ? "bg-zinc-300" : "bg-zinc-900")} />
                              {cfg.visivel === 0 ? "Inativa" : "Ativa"}
                            </span>
                          </td>
                          <td className="px-6 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleOpenLineModal(cfg)}
                              className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 rounded-lg transition-colors cursor-pointer"
                              title="Editar linha"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {cfg.linha_prefix !== 'DEFAULT' && (
                              <button
                                onClick={() => handleDeleteLineConfig(cfg.linha_prefix)}
                                className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Excluir linha"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

      {/* Edit Line Config */}
      {isLineModalOpen && (
        <Drawer
          onClose={() => setIsLineModalOpen(false)}
          size="xl"
          badge="Linha de produto"
          title={editingLineConfig ? editingLineConfig.nome_linha : 'Nova linha'}
          subtitle={editingLineConfig ? `Prefixo ${editingLineConfig.linha_prefix}` : undefined}
          tabs={editingLineConfig ? [
            { id: 'produtos', label: 'Produtos', badge: produtosDaLinha.length },
            { id: 'resumo', label: 'Resumo' },
            { id: 'parametros', label: 'Parâmetros' },
          ] : undefined}
          activeTab={abaLinha}
          onTabChange={(id) => setAbaLinha(id as 'produtos' | 'resumo' | 'parametros')}
          footer={
            abaLinha !== 'parametros' ? (
              <button
                type="button"
                onClick={() => setIsLineModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Fechar
              </button>
            ) : (
            <>
              <button
                type="button"
                onClick={() => setIsLineModalOpen(false)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="form-config-linha"
                disabled={lineSaving}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {lineSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Salvar Config
                  </>
                )}
              </button>
            </>
            )
          }
        >
          {abaLinha === 'produtos' && editingLineConfig && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar produto nesta linha"
                    value={buscaProd}
                    onChange={(e) => setBuscaProd(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-sm"
                  />
                </div>
                <span className="text-xs text-zinc-500">
                  {produtosDaLinha.length > LIMITE_LISTA ? `Mostrando ${LIMITE_LISTA} de ${produtosDaLinha.length} produtos; use a busca para achar os demais` : `${produtosDaLinha.length} produtos`}
                </span>
              </div>

              {marcados.size > 0 && (
                <div className="bg-zinc-900 text-white rounded-2xl px-4 py-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold bg-zinc-800 rounded px-2 py-0.5">{marcados.size}</span>
                  <span className="text-xs text-zinc-300 flex-1 min-w-[80px]">selecionados</span>
                  <select
                    aria-label="Mover para linha"
                    value=""
                    onChange={(e) => void pedirMudancaEmLote('set_line', e.target.value)}
                    className="h-8 rounded-xl border border-zinc-700 bg-zinc-800 text-white text-xs font-bold px-2 max-w-[220px] cursor-pointer"
                  >
                    <option value="">Mover para linha…</option>
                    <option value="AUTO">Automática (pelo prefixo)</option>
                    {configs.filter(c => c.linha_prefix !== editingLineConfig.linha_prefix).map(c => (
                      <option key={c.linha_prefix} value={c.linha_prefix}>{c.nome_linha}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Mudar status"
                    value=""
                    onChange={(e) => void pedirMudancaEmLote('set_status', e.target.value)}
                    className="h-8 rounded-xl border border-zinc-700 bg-zinc-800 text-white text-xs font-bold px-2 cursor-pointer"
                  >
                    <option value="">Mudar situação…</option>
                    {SITUACOES_UI.map(sit => <option key={sit.value} value={sit.value}>{sit.label}</option>)}
                  </select>
                  <select
                    aria-label="Mudar atendimento"
                    value=""
                    onChange={(e) => void pedirMudancaEmLote('set_atendimento', e.target.value)}
                    className="h-8 rounded-xl border border-zinc-700 bg-zinc-800 text-white text-xs font-bold px-2 cursor-pointer"
                  >
                    <option value="">Mudar atendimento…</option>
                    <option value="AUTO">Herdar da linha</option>
                    {ATENDIMENTOS_UI.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  <button type="button" onClick={() => setMarcados(new Set())} className="text-xs text-zinc-400 hover:text-white px-2 cursor-pointer">Limpar</button>
                </div>
              )}

              <div className="border border-zinc-200 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-[36px_minmax(0,1fr)_130px] gap-3 items-center px-4 py-2 bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <span className="flex justify-center">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos da linha"
                      checked={todosMarcados}
                      onChange={() => setMarcados(todosMarcados ? new Set() : new Set(produtosDaLinha.slice(0, LIMITE_LISTA).map(p => p.codigo)))}
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                    />
                  </span>
                  <span>Produto</span>
                  <span>Status</span>
                </div>
                {produtosDaLinha.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-400">Nenhum produto nesta linha.</div>
                ) : (
                  produtosDaLinha.slice(0, LIMITE_LISTA).map(p => {
                    const st = situacaoDe(p.codigo, p.status_produto);
                    const atdEf = atend.produtos[p.codigo]?.atendimentoEfetivo || (p.status_produto === 'terceirizado' ? 'terceirizado' : 'estoque');
                    return (
                      <div key={p.codigo} className="grid grid-cols-[36px_minmax(0,1fr)_130px] gap-3 items-center px-4 py-2.5 border-b border-zinc-100 last:border-0 hover:bg-zinc-50/70">
                        <span className="flex justify-center">
                          <input type="checkbox" aria-label="Selecionar produto" checked={marcados.has(p.codigo)} onChange={() => alternarProduto(p.codigo)} className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-bold text-zinc-800 truncate">{p.descricao}</span>
                          <span className="block font-mono text-[11px] text-zinc-500 mt-0.5">{p.codigo}{p.linha_prefix_manual ? ' · linha manual' : ''}</span>
                        </span>
                        <span>
                          <span className={cn('px-2.5 py-1 border text-[11px] font-bold rounded-full whitespace-nowrap', STATUS_BADGE[st] || STATUS_BADGE.ativo)}>{STATUS_ROTULO[st] || st}</span>
                          {atdEf !== 'estoque' && st !== 'descontinuado' && (
                            <span className="ml-1 px-2 py-1 border border-zinc-300 bg-white text-zinc-600 text-[11px] font-bold rounded-full whitespace-nowrap">{ATENDIMENTOS_UI.find(a => a.value === atdEf)?.selo || atdEf}</span>
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {abaLinha === 'resumo' && editingLineConfig && <LinhaResumo prefixo={editingLineConfig.linha_prefix} />}

          {abaLinha === 'parametros' && (
          <form id="form-config-linha" onSubmit={handleSaveLineConfig} className="space-y-4 text-left">
            {lineFormError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-xl text-xs flex gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{lineFormError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 block">Prefixo de Linha</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: 9.15"
                    value={linePrefixForm}
                    onChange={(e) => setLinePrefixForm(e.target.value)}
                    disabled={editingLineConfig?.linha_prefix === 'DEFAULT'}
                    className="min-w-0 flex-1 px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium disabled:bg-zinc-100 disabled:text-zinc-400"
                  />
                  {editingLineConfig && editingLineConfig.linha_prefix !== 'DEFAULT' && linePrefixForm.trim() !== editingLineConfig.linha_prefix && (
                    <button
                      type="button"
                      onClick={() => void handleTrocarPrefixo()}
                      className="px-3 min-h-[44px] sm:min-h-0 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl font-bold text-xs cursor-pointer whitespace-nowrap"
                    >
                      Ver troca
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 block">Nome da Linha</label>
                <input
                  type="text"
                  placeholder="Ex: Capilar Professional"
                  value={lineNameForm}
                  onChange={(e) => setLineNameForm(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                />
              </div>
            </div>

            <div className="border-t border-zinc-150 pt-3 mt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-3">Multiplicadores & Segurança</span>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-650 block" title="Calcula o estoque ideal em meses de venda média">Estoque Ideal (Meses)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ex: 3.0"
                    value={idealMultForm}
                    onChange={(e) => setIdealMultForm(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-650 block" title="Segurança estatística Z para cálculo de estoque mínimo">Fator de Segurança Z</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ex: 1.65"
                    value={fatorZForm}
                    onChange={(e) => setFatorZForm(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-650 block" title="Multiplicador do ponto de ressuprimento/abrir ordem">Mult. Abrir Ordem</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ex: 1.5"
                    value={ordemMultForm}
                    onChange={(e) => setOrdemMultForm(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-650 block" title="Multiplicador da quantidade ideal a produzir/lote recomendado">Mult. Lote Produção</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ex: 1.0"
                    value={prodMultForm}
                    onChange={(e) => setProdMultForm(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5 mt-3">
                <label className="text-[11px] font-bold text-zinc-650 block">Situação da linha</label>
                <select
                  value={visibleLineForm}
                  onChange={(e) => setVisibleLineForm(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                >
                  <option value="1">Ativa</option>
                  <option value="0">Inativa: esconde a linha e os produtos dela em todos os módulos</option>
                </select>
              </div>

              {editingLineConfig && (
                <div className="space-y-1.5 mt-3">
                  <label className="text-[11px] font-bold text-zinc-650 block">Atendimento padrão dos produtos</label>
                  <div className="flex gap-2">
                    <select
                      value={atendimentoForm}
                      onChange={(e) => setAtendimentoForm(e.target.value)}
                      className="min-w-0 flex-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                    >
                      {ATENDIMENTOS_UI.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                    {atendimentoForm !== atendimentoDaLinha(editingLineConfig.linha_prefix) && (
                      <button
                        type="button"
                        onClick={() => void handleAtendimentoLinha()}
                        className="px-3 min-h-[44px] sm:min-h-0 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl font-bold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Ver mudança
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 font-semibold block leading-tight">
                    {ATENDIMENTOS_UI.find(a => a.value === atendimentoForm)?.description} Cada produto pode ter exceção própria.
                  </span>
                </div>
              )}
            </div>
          </form>
          )}
        </Drawer>
      )}
    </>
  );
}
