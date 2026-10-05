import React, { useState, useEffect } from 'react';
import { Printer, Check, Wifi, AlertCircle, RefreshCw, ChevronDown } from 'lucide-react';
import { printersApi } from '../../impressoras/lib/printersApi';
import type { HubPrinter } from '../../impressoras/lib/types';

interface PrinterSelectorProps {
  selectedPrinter: HubPrinter | null;
  onSelectPrinter: (printer: HubPrinter | null) => void;
  className?: string;
}

const LOCAL_STORAGE_PRINTER_KEY = 'natumhub_selected_printer_id';

export default function PrinterSelector({
  selectedPrinter,
  onSelectPrinter,
  className = '',
}: PrinterSelectorProps) {
  const [printers, setPrinters] = useState<HubPrinter[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const fetchPrinters = async () => {
    try {
      setLoading(true);
      const list = await printersApi.listPrinters();
      setPrinters(list);

      // Auto-select stored printer or default printer
      if (list.length > 0 && !selectedPrinter) {
        const storedId = localStorage.getItem(LOCAL_STORAGE_PRINTER_KEY);
        const match = list.find((p) => p.id === storedId) || list.find((p) => p.is_default) || list[0];
        if (match) {
          onSelectPrinter(match);
        }
      }
    } catch (e) {
      console.warn('Não foi possível carregar lista de impressoras:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrinters();
  }, []);

  const handleSelect = (printer: HubPrinter) => {
    onSelectPrinter(printer);
    try {
      localStorage.setItem(LOCAL_STORAGE_PRINTER_KEY, printer.id);
    } catch (_) {}
    setIsOpen(false);
  };

  return (
    <div className={`relative text-xs ${className}`}>
      <label className="text-[11px] font-bold text-zinc-700 flex items-center justify-between mb-1">
        <span className="flex items-center gap-1">
          <Printer className="h-3.5 w-3.5 text-zinc-500" />
          <span>Impressora de Destino:</span>
        </span>
        {selectedPrinter && (
          <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 font-normal">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                selectedPrinter.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-400'
              }`}
            />
            {selectedPrinter.status === 'online' ? 'Online' : 'Pronta'}
          </span>
        )}
      </label>

      {/* Selector Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2.5 bg-zinc-50 hover:bg-zinc-100/80 border border-zinc-300 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`p-1.5 rounded-lg ${
              selectedPrinter ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-600'
            }`}
          >
            <Printer className="h-3.5 w-3.5" />
          </div>

          <div className="min-w-0">
            <div className="font-bold text-zinc-900 truncate">
              {selectedPrinter ? selectedPrinter.name : 'Impressora Padrão do Windows'}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono truncate">
              {selectedPrinter
                ? `${selectedPrinter.system_printer_name || selectedPrinter.ip_address || 'Spooler Local'} · ${selectedPrinter.default_width_mm}x${selectedPrinter.default_height_mm}mm`
                : 'Diálogo nativo do navegador'}
            </div>
          </div>
        </div>

        <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0 ml-2" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 p-1.5 max-h-60 overflow-y-auto space-y-1 animate-in fade-in duration-100">
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-100 flex items-center justify-between">
            <span>Impressoras Disponíveis</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fetchPrinters();
              }}
              className="text-zinc-500 hover:text-zinc-900 p-0.5"
              title="Atualizar lista"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {printers.length === 0 ? (
            <div className="p-3 text-center text-xs text-zinc-400">
              Nenhuma impressora personalizada cadastrada. Usando impressora padrão do sistema.
            </div>
          ) : (
            printers.map((p) => {
              const isSelected = selectedPrinter?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className={`w-full p-2 rounded-xl text-left transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 text-white'
                      : 'hover:bg-zinc-100 text-zinc-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs truncate">{p.name}</span>
                      {p.is_default && (
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                            isSelected ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          Padrão
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[10px] font-mono truncate ${
                        isSelected ? 'text-zinc-300' : 'text-zinc-400'
                      }`}
                    >
                      {p.system_printer_name || p.location || 'Local'} · {p.default_width_mm}x{p.default_height_mm}mm
                    </div>
                  </div>

                  {isSelected && <Check className="h-4 w-4 text-white shrink-0 ml-2" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
