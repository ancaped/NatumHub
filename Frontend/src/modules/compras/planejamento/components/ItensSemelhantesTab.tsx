import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { api } from '../../../geral/lib/api';
import type { Category, DemandResult, Item } from '../../../geral/lib/types';
import { cn } from '../../../geral/lib/utils';
import Modal from '../../../geral/components/ui/Modal';

interface Props {
  active?: boolean;
}

interface Member {
  code: string;
  description: string;
  unit: string;
  stock: number;
  avg: number;
  trigger: number;
}

interface Group {
  id: string;
  members: Member[];
  unit: string;
  mixedUnits: boolean;
  stock: number;
  avg: number;
  trigger: number;
  durationDays: number | null;
}

function qty(n: number) {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function rootCategory(id: string | null | undefined, categories: Category[]): string | null {
  let current = id || null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const cat = categories.find((c) => c.id === current);
    if (!cat?.parentId) return current;
    current = cat.parentId;
  }
  return current;
}

function isMateriaPrima(code: string, categoryId: string | null | undefined, categories: Category[]) {
  if (rootCategory(categoryId, categories) === 'cat_mp') return true;
  return code.startsWith('9.15.');
}

export function ItensSemelhantesTab({ active = false }: Props) {
  const [rawGroups, setRawGroups] = useState<{ groupId: string; members: { code: string; description: string; unit: string; stock: number }[] }[]>([]);
  const [demands, setDemands] = useState<DemandResult[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ groupId?: string } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [groups, nextDemands, nextItems, nextCategories] = await Promise.all([
        api.getSimilarGroups(),
        api.getDemands(undefined, 90),
        api.getItems(),
        api.getCategories(),
      ]);
      setRawGroups(groups);
      setDemands(nextDemands);
      setItems(nextItems);
      setCategories(nextCategories);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os itens semelhantes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const groups = useMemo(() => {
    const byCode = new Map(demands.map((d) => [d.itemCode, d]));
    const itemByCode = new Map(items.map((i) => [i.code, i]));
    return rawGroups
      .map((group): Group | null => {
        const touchesMp = group.members.some((member) => {
          const demand = byCode.get(member.code);
          const item = itemByCode.get(member.code);
          return isMateriaPrima(member.code, demand?.categoryId ?? item?.categoryId, categories);
        });
        if (!touchesMp) return null;
        const members: Member[] = group.members.map((member) => {
          const demand = byCode.get(member.code);
          return {
            code: member.code,
            description: demand?.description || member.description,
            unit: demand?.unit || member.unit,
            stock: demand?.currentStock ?? member.stock,
            avg: demand?.overallAvg ?? 0,
            trigger: demand?.triggerPoint ?? 0,
          };
        });
        const units = [...new Set(members.map((m) => m.unit).filter(Boolean))];
        const stock = members.reduce((acc, m) => acc + m.stock, 0);
        const avg = members.reduce((acc, m) => acc + m.avg, 0);
        const trigger = members.reduce((acc, m) => acc + m.trigger, 0);
        const daily = avg / 30;
        const durationDays = daily <= 0 ? null : Math.round(stock / daily);
        return {
          id: group.groupId,
          members,
          unit: units[0] || '',
          mixedUnits: units.length > 1,
          stock,
          avg,
          trigger,
          durationDays,
        };
      })
      .filter((g): g is Group => g !== null)
      .sort((a, b) => a.members[0].description.localeCompare(b.members[0].description, 'pt-BR'));
  }, [rawGroups, demands, items, categories]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) =>
      g.members.some((m) => m.code.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)),
    );
  }, [groups, search]);

  const taken = useMemo(() => new Set(groups.flatMap((g) => g.members.map((m) => m.code))), [groups]);

  const pickerOptions = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    const adding = picker?.groupId ? groups.find((g) => g.id === picker.groupId)?.members.map((m) => m.code) ?? [] : [];
    const blocked = new Set([...taken, ...adding, ...picked]);
    return items
      .filter((item) => isMateriaPrima(item.code, item.categoryId, categories))
      .filter((item) => !blocked.has(item.code))
      .filter((item) => item.code.toLowerCase().includes(q) || item.description.toLowerCase().includes(q))
      .slice(0, 12);
  }, [pickerSearch, picker, groups, taken, picked, items, categories]);

  const openPicker = (groupId?: string) => {
    setPicker({ groupId });
    setPickerSearch('');
    setPicked([]);
    setError(null);
  };

  const savePicker = async () => {
    const min = picker?.groupId ? 1 : 2;
    if (picked.length < min) {
      setError(picker?.groupId ? 'Escolha o item que entra no grupo.' : 'Escolha pelo menos dois itens equivalentes.');
      return;
    }
    setBusy('picker');
    setError(null);
    try {
      await api.linkSimilarGroup(picked, picker?.groupId);
      setPicker(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o grupo.');
    } finally {
      setBusy(null);
    }
  };

  const removeItem = async (code: string) => {
    if (!window.confirm(`Tirar ${code} deste grupo?`)) return;
    setBusy(code);
    try {
      await api.unlinkSimilarItem(code);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível tirar o item.');
    } finally {
      setBusy(null);
    }
  };

  const removeGroup = async (group: Group) => {
    if (!window.confirm('Desvincular este grupo? Os itens deixam de ser tratados como equivalentes.')) return;
    setBusy(group.id);
    try {
      await api.unlinkSimilarGroup(group.id);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível desvincular o grupo.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código ou descrição"
            className="w-full text-sm border border-zinc-200 rounded-xl pl-9 pr-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <button
          type="button"
          onClick={() => openPicker()}
          className="inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Criar grupo semelhante
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 cursor-pointer"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {error && <p className="text-xs font-bold text-rose-700">{error}</p>}

      {loading && groups.length === 0 ? (
        <div className="py-16 flex justify-center text-zinc-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm px-6 py-12 text-center">
          <Layers className="h-5 w-5 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-zinc-800">Nenhum grupo de itens semelhantes</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
            Junte dois ou mais insumos equivalentes. O estoque real do grupo é a soma dos estoques.
          </p>
        </div>
      ) : (
        visible.map((group) => {
          const covered = group.trigger > 0 && group.stock >= group.trigger;
          const needsBuy = group.trigger > 0 && group.stock < group.trigger;
          return (
            <div key={group.id} className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.members.map((member) => (
                      <span key={member.code} className="font-mono text-[11px] font-bold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-md">
                        {member.code}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    Consumo médio {qty(group.avg)} {group.unit}/mês
                    {group.durationDays == null ? ' · sem consumo' : ` · duração ${group.durationDays} dias`}
                    {group.mixedUnits ? ' · unidades diferentes' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-zinc-900 bg-zinc-100 px-3 py-1 rounded-lg">
                    Estoque real total: {qty(group.stock)} {group.unit}
                  </span>
                  {covered && (
                    <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Estoque atendido
                    </span>
                  )}
                  {needsBuy && (
                    <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                      Necessidade de compra do grupo
                    </span>
                  )}
                  <button type="button" className="text-[11px] font-bold px-2 py-1 rounded-lg border border-zinc-200 hover:bg-zinc-100 cursor-pointer" onClick={() => openPicker(group.id)}>
                    Adicionar item
                  </button>
                  <button type="button" disabled={busy === group.id} className="text-[11px] font-bold px-2 py-1 rounded-lg text-rose-700 hover:bg-rose-50 cursor-pointer disabled:opacity-50" onClick={() => void removeGroup(group)}>
                    Desvincular grupo
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-left">
                      <th className="py-2 pr-3">Código</th>
                      <th className="py-2 pr-3">Descrição</th>
                      <th className="py-2 pr-3">Unidade</th>
                      <th className="py-2 pr-3 text-right">Estoque</th>
                      <th className="py-2 pr-3 text-right">Consumo médio</th>
                      <th className="py-2 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.members.map((member) => (
                      <tr key={member.code} className="border-t border-zinc-100">
                        <td className="py-2 pr-3 font-mono text-xs font-bold text-zinc-800">{member.code}</td>
                        <td className="py-2 pr-3 text-zinc-900">{member.description}</td>
                        <td className="py-2 pr-3 text-zinc-500">{member.unit || '—'}</td>
                        <td className="py-2 pr-3 text-right">{qty(member.stock)}</td>
                        <td className="py-2 pr-3 text-right text-zinc-600">{qty(member.avg)}</td>
                        <td className="py-2 text-right">
                          <button type="button" title="Tirar do grupo" disabled={busy === member.code} className="p-1.5 rounded text-zinc-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer disabled:opacity-50" onClick={() => void removeItem(member.code)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      {picker && (
        <Modal
          title={picker.groupId ? 'Adicionar item ao grupo' : 'Criar grupo semelhante'}
          subtitle="Insumos equivalentes compartilham o estoque real"
          onClose={() => setPicker(null)}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {picked.map((code) => (
                <button key={code} type="button" className="font-mono text-[11px] font-bold bg-zinc-900 text-white px-2 py-1 rounded-md cursor-pointer" onClick={() => setPicked((prev) => prev.filter((c) => c !== code))}>
                  {code} ×
                </button>
              ))}
              {picked.length === 0 && <p className="text-xs text-zinc-500">Busque e clique nos itens. Clique de novo no código para tirar.</p>}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Código ou descrição"
                className="w-full text-sm border border-zinc-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-100 max-h-64 overflow-y-auto">
              {pickerSearch.trim().length < 2 ? (
                <p className="text-xs text-zinc-500 px-3 py-4">Digite pelo menos 2 letras.</p>
              ) : pickerOptions.length === 0 ? (
                <p className="text-xs text-zinc-500 px-3 py-4">Nenhum insumo livre com esse texto.</p>
              ) : (
                pickerOptions.map((item) => (
                  <button key={item.code} type="button" className="w-full text-left px-3 py-2 hover:bg-zinc-50 cursor-pointer" onClick={() => setPicked((prev) => [...prev, item.code])}>
                    <span className="font-mono text-xs font-bold text-zinc-800">{item.code}</span>
                    <span className="block text-sm text-zinc-700">{item.description}</span>
                  </button>
                ))
              )}
            </div>
            <button type="button" disabled={busy === 'picker'} className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50" onClick={() => void savePicker()}>
              {picker.groupId ? 'Incluir no grupo' : 'Criar grupo'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
