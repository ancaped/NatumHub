import React, { useState, useRef } from 'react';
import { Check, Copy, Trash2, Download, Upload, Plus } from 'lucide-react';
import type { LabelTemplate } from '../lib/types';
import { DEFAULT_LABEL_TEMPLATES } from '../lib/defaultTemplates';
import Drawer from '../../../geral/components/ui/Drawer';

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

const BTN_SECUNDARIO =
  'inline-flex items-center gap-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs h-8 px-2.5 cursor-pointer transition-colors';
const BTN_PRIMARIO =
  'inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs h-8 px-2.5 cursor-pointer transition-colors';

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
    <Drawer
      onClose={onClose}
      title="Galeria de Modelos de Etiquetas"
      subtitle="Escolha um modelo pronto (100x50mm) ou gerencie seus modelos salvos"
      size="lg"
      tabs={[
        { id: 'defaults', label: 'Modelos Padrão (100x50mm)' },
        { id: 'custom', label: 'Meus Modelos Salvos', badge: savedTemplates.length },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as 'defaults' | 'custom')}
    >
      <div className="space-y-3 -mt-2">
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {onNewBlankTemplate && (
            <button
              type="button"
              onClick={() => {
                onNewBlankTemplate();
                onClose();
              }}
              className={BTN_SECUNDARIO}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Novo em Branco</span>
            </button>
          )}

          <button type="button" onClick={() => importFileRef.current?.click()} className={BTN_SECUNDARIO}>
            <Upload className="h-3.5 w-3.5" />
            <span>Importar JSON</span>
          </button>

          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        {listToRender.length === 0 ? (
          <div className="py-12 text-center text-zinc-400 text-xs">
            Nenhum modelo salvo ainda. Crie sua etiqueta e clique em "Salvar" na barra superior.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden">
            {listToRender.map((t) => {
              const isActive = t.id === activeTemplateId;
              return (
                <div
                  key={t.id}
                  className={`px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                    isActive ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-semibold text-zinc-900">{t.name}</h4>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 text-zinc-600 border border-zinc-200">
                        {t.width_mm} x {t.height_mm} mm
                      </span>
                      {isActive && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-900 text-white">
                          No editor
                        </span>
                      )}
                    </div>
                    {t.description && <p className="text-xs text-zinc-500">{t.description}</p>}
                    <p className="text-[10px] text-zinc-400 font-mono">
                      {t.elements_json.length} elementos configurados
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportJson(t)}
                      title="Exportar arquivo JSON"
                      className={BTN_SECUNDARIO}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDuplicateTemplate(t)}
                      title="Duplicar modelo"
                      className={BTN_SECUNDARIO}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>

                    {!t.is_default && tab === 'custom' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Deseja realmente excluir o modelo "${t.name}"?`)) {
                            onDeleteTemplate(t.id);
                          }
                        }}
                        title="Excluir modelo"
                        className={BTN_SECUNDARIO}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onSelectTemplate(t);
                        onClose();
                      }}
                      className={BTN_PRIMARIO}
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Carregar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
}
