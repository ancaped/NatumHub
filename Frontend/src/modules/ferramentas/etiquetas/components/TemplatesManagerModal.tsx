import React, { useState, useRef } from 'react';
import { BookOpen, X, Check, Copy, Trash2, Download, Upload, Plus, Layers, Sparkles } from 'lucide-react';
import type { LabelTemplate } from '../lib/types';
import { DEFAULT_LABEL_TEMPLATES } from '../lib/defaultTemplates';

interface TemplatesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedTemplates: LabelTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (template: LabelTemplate) => void;
  onNewBlankTemplate?: () => void;
  onDeleteTemplate: (id: string) => void;
  onDuplicateTemplate: (template: LabelTemplate) => void;
  onImportTemplate: (template: LabelTemplate) => void;
}

export default function TemplatesManagerModal({
  isOpen,
  onClose,
  savedTemplates,
  activeTemplateId,
  onSelectTemplate,
  onNewBlankTemplate,
  onDeleteTemplate,
  onDuplicateTemplate,
  onImportTemplate,
}: TemplatesManagerModalProps) {
  const [tab, setTab] = useState<'defaults' | 'custom'>('defaults');
  const importFileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExportJson = (t: LabelTemplate) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(t, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `etiqueta_${t.name.toLowerCase().replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && parsed.name && Array.isArray(parsed.elements_json)) {
          onImportTemplate(parsed);
        } else {
          alert('Arquivo JSON inválido para modelo de etiqueta.');
        }
      } catch (err) {
        alert('Erro ao processar arquivo JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const listToRender = tab === 'defaults' ? DEFAULT_LABEL_TEMPLATES : savedTemplates;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-zinc-900 text-white rounded-xl">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Galeria de Modelos de Etiquetas</h2>
              <p className="text-xs text-zinc-500">Escolha um modelo pronto (100x50mm) ou gerencie seus modelos salvos</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab switcher, New Blank Model & Import button */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setTab('defaults')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                tab === 'defaults' ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Modelos Padrão (100x50mm)
            </button>
            <button
              onClick={() => setTab('custom')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                tab === 'custom' ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Meus Modelos Salvos ({savedTemplates.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onNewBlankTemplate && (
              <button
                onClick={() => {
                  onNewBlankTemplate();
                  onClose();
                }}
                className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 px-3 py-1.5 rounded-xl text-xs cursor-pointer shadow-2xs transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Novo em Branco</span>
              </button>
            )}

            <button
              onClick={() => importFileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-900 border border-zinc-200 hover:bg-zinc-50 px-3 py-1.5 rounded-xl cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Importar JSON</span>
            </button>
          </div>

          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        {/* Template Cards List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {listToRender.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-xs">
              Nenhum modelo salvo ainda. Crie sua etiqueta e clique em "Salvar" na barra superior.
            </div>
          ) : (
            listToRender.map((t) => {
              const isActive = t.id === activeTemplateId;
              return (
                <div
                  key={t.id}
                  className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                    isActive
                      ? 'border-blue-500 bg-blue-50/40 shadow-xs'
                      : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/60'
                  }`}
                >
                  <div className="space-y-1 max-w-md">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-zinc-900">{t.name}</h4>
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
                        {t.width_mm} x {t.height_mm} mm
                      </span>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                          ATUALMENTE NO EDITOR
                        </span>
                      )}
                    </div>
                    {t.description && <p className="text-xs text-zinc-500">{t.description}</p>}
                    <p className="text-[10px] text-zinc-400 font-mono">
                      {t.elements_json.length} elementos configurados
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleExportJson(t)}
                      title="Exportar arquivo JSON"
                      className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors"
                    >
                      <Download className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => onDuplicateTemplate(t)}
                      title="Duplicar modelo"
                      className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors"
                    >
                      <Copy className="h-4 w-4" />
                    </button>

                    {!t.is_default && tab === 'custom' && (
                      <button
                        onClick={() => {
                          if (confirm(`Deseja realmente excluir o modelo "${t.name}"?`)) {
                            onDeleteTemplate(t.id);
                          }
                        }}
                        title="Excluir modelo"
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}

                    <button
                      onClick={() => {
                        onSelectTemplate(t);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Carregar</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
