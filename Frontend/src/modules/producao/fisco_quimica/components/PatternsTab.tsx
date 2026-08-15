import React, { useState, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { FiscoQuimicaPattern, FiscoQuimicaAgent, Product } from '../../../geral/lib/types';
import { Search, Plus, Edit3, Trash2, CheckCircle2, AlertCircle, Settings, Layers } from 'lucide-react';
import Modal from '../../../geral/components/ui/Modal';
import { cn } from '../../../geral/lib/utils';

interface PatternsTabProps {
  products: Product[];
  patterns: FiscoQuimicaPattern[];
  agents: FiscoQuimicaAgent[];
  onRefresh: () => void;
}

export function PatternsTab({
  products,
  patterns,
  agents,
  onRefresh,
}: PatternsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'configured' | 'missing'>('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingPattern, setEditingPattern] = useState<FiscoQuimicaPattern | null>(null);
  const [patCode, setPatCode] = useState('');
  const [patPhMin, setPatPhMin] = useState<string>('5.50');
  const [patPhMax, setPatPhMax] = useState<string>('7.00');
  const [patViscMin, setPatViscMin] = useState<string>('8000');
  const [patViscMax, setPatViscMax] = useState<string>('12000');
  const [patDensityTarget, setPatDensityTarget] = useState<string>('1.000');
  const [patDensityTolerance, setPatDensityTolerance] = useState<string>('0.020');
  const [patVol, setPatVol] = useState<string>('1000');
  const [patUnit, setPatUnit] = useState<'mL' | 'L' | 'g' | 'kg'>('mL');
  const [patAllowedAgents, setPatAllowedAgents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    let list = products;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const qNorm = q.replace(/\./g, '');
      list = list.filter((p) => {
        const codeNorm = p.code.toLowerCase().replace(/\./g, '');
        return codeNorm.includes(qNorm) || p.name.toLowerCase().includes(q);
      });
    }

    if (statusFilter !== 'all') {
      list = list.filter((prod) => {
        const hasPattern = patterns.some((p) => normalizeCode(p.productCode) === normalizeCode(prod.code));
        return statusFilter === 'configured' ? hasPattern : !hasPattern;
      });
    }

    return list;
  }, [products, patterns, searchQuery, statusFilter]);

  const handleOpenAdd = (prod: Product) => {
    setEditingPattern(null);
    setPatCode(prod.code);
    setPatPhMin('5.50');
    setPatPhMax('7.00');
    setPatViscMin('8000');
    setPatViscMax('12000');
    setPatDensityTarget('1.000');
    setPatDensityTolerance('0.020');

    // Auto detecção de volume a partir do nome
    const match = prod.name.match(/(\d+(?:[.,]\d+)?)\s*(ML|L|G|KG)\b/i);
    if (match) {
      setPatVol(match[1].replace(',', '.'));
      const u = match[2].toUpperCase();
      if (u === 'ML') setPatUnit('mL');
      else if (u === 'L') setPatUnit('L');
      else if (u === 'G') setPatUnit('g');
      else if (u === 'KG') setPatUnit('kg');
    } else {
      setPatVol('1000');
      setPatUnit('mL');
    }

    setPatAllowedAgents([]);
    setShowModal(true);
  };

  const handleOpenEdit = (prod: Product, pat: FiscoQuimicaPattern) => {
    setEditingPattern(pat);
    setPatCode(prod.code);
    setPatPhMin(pat.phMin.toString());
    setPatPhMax(pat.phMax.toString());
    setPatViscMin(pat.viscosityMin.toString());
    setPatViscMax(pat.viscosityMax.toString());
    setPatDensityTarget(pat.densityTarget.toString());
    setPatDensityTolerance(pat.densityTolerance.toString());
    setPatVol(pat.packageVolume.toString());
    setPatUnit(pat.packageUnit);
    setPatAllowedAgents(pat.allowedAgents || []);
    setShowModal(true);
  };

  const handleSavePattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patCode) return;

    const phMin = parseFloat(patPhMin.toString().replace(',', '.'));
    const phMax = parseFloat(patPhMax.toString().replace(',', '.'));
    const viscMin = parseFloat(patViscMin.toString().replace(',', '.'));
    const viscMax = parseFloat(patViscMax.toString().replace(',', '.'));
    const densTarget = parseFloat(patDensityTarget.toString().replace(',', '.'));
    const densTol = parseFloat(patDensityTolerance.toString().replace(',', '.'));
    const vol = parseFloat(patVol.toString().replace(',', '.'));

    if (
      isNaN(phMin) || isNaN(phMax) ||
      isNaN(viscMin) || isNaN(viscMax) ||
      isNaN(densTarget) || isNaN(densTol) ||
      isNaN(vol)
    ) {
      alert('Preencha os campos numéricos corretamente.');
      return;
    }

    const payload: FiscoQuimicaPattern = {
      productCode: patCode,
      phMin,
      phMax,
      viscosityMin: viscMin,
      viscosityMax: viscMax,
      densityTarget: densTarget,
      densityTolerance: densTol,
      packageVolume: vol,
      packageUnit: patUnit,
      allowedAgents: patAllowedAgents,
    };

    setSaving(true);
    try {
      await api.saveFiscoQuimicaPattern(payload);
      setShowModal(false);
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar especificações do produto.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePattern = async (code: string) => {
    if (!confirm(`Remover as especificações do produto ${code}?`)) return;
    try {
      await api.deleteFiscoQuimicaPattern(code);
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir padrão.');
    }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto animate-in fade-in duration-200">
      
      {/* Barra de Filtros e Busca */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar produto por nome ou código..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-zinc-300 rounded-xl text-sm bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              statusFilter === 'all' ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            Todos ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('configured')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              statusFilter === 'configured' ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            )}
          >
            Configurados ({patterns.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('missing')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              statusFilter === 'missing' ? "bg-zinc-700 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            Pendentes ({Math.max(0, products.length - patterns.length)})
          </button>
        </div>
      </div>

      {/* Tabela de Padrões */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[350px]">
          {filteredProducts.length === 0 ? (
            <div className="py-20 text-center text-zinc-400 text-sm">
              Nenhum produto localizado.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50/80 border-b border-zinc-200 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Código / Produto</th>
                  <th className="px-5 py-3">Faixa de pH</th>
                  <th className="px-5 py-3">Faixa de Viscosidade</th>
                  <th className="px-5 py-3">Densidade Alvo</th>
                  <th className="px-5 py-3">Embalagem</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredProducts.map((prod) => {
                  const pat = patterns.find((p) => normalizeCode(p.productCode) === normalizeCode(prod.code));

                  return (
                    <tr key={prod.code} className="hover:bg-zinc-50/70 transition-colors">
                      {/* Código / Produto */}
                      <td className="px-5 py-3.5">
                        <div className="max-w-[260px]">
                          <span className="font-bold text-zinc-900 block truncate" title={prod.name}>
                            {prod.name}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400 font-bold">{prod.code}</span>
                        </div>
                      </td>

                      {/* pH Faixa */}
                      <td className="px-5 py-3.5 font-mono">
                        {pat ? (
                          <span className="font-bold text-zinc-800">
                            {pat.phMin.toFixed(2)} – {pat.phMax.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">—</span>
                        )}
                      </td>

                      {/* Viscosidade Faixa */}
                      <td className="px-5 py-3.5 font-mono">
                        {pat ? (
                          <span className="font-bold text-zinc-800">
                            {pat.viscosityMin.toLocaleString('pt-BR')} – {pat.viscosityMax.toLocaleString('pt-BR')}{' '}
                            <span className="text-[10px] font-normal text-zinc-400">cps</span>
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">—</span>
                        )}
                      </td>

                      {/* Densidade Alvo */}
                      <td className="px-5 py-3.5 font-mono">
                        {pat ? (
                          <span className="font-bold text-zinc-800">
                            {pat.densityTarget.toFixed(3)} ± {pat.densityTolerance.toFixed(3)}{' '}
                            <span className="text-[10px] font-normal text-zinc-400">g/mL</span>
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">—</span>
                        )}
                      </td>

                      {/* Embalagem */}
                      <td className="px-5 py-3.5">
                        {pat ? (
                          <span className="font-bold text-zinc-800">
                            {pat.packageVolume} {pat.packageUnit}
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {pat ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-bold text-[10px]">
                            Configurado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 border border-zinc-200 rounded-full font-medium text-[10px]">
                            Pendente
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {pat ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(prod, pat)}
                                className="flex items-center gap-1 px-2.5 py-1 text-zinc-700 hover:text-zinc-950 border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePattern(pat.productCode)}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Excluir Padrão"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenAdd(prod)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-all shadow cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" /> Definir Padrão
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de Cadastro/Edição de Padrão */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingPattern ? 'Editar Especificações do Produto' : 'Cadastrar Padrão Físico-Químico'}
        subtitle="Defina as faixas de conformidade de pH, viscosidade, densidade e envase"
        size="md"
      >
        <form onSubmit={handleSavePattern} className="space-y-4">
          <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 space-y-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Produto Selecionado</span>
            <strong className="text-sm text-zinc-900 block truncate">
              {products.find((p) => p.code === patCode)?.name || 'Produto'}
            </strong>
            <span className="font-mono text-xs text-zinc-500 font-bold block">{patCode}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">pH Mínimo *</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={patPhMin}
                onChange={(e) => setPatPhMin(e.target.value.replace(',', '.'))}
                className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">pH Máximo *</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={patPhMax}
                onChange={(e) => setPatPhMax(e.target.value.replace(',', '.'))}
                className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Viscosidade Mín. (cps) *</label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={patViscMin}
                onChange={(e) => setPatViscMin(e.target.value.replace(',', '.'))}
                className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Viscosidade Máx. (cps) *</label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={patViscMax}
                onChange={(e) => setPatViscMax(e.target.value.replace(',', '.'))}
                className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Densidade Alvo (g/mL) *</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={patDensityTarget}
                onChange={(e) => setPatDensityTarget(e.target.value.replace(',', '.'))}
                className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Tolerância (± g/mL) *</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={patDensityTolerance}
                onChange={(e) => setPatDensityTolerance(e.target.value.replace(',', '.'))}
                className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Capacidade Embalagem *</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={patVol}
                onChange={(e) => setPatVol(e.target.value.replace(',', '.'))}
                className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Unidade da Embalagem *</label>
              <select
                value={patUnit}
                onChange={(e) => setPatUnit(e.target.value as any)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="mL">mL (Mililitros)</option>
                <option value="L">L (Litros)</option>
                <option value="g">g (Gramas)</option>
                <option value="kg">kg (Quilogramas)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-zinc-200 pt-3">
            <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
              Agentes Corretivos Permitidos
            </label>
            <div className="border border-zinc-200 rounded-xl p-3 max-h-32 overflow-y-auto space-y-1 bg-zinc-50/50">
              {agents.length === 0 ? (
                <p className="text-[11px] text-zinc-400 py-2 text-center">Nenhum agente corretivo cadastrado.</p>
              ) : (
                agents.map((ag) => {
                  const isChecked = patAllowedAgents.includes(ag.id);
                  return (
                    <label key={ag.id} className="flex items-center gap-2 text-xs text-zinc-800 hover:text-zinc-950 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) setPatAllowedAgents([...patAllowedAgents, ag.id]);
                          else setPatAllowedAgents(patAllowedAgents.filter((id) => id !== ag.id));
                        }}
                        className="w-3.5 h-3.5 text-zinc-950 focus:ring-zinc-900 accent-zinc-950 rounded cursor-pointer"
                      />
                      <span className="truncate">{ag.name} ({ag.id})</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-zinc-300 text-zinc-600 text-xs font-bold rounded-xl hover:bg-zinc-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-all"
            >
              {saving ? 'Salvando...' : 'Salvar Especificações'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
