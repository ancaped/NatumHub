import React, { useState, useMemo, useRef } from 'react';
import { api } from '../../../geral/lib/api';
import { FiscoQuimicaPattern, FiscoQuimicaAgent, Product } from '../../../geral/lib/types';
import { Search, Plus, Edit3, Trash2, CheckCircle2, AlertCircle, Settings, Layers, Image as ImageIcon, Upload, X, Eye, Sparkles } from 'lucide-react';
import Modal from '../../../geral/components/ui/Modal';
import { cn } from '../../../geral/lib/utils';
import { parseInputNumber, formatViscosity } from '../lib/fiscoUtils';

interface PatternsTabProps {
  products: Product[];
  patterns: FiscoQuimicaPattern[];
  agents: FiscoQuimicaAgent[];
  onRefresh: () => void;
}

const ASPECT_SUGGESTIONS = [
  'Creme Homogêneo',
  'Líquido Viscoso',
  'Gel Fluido',
  'Emulsão Cremosa',
  'Solução Aquosa',
  'Líquido Límpido',
  'Pomada / Cera',
  'Mousse'
];

const COLOR_SUGGESTIONS = [
  'Branco',
  'Amarelo Claro',
  'Incolor / Translúcido',
  'Perolado',
  'Azul',
  'Rosa',
  'Verde Claro',
  'Dourado',
  'Âmbar'
];

const ODOR_SUGGESTIONS = [
  'Característico',
  'Floral',
  'Frutado',
  'Herbal',
  'Inodoro / Sem Fragrância',
  'Cítrico',
  'Doce / Baunilha',
  'Refrescante / Mentolado'
];

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
  const [patAspect, setPatAspect] = useState('Creme Homogêneo');
  const [patColor, setPatColor] = useState('Branco');
  const [patOdor, setPatOdor] = useState('Característico');
  const [patImageUrl, setPatImageUrl] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Zoom da Imagem
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();

  const allDisplayProducts = useMemo(() => {
    const prodMap = new Map<string, Product>();
    for (const p of products) {
      prodMap.set(normalizeCode(p.code), p);
    }

    for (const pat of patterns) {
      const norm = normalizeCode(pat.productCode);
      if (!prodMap.has(norm)) {
        prodMap.set(norm, {
          code: pat.productCode,
          name: pat.productCode,
          packaging: `${pat.packageVolume} ${pat.packageUnit}`,
          validity: '3 anos',
        });
      }
    }

    return Array.from(prodMap.values());
  }, [products, patterns]);

  const configuredCount = useMemo(() => {
    return allDisplayProducts.filter(prod =>
      patterns.some(p => normalizeCode(p.productCode) === normalizeCode(prod.code))
    ).length;
  }, [allDisplayProducts, patterns]);

  const pendingCount = Math.max(0, allDisplayProducts.length - configuredCount);

  const filteredProducts = useMemo(() => {
    let list = allDisplayProducts;
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
  }, [allDisplayProducts, patterns, searchQuery, statusFilter]);

  const handleOpenAdd = (prod: Product) => {
    setEditingPattern(null);
    setPatCode(prod.code);
    setPatPhMin('5.50');
    setPatPhMax('7.00');
    setPatViscMin('8000');
    setPatViscMax('12000');
    setPatDensityTarget('1.000');
    setPatDensityTolerance('0.020');
    setPatAspect('Creme Homogêneo');
    setPatColor('Branco');
    setPatOdor('Característico');
    setPatImageUrl('');

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
    setPatAspect(pat.aspect || 'Creme Homogêneo');
    setPatColor(pat.color || 'Branco');
    setPatOdor(pat.odor || 'Característico');
    setPatImageUrl(pat.imageUrl || '');
    setShowModal(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Redimensionar e converter para base64 JPEG leve
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setPatImageUrl(dataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSavePattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patCode) return;

    const phMin = parseInputNumber(patPhMin, false);
    const phMax = parseInputNumber(patPhMax, false);
    const viscMin = parseInputNumber(patViscMin, true);
    const viscMax = parseInputNumber(patViscMax, true);
    const densTarget = parseInputNumber(patDensityTarget, false);
    const densTol = parseInputNumber(patDensityTolerance, false);
    const vol = parseInputNumber(patVol, false);

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
      aspect: patAspect.trim() || undefined,
      color: patColor.trim() || undefined,
      odor: patOdor.trim() || undefined,
      imageUrl: patImageUrl.trim() || undefined,
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
    <div className="view-container animate-in fade-in duration-200">
      
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

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              statusFilter === 'all' ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            Todos ({allDisplayProducts.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('configured')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              statusFilter === 'configured' ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            )}
          >
            Configurados ({configuredCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('missing')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              statusFilter === 'missing' ? "bg-zinc-700 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            Pendentes ({pendingCount})
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
                  <th className="px-5 py-3">Produto / Referência</th>
                  <th className="px-5 py-3">Aspecto / Cor / Odor</th>
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
                      {/* Código / Produto + Imagem */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {pat?.imageUrl ? (
                            <button
                              type="button"
                              onClick={() => setZoomImage({ url: pat.imageUrl!, title: prod.name })}
                              className="w-10 h-10 rounded-xl overflow-hidden border border-zinc-200 shrink-0 hover:opacity-80 transition-opacity cursor-pointer group relative"
                              title="Clique para ampliar foto de referência"
                            >
                              <img src={pat.imageUrl} alt={prod.name} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Eye className="w-3.5 h-3.5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200/80 flex items-center justify-center shrink-0 text-zinc-300">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}

                          <div className="min-w-0 max-w-[280px]">
                            <span className="font-bold text-zinc-900 block truncate" title={prod.name}>
                              {prod.name}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400 font-bold">{prod.code}</span>
                          </div>
                        </div>
                      </td>

                      {/* Aspecto / Cor / Odor */}
                      <td className="px-5 py-3.5">
                        {pat ? (
                          <div className="space-y-0.5 max-w-[220px]">
                            <div className="text-[11px] font-semibold text-zinc-900 truncate" title={pat.aspect || 'Conforme'}>
                              {pat.aspect || 'Líquido / Emulsão'}
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate" title={`Cor: ${pat.color || 'Característico'} | Odor: ${pat.odor || 'Característico'}`}>
                              {pat.color || 'Padrão'} · {pat.odor || 'Característico'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic">—</span>
                        )}
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
                            {formatViscosity(pat.viscosityMin, pat)} – {formatViscosity(pat.viscosityMax, pat)}{' '}
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
        subtitle="Defina as faixas de pH, viscosidade, densidade, características visuais e foto padrão"
        size="lg"
      >
        <form onSubmit={handleSavePattern} className="space-y-5">
          {/* Identificação do Produto */}
          <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Produto Selecionado</span>
              <strong className="text-sm text-zinc-900 block truncate">
                {products.find((p) => p.code === patCode)?.name || 'Produto'}
              </strong>
              <span className="font-mono text-xs text-zinc-500 font-bold block">{patCode}</span>
            </div>
            {patImageUrl && (
              <img src={patImageUrl} alt="Padrão" className="w-12 h-12 rounded-xl object-cover border border-zinc-300 shadow-xs shrink-0" />
            )}
          </div>

          {/* 1. Características Organolépticas & Foto de Referência */}
          <div className="bg-zinc-50/50 p-4 rounded-2xl border border-zinc-200/80 space-y-4">
            <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              1. Características Organolépticas & Padrão Visual
            </span>

            {/* Aspecto */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Aspecto Padrão *</label>
              <input
                type="text"
                required
                placeholder="Ex: Creme Homogêneo, Líquido Viscoso..."
                value={patAspect}
                onChange={(e) => setPatAspect(e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {ASPECT_SUGGESTIONS.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setPatAspect(sug)}
                    className={cn(
                      "px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer",
                      patAspect === sug ? "bg-zinc-900 text-white font-bold" : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                    )}
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>

            {/* Cor e Odor em Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cor */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Cor Padrão *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Branco, Amarelo Claro, Incolor..."
                  value={patColor}
                  onChange={(e) => setPatColor(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {COLOR_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setPatColor(sug)}
                      className={cn(
                        "px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer",
                        patColor === sug ? "bg-zinc-900 text-white font-bold" : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                      )}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Odor */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Odor / Fragrância *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Característico, Floral, Herbal..."
                  value={patOdor}
                  onChange={(e) => setPatOdor(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {ODOR_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setPatOdor(sug)}
                      className={cn(
                        "px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer",
                        patOdor === sug ? "bg-zinc-900 text-white font-bold" : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                      )}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Foto de Referência Visual do Padrão */}
            <div className="space-y-2 border-t border-zinc-200 pt-3">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                Foto de Referência Visual do Padrão
              </label>
              
              <div className="flex items-center gap-4">
                {patImageUrl ? (
                  <div className="relative group w-24 h-24 rounded-2xl overflow-hidden border-2 border-zinc-300 shadow-sm shrink-0">
                    <img src={patImageUrl} alt="Preview do Padrão" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPatImageUrl('')}
                      className="absolute top-1 right-1 bg-rose-600 text-white p-1 rounded-full opacity-90 hover:opacity-100 transition-opacity cursor-pointer shadow"
                      title="Remover foto"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-white border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center text-zinc-400 shrink-0">
                    <ImageIcon className="w-6 h-6 mb-1 text-zinc-300" />
                    <span className="text-[9px] font-semibold">Sem foto</span>
                  </div>
                )}

                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3.5 py-2 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-800 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-zinc-600" />
                    {patImageUrl ? 'Trocar Foto Padrão' : 'Carregar Foto Padrão'}
                  </button>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Envie uma foto da amostra padrão física (em béquer ou frasco) para orientar os analistas durante o controle de qualidade.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Faixas Físico-Químicas */}
          <div className="bg-zinc-50/50 p-4 rounded-2xl border border-zinc-200/80 space-y-3">
            <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
              2. Faixas de Especificação Físico-Química
            </span>

            {/* pH */}
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

            {/* Viscosidade */}
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

            {/* Densidade */}
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

            {/* Embalagem */}
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
          </div>

          {/* 3. Agentes Corretivos Permitidos */}
          <div className="space-y-1.5 border-t border-zinc-200 pt-3">
            <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
              Agentes Corretivos Permitidos para este Produto
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

          {/* Botões do Rodapé */}
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

      {/* Modal de Zoom da Foto Padrão */}
      <Modal
        isOpen={!!zoomImage}
        onClose={() => setZoomImage(null)}
        title={zoomImage?.title || 'Foto de Referência'}
        subtitle="Amostra padrão visual física"
        size="md"
      >
        {zoomImage && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden border border-zinc-200 bg-black flex items-center justify-center max-h-[70vh]">
              <img src={zoomImage.url} alt={zoomImage.title} className="max-w-full max-h-[70vh] object-contain" />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setZoomImage(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
