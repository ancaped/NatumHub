import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { apiJson } from '../../../geral/lib/http';
import { cn } from '../../../geral/lib/utils';

export interface CatalogoContagem {
  code: string;
  description: string;
  unit: string;
  saldo: number;
  reservado: number;
  emPedido: number;
}

interface ItemLista {
  id: string;
  itemCode: string;
  description: string;
  unit: string;
  saldo: number;
  reservado: number;
  emPedido: number;
  contagem1: number | null;
  contagem2: number | null;
  contagem3: number | null;
}

interface Lista {
  id: string;
  escopo: string;
  criadaEm: string;
  criadaPor: string | null;
  status: string;
  encerradaEm: string | null;
  itens: ItemLista[];
}

function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function textoQtd(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function somaContagens(item: ItemLista) {
  const partes = [item.contagem1, item.contagem2, item.contagem3].filter((n): n is number => n != null);
  if (partes.length === 0) return null;
  return partes.reduce((a, b) => a + b, 0);
}

function diferenca(item: ItemLista) {
  const soma = somaContagens(item);
  if (soma == null) return null;
  const considerado = item.saldo - item.reservado + item.emPedido;
  return soma - considerado;
}

function rotulos(escopo: string) {
  const venda = escopo === 'produtos' || escopo === 'coloracao' || escopo === 'apoio';
  if (venda) {
    return {
      reservado: 'Pedido de venda',
      emPedido: 'Pedido de compra',
      nota: 'Pedido de venda é o que o cliente comprou e ainda não faturou. Pedido de compra é o que foi comprado e ainda vai entrar no estoque.',
    };
  }
  return {
    reservado: 'Reserva de produção',
    emPedido: 'Pedido de compra',
    nota: 'Reserva de produção é o que está comprometido em ordens abertas. Pedido de compra é o que foi comprado e ainda vai entrar no estoque.',
  };
}

function quando(valor: string) {
  const [data, hora] = valor.split(' ');
  if (!data) return valor;
  const [ano, mes, dia] = data.split('-');
  const hm = hora ? hora.slice(0, 5) : '';
  return `${dia}/${mes}/${ano}${hm ? ` ${hm}` : ''}`;
}

function Campo({
  valor,
  unit,
  disabled,
  onCommit,
}: {
  valor: number | null;
  unit?: string;
  disabled: boolean;
  onCommit: (n: number | null) => void;
}) {
  return (
    <input
      key={`${valor ?? 'vazio'}-${unit ?? ''}`}
      defaultValue={textoQtd(valor)}
      disabled={disabled}
      inputMode="decimal"
      onBlur={(e) => {
        const n = lerNumero(e.target.value);
        const antes = valor ?? null;
        if (n === antes) return;
        if (n == null && antes == null) return;
        onCommit(n);
      }}
      className="ml-auto block w-[5.5rem] px-2 py-1.5 text-right font-mono text-xs tabular-nums rounded-lg border border-zinc-200 bg-white focus:outline-none focus:border-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-400"
    />
  );
}

function somaAnterior(listas: Lista[], lista: Lista, itemCode: string) {
  const anteriores = listas
    .filter((l) => l.id !== lista.id && l.criadaEm < lista.criadaEm)
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
  for (const outra of anteriores) {
    const item = outra.itens.find((i) => i.itemCode === itemCode);
    if (!item) continue;
    const soma = somaContagens(item);
    if (soma != null) return soma;
  }
  return null;
}

export function ListaContagem({
  escopo,
  catalogo,
  onSaldosAtualizados,
}: {
  escopo: string;
  catalogo: CatalogoContagem[];
  tipo: 'insumo' | 'produto';
  onSaldosAtualizados?: () => void;
}) {
  const papel = rotulos(escopo);
  const [listas, setListas] = useState<Lista[]>([]);
  const [listaId, setListaId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const lista = listas.find((l) => l.id === listaId) ?? null;
  const aberta = lista?.status === 'aberta';

  useEffect(() => {
    let vivo = true;
    setErro(null);
    apiJson<Lista[]>(`/estoque/contagens?escopo=${encodeURIComponent(escopo)}`)
      .then((data) => {
        if (!vivo) return;
        setListas(data);
        setListaId(data.find((l) => l.status === 'aberta')?.id ?? data[0]?.id ?? null);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar as listas.');
      });
    return () => {
      vivo = false;
    };
  }, [escopo]);

  function substituir(nova: Lista) {
    setListas((atual) => atual.map((l) => (l.id === nova.id ? nova : l)));
  }

  async function novaLista() {
    setOcupado(true);
    setErro(null);
    try {
      const criada = await apiJson<Lista>('/estoque/contagens', {
        method: 'POST',
        body: JSON.stringify({ escopo }),
      });
      setListas((atual) => [criada, ...atual]);
      setListaId(criada.id);
      setMarcados([]);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a lista.');
    } finally {
      setOcupado(false);
    }
  }

  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const ja = new Set(lista?.itens.map((i) => i.itemCode) ?? []);
    const base = catalogo.filter((c) => !ja.has(c.code));
    const filtrada = q
      ? base.filter((c) => c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      : base;
    return filtrada.slice(0, 40);
  }, [busca, catalogo, lista]);

  async function incluir() {
    if (!lista || marcados.length === 0) return;
    const itens = catalogo
      .filter((c) => marcados.includes(c.code))
      .map((c) => ({
        itemCode: c.code,
        description: c.description,
        unit: c.unit || 'UN',
        saldo: c.saldo,
        reservado: c.reservado,
        emPedido: c.emPedido,
      }));
    setOcupado(true);
    setErro(null);
    try {
      const nova = await apiJson<Lista>(`/estoque/contagens/${lista.id}/itens`, {
        method: 'POST',
        body: JSON.stringify({ itens }),
      });
      substituir(nova);
      setMarcados([]);
      setBusca('');
      onSaldosAtualizados?.();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível incluir os itens.');
    } finally {
      setOcupado(false);
    }
  }

  async function salvarItem(item: ItemLista, patch: Partial<Pick<ItemLista, 'reservado' | 'emPedido' | 'contagem1' | 'contagem2' | 'contagem3'>>) {
    if (!lista) return;
    const body = {
      reservado: patch.reservado ?? item.reservado,
      emPedido: patch.emPedido ?? item.emPedido,
      contagem1: patch.contagem1 !== undefined ? patch.contagem1 : item.contagem1,
      contagem2: patch.contagem2 !== undefined ? patch.contagem2 : item.contagem2,
      contagem3: patch.contagem3 !== undefined ? patch.contagem3 : item.contagem3,
    };
    if ([body.reservado, body.emPedido, body.contagem1, body.contagem2, body.contagem3].some((n) => n != null && n < 0)) {
      setErro('As quantidades não podem ser negativas.');
      return;
    }
    setErro(null);
    try {
      const nova = await apiJson<Lista>(`/estoque/contagens/${lista.id}/itens/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      substituir(nova);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  async function tirar(itemId: string) {
    if (!lista) return;
    setErro(null);
    try {
      const nova = await apiJson<Lista>(`/estoque/contagens/${lista.id}/itens/${itemId}`, { method: 'DELETE' });
      substituir(nova);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível tirar o item.');
    }
  }

  async function atualizarSaldos() {
    if (!lista) return;
    setOcupado(true);
    setErro(null);
    try {
      const nova = await apiJson<Lista>(`/estoque/contagens/${lista.id}/atualizar-saldos`, { method: 'POST' });
      substituir(nova);
      onSaldosAtualizados?.();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o saldo no ERP.');
    } finally {
      setOcupado(false);
    }
  }

  async function mudarStatus(acao: 'encerrar' | 'reabrir') {
    if (!lista) return;
    setOcupado(true);
    setErro(null);
    try {
      const nova = await apiJson<Lista>(`/estoque/contagens/${lista.id}/${acao}`, { method: 'POST' });
      substituir(nova);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível atualizar a lista.');
    } finally {
      setOcupado(false);
    }
  }

  const resumo = useMemo(() => {
    const itens = lista?.itens ?? [];
    let faltas = 0;
    let sobras = 0;
    let semContagem = 0;
    for (const item of itens) {
      const diff = diferenca(item);
      if (diff == null) semContagem += 1;
      else if (diff < -0.0001) faltas += 1;
      else if (diff > 0.0001) sobras += 1;
    }
    return { total: itens.length, faltas, sobras, semContagem };
  }, [lista]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        {listas.length > 0 ? (
          <select
            value={listaId ?? ''}
            onChange={(e) => setListaId(e.target.value)}
            className="min-w-[16rem] text-sm rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 focus:outline-none focus:border-zinc-900"
          >
            {listas.map((l) => (
              <option key={l.id} value={l.id}>
                {quando(l.criadaEm)} · {l.status === 'aberta' ? 'em aberto' : 'lançada'}
                {l.criadaPor ? ` · ${l.criadaPor}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-zinc-500">Nenhuma lista ainda.</p>
        )}
        {lista && (
          <span className={cn(
            'text-[11px] font-bold px-2.5 py-1 rounded-full border',
            aberta ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700',
          )}>
            {aberta ? 'Aguardando lançamento' : `Lançada em ${quando(lista.encerradaEm || '')}`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {lista && aberta && (
            <button
              type="button"
              disabled={ocupado || lista.itens.length === 0}
              onClick={() => void atualizarSaldos()}
              className="text-xs font-bold rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
            >
              Atualizar saldos
            </button>
          )}
        {lista && aberta && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void mudarStatus('encerrar')}
              className="text-xs font-bold rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-700 hover:bg-zinc-100"
            >
              Marcar como lançada
            </button>
          )}
          {lista && !aberta && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void mudarStatus('reabrir')}
              className="text-xs font-bold rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-700 hover:bg-zinc-100"
            >
              Reabrir
            </button>
          )}
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void novaLista()}
            className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl px-3 py-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Nova lista
          </button>
        </div>
      </div>

      {erro && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{erro}</p>
      )}

      {!lista ? (
        <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm px-6 py-16 text-center">
          <ClipboardList className="h-5 w-5 mx-auto text-zinc-400" />
          <p className="mt-3 text-sm font-semibold text-zinc-900">Nenhuma lista neste módulo</p>
          <p className="mt-1 text-sm text-zinc-500">Crie uma lista, escolha os itens e conte em até três lugares.</p>
        </div>
      ) : (
        <>
          {aberta && (
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[16rem]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar código ou descrição para incluir"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm focus:bg-white focus:outline-none focus:border-zinc-900"
                  />
                </div>
                <button
                  type="button"
                  disabled={ocupado || marcados.length === 0}
                  onClick={() => void incluir()}
                  className="text-xs font-bold rounded-xl bg-zinc-900 text-white px-3 py-2.5 disabled:opacity-40"
                >
                  Incluir {marcados.length > 0 ? marcados.length : ''}
                </button>
              </div>
              {busca.trim() && (
                <ul className="mt-3 max-h-56 overflow-auto divide-y divide-zinc-100 border border-zinc-200 rounded-xl">
                  {sugestoes.length === 0 ? (
                    <li className="px-3 py-6 text-center text-sm text-zinc-500">Nenhum item fora da lista.</li>
                  ) : sugestoes.map((c) => {
                    const marcado = marcados.includes(c.code);
                    return (
                      <li key={c.code}>
                        <label className={cn('flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer', marcado ? 'bg-zinc-50' : 'hover:bg-zinc-50')}>
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => setMarcados((atual) => marcado ? atual.filter((x) => x !== c.code) : [...atual, c.code])}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-zinc-900">{c.description}</span>
                            <span className="font-mono text-[11px] text-zinc-400">{c.code}</span>
                          </span>
                          <span className={cn('ml-auto font-mono text-xs tabular-nums', c.saldo < 0 ? 'text-rose-700 font-bold' : 'text-zinc-600')}>
                            {textoQtd(c.saldo)} {c.unit}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span><b className="text-zinc-900">{resumo.total}</b> itens</span>
              <span><b className="text-zinc-900">{resumo.semContagem}</b> sem contagem</span>
              <span><b className="text-rose-700">{resumo.faltas}</b> faltas</span>
              <span><b className="text-emerald-700">{resumo.sobras}</b> sobras</span>
              <span className="ml-auto hidden lg:inline">O saldo é o do ERP, lido na hora. {papel.nota}</span>
            </div>
            {/* Mobile View: Touch Cards */}
            <div className="block md:hidden divide-y divide-zinc-100">
              {lista.itens.length === 0 ? (
                <p className="px-6 py-14 text-center text-sm text-zinc-500">Busque um item acima para congelar o saldo e começar a contar.</p>
              ) : (
                lista.itens.map((item) => {
                  const soma = somaContagens(item);
                  const diff = diferenca(item);
                  const tom = diff == null ? 'vazio' : diff < -0.0001 ? 'falta' : diff > 0.0001 ? 'sobra' : 'zero';
                  return (
                    <div key={item.id} className="p-4 space-y-3 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-zinc-900 leading-snug">{item.description}</p>
                          <p className="font-mono text-xs text-zinc-400">{item.itemCode}</p>
                        </div>
                        {aberta && (
                          <button
                            type="button"
                            onClick={() => void tirar(item.id)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-800 shrink-0 p-1"
                          >
                            Tirar
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-zinc-50 rounded-xl p-2.5 text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-zinc-400 block">Saldo ERP</span>
                          <span className={cn('font-bold font-mono', item.saldo < 0 ? 'text-rose-700' : 'text-zinc-800')}>
                            {textoQtd(item.saldo)} {item.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-zinc-400 block">{papel.reservado}</span>
                          <span className="font-mono text-zinc-600">{textoQtd(item.reservado) || '0'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-zinc-400 block">{papel.emPedido}</span>
                          <span className="font-mono text-zinc-600">{textoQtd(item.emPedido) || '0'}</span>
                        </div>
                      </div>

                      {/* Campos de Contagem 1, 2 e 3 */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                          Contagens Físicas (Locais 1, 2 e 3)
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <span className="text-[10px] text-zinc-400 block mb-0.5">Local 1</span>
                            <Campo valor={item.contagem1} disabled={!aberta} onCommit={(n) => void salvarItem(item, { contagem1: n })} />
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 block mb-0.5">Local 2</span>
                            <Campo valor={item.contagem2} disabled={!aberta} onCommit={(n) => void salvarItem(item, { contagem2: n })} />
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 block mb-0.5">Local 3</span>
                            <Campo valor={item.contagem3} disabled={!aberta} onCommit={(n) => void salvarItem(item, { contagem3: n })} />
                          </div>
                        </div>
                      </div>

                      {/* Resumo da Contagem do Item */}
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs">
                        <div>
                          <span className="text-zinc-500">Soma Contada: </span>
                          <strong className="font-mono text-zinc-900">{soma == null ? '—' : `${textoQtd(soma)} ${item.unit}`}</strong>
                        </div>

                        <div>
                          {tom === 'vazio' ? (
                            <span className="text-zinc-400 text-xs italic">Não contado</span>
                          ) : (
                            <span className={cn(
                              'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold',
                              tom === 'falta' && 'bg-rose-50 border-rose-200 text-rose-700',
                              tom === 'sobra' && 'bg-emerald-50 border-emerald-200 text-emerald-700',
                              tom === 'zero' && 'bg-zinc-50 border-zinc-200 text-zinc-600',
                            )}>
                              {tom === 'falta' ? `Falta ${textoQtd(Math.abs(diff ?? 0))}` : tom === 'sobra' ? `Sobra ${textoQtd(diff ?? 0)}` : 'Conforme'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop View: Wide Table */}
            <div className="hidden md:block overflow-x-auto">
              {lista.itens.length === 0 ? (
                <p className="px-6 py-14 text-center text-sm text-zinc-500">Busque um item acima para congelar o saldo e começar a contar.</p>
              ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-bold">Item</th>
                      <th className="px-3 py-3 text-right font-bold">Saldo</th>
                      <th className="px-3 py-3 text-right font-bold">{papel.reservado}</th>
                      <th className="px-3 py-3 text-right font-bold">{papel.emPedido}</th>
                      <th className="px-3 py-3 text-center font-bold bg-zinc-100/80">Contagem 1</th>
                      <th className="px-3 py-3 text-center font-bold bg-zinc-100/80">Contagem 2</th>
                      <th className="px-3 py-3 text-center font-bold bg-zinc-100/80">Contagem 3</th>
                      <th className="px-3 py-3 text-right font-bold">Soma</th>
                      <th className="px-4 py-3 text-right font-bold">Diferença</th>
                      <th className="px-3 py-3 text-right font-bold">Anterior</th>
                      <th className="px-3 py-3 text-right font-bold">Vs anterior</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {lista.itens.map((item) => {
                      const soma = somaContagens(item);
                      const diff = diferenca(item);
                      const anterior = somaAnterior(listas, lista, item.itemCode);
                      const vsAnterior = soma != null && anterior != null ? soma - anterior : null;
                      const tom = diff == null ? 'vazio' : diff < -0.0001 ? 'falta' : diff > 0.0001 ? 'sobra' : 'zero';
                      return (
                        <tr key={item.id} className="hover:bg-zinc-50/80">
                          <td className="px-4 py-3 max-w-[18rem]">
                            <p className="font-medium text-zinc-900 truncate">{item.description}</p>
                            <p className="font-mono text-[11px] text-zinc-400">{item.itemCode}</p>
                          </td>
                          <td className={cn('px-3 py-3 text-right font-mono text-xs tabular-nums', item.saldo < 0 ? 'text-rose-700 font-bold' : 'text-zinc-800')}>
                            {textoQtd(item.saldo)} <span className="text-zinc-400 font-sans">{item.unit}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Campo valor={item.reservado} disabled={!aberta} onCommit={(n) => void salvarItem(item, { reservado: n ?? 0 })} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Campo valor={item.emPedido} disabled={!aberta} onCommit={(n) => void salvarItem(item, { emPedido: n ?? 0 })} />
                          </td>
                          <td className="px-3 py-2 text-right bg-zinc-50/70">
                            <Campo valor={item.contagem1} disabled={!aberta} onCommit={(n) => void salvarItem(item, { contagem1: n })} />
                          </td>
                          <td className="px-3 py-2 text-right bg-zinc-50/70">
                            <Campo valor={item.contagem2} disabled={!aberta} onCommit={(n) => void salvarItem(item, { contagem2: n })} />
                          </td>
                          <td className="px-3 py-2 text-right bg-zinc-50/70">
                            <Campo valor={item.contagem3} disabled={!aberta} onCommit={(n) => void salvarItem(item, { contagem3: n })} />
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs tabular-nums font-semibold text-zinc-900">{soma == null ? '—' : textoQtd(soma)}</td>
                          <td className="px-4 py-3 text-right">
                            {tom === 'vazio' ? <span className="text-zinc-300">—</span> : (
                              <span className={cn(
                                'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold',
                                tom === 'falta' && 'bg-rose-50 border-rose-200 text-rose-700',
                                tom === 'sobra' && 'bg-emerald-50 border-emerald-200 text-emerald-700',
                                tom === 'zero' && 'bg-zinc-50 border-zinc-200 text-zinc-600',
                              )}>
                                {tom === 'falta' ? `Falta ${textoQtd(Math.abs(diff ?? 0))}` : tom === 'sobra' ? `Sobra ${textoQtd(diff ?? 0)}` : 'Zero'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-zinc-500">{anterior == null ? '—' : textoQtd(anterior)}</td>
                          <td className={cn('px-3 py-3 text-right font-mono text-xs tabular-nums font-semibold', vsAnterior == null ? 'text-zinc-300' : vsAnterior < -0.0001 ? 'text-rose-700' : vsAnterior > 0.0001 ? 'text-emerald-700' : 'text-zinc-700')}>
                            {vsAnterior == null ? '—' : `${vsAnterior > 0 ? '+' : ''}${textoQtd(vsAnterior)}`}
                          </td>
                          <td className="px-3 py-2">
                            {aberta && (
                              <button type="button" onClick={() => void tirar(item.id)} className="text-xs font-semibold text-zinc-400 hover:text-zinc-900">
                                Tirar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

