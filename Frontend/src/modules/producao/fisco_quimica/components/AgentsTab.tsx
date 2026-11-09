import React, { useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { pedirMotivoExclusao } from '../../../producao/lib/useMotivoExclusao';
import { api } from '../../../geral/lib/api';
import { FiscoQuimicaAgent, Item } from '../../../geral/lib/types';
import Drawer from '../../../geral/components/ui/Drawer';
import { BotaoAcao, FilterBar, ReportTabs, StatusBadge, type VarianteBadge } from '../../../geral/components/ui/ReportKit';

interface AgentsTabProps {
  agents: FiscoQuimicaAgent[];
  items: Item[];
  onRefresh: () => void;
}

type Categoria = 'VISCOSIDADE' | 'PH' | 'OUTROS';

const CATEGORIAS: Record<Categoria, { rotulo: string; variante: VarianteBadge }> = {
  VISCOSIDADE: { rotulo: 'Viscosidade', variante: 'abundante' },
  PH: { rotulo: 'pH', variante: 'apoio' },
  OUTROS: { rotulo: 'Outros', variante: 'descontinuado' },
};

const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();
const categoriaDe = (a: FiscoQuimicaAgent): Categoria => ((a.category || 'VISCOSIDADE').toUpperCase() as Categoria);

/** Catálogo dos corretivos (matérias-primas usadas para ajustar viscosidade e pH nos laudos). */
export function AgentsTab({ agents, items, onRefresh }: AgentsTabProps) {
  const [categoria, setCategoria] = useState<'ALL' | Categoria>('ALL');
  const [busca, setBusca] = useState('');
  const [novoAberto, setNovoAberto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [categoriaNova, setCategoriaNova] = useState<Categoria>('VISCOSIDADE');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const item = useMemo(() => {
    if (!codigo) return null;
    const norm = normalizeCode(codigo);
    return items.find((i) => normalizeCode(i.code) === norm) || null;
  }, [codigo, items]);

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return agents.filter((a) => (categoria === 'ALL' || categoriaDe(a) === categoria) && (!q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)));
  }, [agents, categoria, busca]);

  const abas = [
    { id: 'ALL', label: 'Todos', contagem: agents.length },
    ...(['VISCOSIDADE', 'PH', 'OUTROS'] as Categoria[]).map((c) => ({ id: c, label: CATEGORIAS[c].rotulo, contagem: agents.filter((a) => categoriaDe(a) === c).length })),
  ];

  const abrirNovo = () => {
    setCodigo('');
    setCategoriaNova('VISCOSIDADE');
    setErro(null);
    setNovoAberto(true);
  };

  const vincular = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return setErro('Escolha uma matéria-prima da lista.');
    if (agents.some((a) => a.id === item.code)) return setErro('Esta matéria-prima já é um corretivo.');
    setSaving(true);
    setErro(null);
    try {
      await api.saveFiscoQuimicaAgent({ id: item.code, name: item.description, category: categoriaNova });
      setNovoAberto(false);
      onRefresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const remover = (a: FiscoQuimicaAgent) =>
    pedirMotivoExclusao({
      titulo: 'Remover corretivo',
      alvo: `Corretivo "${a.name}"`,
      confirmarRotulo: 'Remover',
      executar: async (motivo) => {
        await api.deleteFiscoQuimicaAgent(a.id, motivo);
        onRefresh();
      },
    });

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <ReportTabs abas={abas} ativa={categoria} onChange={(id) => setCategoria(id as 'ALL' | Categoria)} />

      <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar corretivo por nome ou código...">
        <BotaoAcao primario className="min-h-11 md:min-h-0" onClick={abrirNovo}>
          <Plus size={14} /> Novo corretivo
        </BotaoAcao>
      </FilterBar>

      <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="px-4 py-2.5 border-b border-zinc-200 text-xs font-bold text-zinc-700">
          {filtrados.length} {filtrados.length === 1 ? 'corretivo' : 'corretivos'}
        </div>
        {filtrados.length === 0 ? (
          <p className="p-10 text-center text-zinc-500 font-bold text-xs">Nenhum corretivo encontrado.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filtrados.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 pl-4">
                <div className="min-w-0 py-2.5">
                  <span className="block text-xs font-bold text-zinc-900 break-words">{a.name}</span>
                  <span className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[11px] text-zinc-500">{a.id}</span>
                    <StatusBadge variante={CATEGORIAS[categoriaDe(a)]?.variante || 'descontinuado'}>{CATEGORIAS[categoriaDe(a)]?.rotulo || 'Outros'}</StatusBadge>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remover(a)}
                  aria-label={`Remover ${a.name}`}
                  title="Remover da lista de corretivos"
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-zinc-400 hover:text-red-700 cursor-pointer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {novoAberto && (
        <Drawer
          onClose={() => setNovoAberto(false)}
          title="Novo corretivo"
          subtitle="Escolha a matéria-prima e para o que ela serve"
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <BotaoAcao className="min-h-11 md:min-h-0" disabled={saving} onClick={() => setNovoAberto(false)}>Cancelar</BotaoAcao>
              <BotaoAcao primario className="min-h-11 md:min-h-0" disabled={saving || !item} onClick={() => vincular({ preventDefault() {} } as React.FormEvent)}>
                {saving ? 'Salvando...' : 'Adicionar'}
              </BotaoAcao>
            </div>
          }
        >
          <form onSubmit={vincular} className="space-y-4 p-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">Matéria-prima (código ou nome)</label>
              <input
                type="text"
                list="fisco-corretivos-itens"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ex.: 9.15.025"
                className="w-full min-h-11 border border-zinc-300 rounded-xl px-3 text-sm font-mono font-bold bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              <datalist id="fisco-corretivos-itens">
                {items.map((i) => (
                  <option key={i.code} value={i.code}>{i.code.replace(/\./g, '')} — {i.description} ({i.unit})</option>
                ))}
              </datalist>
              {item && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="min-w-0 break-words font-bold">{item.description} <span className="font-mono font-normal text-emerald-700">({item.unit})</span></span>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">Serve para</label>
              <select
                value={categoriaNova}
                onChange={(e) => setCategoriaNova(e.target.value as Categoria)}
                className="w-full min-h-11 border border-zinc-300 rounded-xl px-3 text-sm font-bold bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="VISCOSIDADE">Viscosidade (espessante, sal)</option>
                <option value="PH">pH (ácido, base)</option>
                <option value="OUTROS">Outros (cor, odor, aditivo)</option>
              </select>
            </div>
            {erro && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{erro}</p>}
          </form>
        </Drawer>
      )}
    </div>
  );
}
