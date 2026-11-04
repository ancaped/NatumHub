import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Edit, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';
import Drawer from '../../geral/components/ui/Drawer';
import type { PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';
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
  const [abaLinha, setAbaLinha] = useState<'produtos' | 'parametros'>('produtos');
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
    const lista = q
      ? configs.filter(c => c.linha_prefix.toLowerCase().includes(q) || (c.nome_linha || '').toLowerCase().includes(q))
      : configs;
    // Prefixo em ordem numérica (9.15 depois de 9, antes de 10); DEFAULT por último.
    const chave = (prefixo: string) => (prefixo === 'DEFAULT' ? Infinity : parseFloat(prefixo));
    return [...lista].sort((a, b) => {
      const ka = chave(a.linha_prefix);
      const kb = chave(b.linha_prefix);
      return ka === kb ? a.linha_prefix.localeCompare(b.linha_prefix) : (Number.isNaN(ka) ? Infinity : ka) - (Number.isNaN(kb) ? Infinity : kb);
    });
  }, [configs, linhaSearch]);

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
  const pedirMudancaEmLote = async (action: 'set_line' | 'set_status', value: string) => {
    if (!value || marcados.size === 0) return;
    const rotuloLinha = value === 'AUTO' ? 'a linha do prefixo' : configs.find(c => c.linha_prefix === value)?.nome_linha || value;
    await pedirBulk({
      titulo: action === 'set_line' ? `Mover ${marcados.size} produto(s) para ${rotuloLinha}` : `Mudar o status de ${marcados.size} produto(s)`,
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
    terceirizado: 'bg-white text-zinc-600 border-zinc-300',
  };
  const STATUS_ROTULO: Record<string, string> = { ativo: 'Ativa', lancamento: 'Lançamento', saindo_de_linha: 'Saindo de Linha', descontinuado: 'Saiu de Linha', terceirizado: 'Terceirizado' };

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
        linha_prefix: linePrefixForm.trim(),
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
              <div className="flex justify-between items-center shrink-0">
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
                <div className="flex items-center gap-2">
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
                      <th className="px-6 py-3 text-center text-[10px] uppercase tracking-wider">Painel</th>
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
                          <td className="px-6 py-2.5 font-bold text-zinc-800">{cfg.nome_linha}</td>
                          <td className="px-6 py-2.5 text-right tabular-nums text-zinc-700">{produtosPorLinha.get(cfg.linha_prefix) || 0}</td>
                          <td className="px-6 py-2.5 text-right tabular-nums text-zinc-700">{cfg.estoque_ideal_mult.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} meses</td>
                          <td className="px-6 py-2.5 text-right tabular-nums text-zinc-600">{cfg.abrir_ordem_mult.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}x</td>
                          <td className="px-6 py-2.5 text-right tabular-nums text-zinc-600">{cfg.abrir_prod_mult.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}x</td>
                          <td className="px-6 py-2.5 text-right tabular-nums text-zinc-600">{cfg.fator_seguranca_z.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-6 py-2.5 text-center">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-600">
                              <span className={cn("h-1.5 w-1.5 rounded-full", cfg.visivel === 0 ? "bg-zinc-300" : "bg-zinc-900")} />
                              {cfg.visivel === 0 ? "Oculta" : "Visível"}
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
            { id: 'parametros', label: 'Parâmetros' },
          ] : undefined}
          activeTab={abaLinha}
          onTabChange={(id) => setAbaLinha(id as 'produtos' | 'parametros')}
          footer={
            abaLinha === 'produtos' ? (
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
                    <option value="">Mudar status…</option>
                    <option value="ativo">Ativa</option>
                    <option value="lancamento">Lançamento</option>
                    <option value="saindo_de_linha">Saindo de Linha</option>
                    <option value="descontinuado">Saiu de Linha</option>
                    <option value="terceirizado">Terceirizado</option>
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
                    const st = p.status_produto || 'ativo';
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
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

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
                <input
                  type="text"
                  disabled={!!editingLineConfig}
                  placeholder="Ex: 9.15."
                  value={linePrefixForm}
                  onChange={(e) => setLinePrefixForm(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium disabled:bg-zinc-100 disabled:text-zinc-400"
                />
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
                <label className="text-[11px] font-bold text-zinc-650 block">Visibilidade no Painel de Planejamento</label>
                <select
                  value={visibleLineForm}
                  onChange={(e) => setVisibleLineForm(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                >
                  <option value="1">Exibir Linha e seus Produtos</option>
                  <option value="0">Ocultar de Linha (Desativar)</option>
                </select>
              </div>
            </div>
          </form>
          )}
        </Drawer>
      )}
    </>
  );
}
