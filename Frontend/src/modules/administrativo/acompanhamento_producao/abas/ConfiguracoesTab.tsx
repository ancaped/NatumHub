import React from 'react';
import { FileSpreadsheet, Download, Table, Building2, Boxes } from 'lucide-react';

export interface ConfiguracoesTabProps {
  handleExportExcel: () => void;
}

export default function ConfiguracoesTab({ handleExportExcel }: ConfiguracoesTabProps) {
  return (
<div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-200">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Configurações & Exportação</h2>
            <p className="text-xs text-zinc-500">
              Exporte dados e relatórios do acompanhamento de produção.
            </p>
          </div>

          {/* CARD 1: EXPORTAÇÃO EXCEL (.XLSX) */}
          <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-lg shadow-2xs">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">Exportar Planilha Excel (.xlsx)</h3>
                  <p className="text-xs text-zinc-500">
                    Gera um arquivo de planilha no formato Microsoft Excel (.xlsx) com 3 abas organizadas:
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
              >
                <Download className="h-4 w-4" />
                <span>Baixar Planilha Completa (.xlsx)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1">
                <span className="text-[11px] font-bold text-zinc-800 flex items-center gap-1.5">
                  <Table className="h-3.5 w-3.5 text-zinc-600" /> Aba 1: Lotes de Produção
                </span>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Lotes internos, quantidades em unidades e kg, status ERP, status nosso, previsão e histórico de datas.
                </p>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1">
                <span className="text-[11px] font-bold text-zinc-800 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-zinc-600" /> Aba 2: Terceirizados
                </span>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Lotes de terceirizados e solicitações em aberto com fornecedores e aprovações de insumos.
                </p>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1">
                <span className="text-[11px] font-bold text-zinc-800 flex items-center gap-1.5">
                  <Boxes className="h-3.5 w-3.5 text-amber-600" /> Aba 3: Ordens de Kits
                </span>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Ordens de montagem de kits com quantidades planejadas, montadas, operador e status.
                </p>
              </div>
            </div>
          </div>
        </div>
  );
}
