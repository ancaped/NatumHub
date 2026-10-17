import React, { useState, useMemo } from 'react';
import {
  Tag,
  Search,
  Printer,
  Sparkles,
  Edit2,
  Trash2,
  Plus,
  Box,
  Layers,
  FlaskConical,
  PackageCheck,
  ShieldAlert,
  Star,
  CheckCircle2,
  ArrowRight,
  Sliders,
  FileSpreadsheet,
} from 'lucide-react';
import type { LabelTemplate } from '../lib/types';

interface LabelsCatalogTabProps {
  templates: LabelTemplate[];
  currentUser: any;
  activeCategory?: string;
  onOpenSystemPrint: (template: LabelTemplate) => void;
  onOpenQuickPrint: (template: LabelTemplate) => void;
  onOpenEditor: (template: LabelTemplate) => void;
  onCreateNew: () => void;
  onDeleteTemplate: (id: string, name: string) => void;
}

export default function LabelsCatalogTab({
  templates,
  currentUser,
  activeCategory = 'all',
  onOpenSystemPrint,
  onOpenQuickPrint,
  onOpenEditor,
  onCreateNew,
  onDeleteTemplate,
}: LabelsCatalogTabProps) {
  const [search, setSearch] = useState('');

  // Category labels map
  const categoryLabels: Record<string, { label: string; badgeClass: string }> = {
    expedicao: { label: 'Caixas / Volumes', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
    producao: { label: 'Produtos Acabados', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    estoque: { label: 'Matérias-Primas', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
    embalagens: { label: 'Embalagens & Apoio', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200' },
    qualidade: { label: 'Controle de Qualidade', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
    custom: { label: 'Personalizada', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
  };

  // Filter templates
  const filteredTemplates = useMemo(() => {
    const list = Array.isArray(templates) ? templates : [];
    return list.filter((t) => {
      const name = t?.name || '';
      const desc = t?.description || '';
      const cat = t?.category || 'custom';

      const matchSearch =
        name.toLowerCase().includes(search.toLowerCase()) ||
        desc.toLowerCase().includes(search.toLowerCase()) ||
        cat.toLowerCase().includes(search.toLowerCase());

      const matchCat =
        !activeCategory ||
        activeCategory === 'all' ||
        activeCategory === 'cat_all' ||
        (activeCategory === 'cat_custom'
          ? cat === 'custom' || (!t.id?.startsWith('template_') && !t.is_default)
          : activeCategory === `cat_${cat}` || activeCategory === cat);

      return matchSearch && matchCat;
    });
  }, [templates, search, activeCategory]);

  return (
    <div className="space-y-4">
      {/* Top Search & Create Bar */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar modelo na lista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-900"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-xs font-mono text-zinc-500">
            {filteredTemplates.length} {filteredTemplates.length === 1 ? 'modelo' : 'modelos'}
          </span>

          <button
            type="button"
            onClick={onCreateNew}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Criar Nova Etiqueta</span>
          </button>
        </div>
      </div>

      {/* Templates List Table */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-600 font-bold uppercase text-[10px] tracking-wider">
              <th className="p-3.5">Modelo de Etiqueta</th>
              <th className="p-3.5">Categoria</th>
              <th className="p-3.5 text-center">Tamanho</th>
              <th className="p-3.5 text-center">Elementos</th>
              <th className="p-3.5">Descrição</th>
              <th className="p-3.5 text-right">Ações de Impressão e Edição</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 text-zinc-700">
            {filteredTemplates.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-zinc-400 text-xs">
                  Nenhum modelo de etiqueta encontrado nesta categoria.
                </td>
              </tr>
            ) : (
              filteredTemplates.map((tpl) => {
                const isCustom = tpl.category === 'custom' || (!tpl.id.startsWith('template_') && !tpl.is_default);
                const catInfo = categoryLabels[tpl.category] || {
                  label: tpl.category,
                  badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-200',
                };

                return (
                  <tr key={tpl.id} className="hover:bg-zinc-50/80 transition-colors">
                    {/* Template Name & Standard Badge */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-zinc-100 text-zinc-700 rounded-lg shrink-0">
                          <Tag className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-zinc-900">{tpl.name}</span>
                            {tpl.is_default && (
                              <span className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">
                                Padrão
                              </span>
                            )}
                          </div>
                          {tpl.created_at && (
                            <span className="text-[10px] text-zinc-400 font-mono block">
                              Criado em {new Date(tpl.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category Badge */}
                    <td className="p-3.5 whitespace-nowrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catInfo.badgeClass}`}
                      >
                        {catInfo.label}
                      </span>
                    </td>

                    {/* Size & Orientation */}
                    <td className="p-3.5 text-center whitespace-nowrap font-mono text-[11px] font-semibold text-zinc-800">
                      {tpl.width_mm}x{tpl.height_mm}mm
                      <span className="block text-[9px] text-zinc-400 font-sans">
                        {tpl.orientation === 'landscape' ? 'Paisagem' : 'Retrato'}
                      </span>
                    </td>

                    {/* Elements Count */}
                    <td className="p-3.5 text-center whitespace-nowrap font-mono text-[11px]">
                      <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded font-bold">
                        {Array.isArray(tpl.elements_json) ? tpl.elements_json.length : 0}
                      </span>
                    </td>

                    {/* Description */}
                    <td className="p-3.5 text-zinc-600 max-w-xs truncate">
                      {tpl.description || '-'}
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Auto-fill Print */}
                        <button
                          type="button"
                          onClick={() => onOpenSystemPrint(tpl)}
                          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs active:scale-98"
                          title="Imprimir preenchendo automaticamente Produto e Lote"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>Auto-Fill</span>
                        </button>

                        {/* Quick Print */}
                        <button
                          type="button"
                          onClick={() => onOpenQuickPrint(tpl)}
                          className="flex items-center gap-1 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                          title="Impressão direta rápida"
                        >
                          <Printer className="h-3 w-3" />
                          <span>Imprimir</span>
                        </button>

                        {/* Edit in Studio */}
                        <button
                          type="button"
                          onClick={() => onOpenEditor(tpl)}
                          className="p-1.5 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-lg cursor-pointer transition-colors"
                          title="Editar layout no estúdio"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Delete if custom */}
                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => onDeleteTemplate(tpl.id, tpl.name)}
                            className="p-1.5 bg-white hover:bg-red-50 text-zinc-400 hover:text-red-600 border border-zinc-200 rounded-lg cursor-pointer transition-colors"
                            title="Excluir modelo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
