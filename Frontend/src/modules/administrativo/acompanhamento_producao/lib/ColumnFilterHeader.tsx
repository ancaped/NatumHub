import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { cn } from '../../../geral/lib/utils';

export interface ColumnOption {
  value: string;
  label: string;
  count?: number;
}

export interface ColumnFilterHeaderProps {
  label?: string;
  title?: string;
  columnKey: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: any) => void;
  options?: ColumnOption[];
  allValues?: ColumnOption[];
  selectedValues?: Set<string>;
  onFilterChange?: (columnKey: string, newSelected: Set<string> | undefined) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export function ColumnFilterHeader({
  label,
  title,
  columnKey,
  sortField,
  sortOrder,
  onSort,
  options,
  allValues,
  selectedValues,
  onFilterChange,
  align = 'left',
  className = '',
}: ColumnFilterHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const popoverRef = useRef<HTMLTableCellElement>(null);

  const displayTitle = label || title || '';
  const availableOptions = options || allValues || [];

  const isFiltered = Boolean(selectedValues !== undefined);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!searchVal.trim()) return availableOptions;
    const raw = searchVal.trim().toLowerCase();
    const q = raw.replace(/^#/, '');

    if (columnKey === 'loteNumber' || /^\d+$/.test(q)) {
      const qNoZero = q.replace(/^0+/, '');
      // 1. Correspondência exata de lote
      const exact = availableOptions.filter(opt => {
        const val = (opt.value || opt.label || '').toLowerCase().replace(/^#/, '');
        return val === q || (qNoZero !== '' && val.replace(/^0+/, '') === qNoZero);
      });
      if (exact.length > 0) return exact;

      // 2. Prefixo de lote (startsWith)
      const prefix = availableOptions.filter(opt => {
        const val = (opt.value || opt.label || '').toLowerCase().replace(/^#/, '');
        return val.startsWith(q) || (qNoZero !== '' && val.replace(/^0+/, '').startsWith(qNoZero));
      });
      if (prefix.length > 0) return prefix;
    }

    return availableOptions.filter(opt =>
      (opt.label || '').toLowerCase().includes(raw) || (opt.value || '').toLowerCase().includes(raw)
    );
  }, [availableOptions, searchVal, columnKey]);

  const toggleValue = (val: string) => {
    if (!onFilterChange) return;
    const current = selectedValues || new Set(availableOptions.map(a => a.value));
    const next = new Set(current);
    if (next.has(val)) {
      next.delete(val);
    } else {
      next.add(val);
    }
    if (next.size === availableOptions.length) {
      onFilterChange(columnKey, undefined);
    } else {
      onFilterChange(columnKey, next);
    }
  };

  const handleSelectOnly = (val: string) => {
    if (onFilterChange) {
      onFilterChange(columnKey, new Set([val]));
    }
  };

  const handleSelectAll = () => {
    if (searchVal.trim()) {
      if (onFilterChange) {
        const current = selectedValues ? new Set(selectedValues) : new Set(availableOptions.map(a => a.value));
        filteredOptions.forEach(o => current.add(o.value));
        if (current.size === availableOptions.length) {
          onFilterChange(columnKey, undefined);
        } else {
          onFilterChange(columnKey, current);
        }
      }
    } else {
      if (onFilterChange) onFilterChange(columnKey, undefined);
    }
  };

  const handleClearAll = () => {
    if (searchVal.trim()) {
      if (onFilterChange) {
        const current = selectedValues ? new Set(selectedValues) : new Set(availableOptions.map(a => a.value));
        filteredOptions.forEach(o => current.delete(o.value));
        onFilterChange(columnKey, current);
      }
    } else {
      if (onFilterChange) onFilterChange(columnKey, new Set());
    }
  };

  const displayedOptions = useMemo(() => filteredOptions.slice(0, 100), [filteredOptions]);

  return (
    <th
      ref={popoverRef}
      className={cn(
        "py-3 px-3 relative select-none font-bold text-[11px] uppercase tracking-wider text-zinc-600",
        align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left',
        className
      )}
    >
      <div className={cn(
        "flex items-center gap-1.5",
        align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-between'
      )}>
        {onSort ? (
          <button
            type="button"
            onClick={() => onSort(columnKey)}
            className="flex items-center gap-1 hover:text-zinc-900 transition-colors cursor-pointer group truncate"
          >
            <span className={cn(sortField === columnKey ? "text-zinc-900 font-extrabold" : "")}>{displayTitle}</span>
            {sortField === columnKey ? (
              <span className="text-zinc-900 font-bold text-xs">{sortOrder === 'asc' ? '▲' : '▼'}</span>
            ) : (
              <span className="text-zinc-300 opacity-0 group-hover:opacity-100 text-xs transition-opacity">↕</span>
            )}
          </button>
        ) : (
          <span className="truncate">{displayTitle}</span>
        )}

        {onFilterChange && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(prev => !prev);
            }}
            className={cn(
              "p-1 rounded-md transition-all cursor-pointer flex items-center gap-1 shrink-0 ml-auto",
              isFiltered
                ? "bg-indigo-600 text-white shadow-xs hover:bg-indigo-700"
                : "text-zinc-400 hover:text-zinc-800 bg-zinc-100/90 hover:bg-zinc-200 border border-zinc-200/80"
            )}
            title={`Filtrar coluna: ${displayTitle}`}
          >
            <Filter className={cn("h-3 w-3", isFiltered ? "text-white" : "text-zinc-500")} />
            {isFiltered && (
              <span className="text-[9px] font-mono font-bold leading-none bg-indigo-800 px-1 py-0.5 rounded">
                {selectedValues!.size}
              </span>
            )}
          </button>
        )}
      </div>

      {isOpen && onFilterChange && (
        <div
          className={cn(
            "absolute z-50 top-full mt-1.5 min-w-[240px] max-w-xs bg-white rounded-xl border border-zinc-200 shadow-2xl p-3 text-left normal-case tracking-normal font-normal text-xs animate-in fade-in zoom-in-95 duration-150",
            align === 'right' ? "right-0 left-auto" : "left-0"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100 font-bold text-zinc-900 text-xs">
            <span className="truncate">Filtrar: {displayTitle}</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {availableOptions.length > 5 && (
            <div className="relative my-2">
              <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Buscar valor..."
                className="w-full pl-7 pr-2.5 py-1 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:bg-white focus:ring-1 focus:ring-zinc-900"
                autoFocus
              />
            </div>
          )}

          <div className="flex items-center justify-between py-1.5 px-0.5 text-[11px] text-zinc-500">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
            >
              Selecionar Todos
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
            >
              Limpar
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-0.5 py-1 pr-1">
            {displayedOptions.length === 0 ? (
              <p className="text-zinc-400 text-center py-3 text-[11px]">Nenhum valor disponível</p>
            ) : (
              <>
                {displayedOptions.map((opt) => {
                  const checked = !selectedValues || selectedValues.has(opt.value);
                  return (
                    <div
                      key={opt.value}
                      className="flex items-center justify-between group/opt px-2 py-1 hover:bg-zinc-100 rounded-lg cursor-pointer text-zinc-700 hover:text-zinc-900 text-xs transition-colors"
                    >
                      <label className="flex items-center gap-2 truncate flex-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleValue(opt.value)}
                          className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="truncate" title={opt.label}>{opt.label}</span>
                      </label>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSelectOnly(opt.value);
                          }}
                          className="opacity-0 group-hover/opt:opacity-100 text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline px-1 py-0.5 rounded transition-opacity cursor-pointer font-semibold"
                          title={`Filtrar somente por "${opt.label}"`}
                        >
                          Somente
                        </button>
                        {opt.count !== undefined && (
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {opt.count}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredOptions.length > 100 && (
                  <div className="pt-2 pb-1 text-center">
                    <p className="text-[10px] text-zinc-400 font-medium">
                      Exibindo 100 de {filteredOptions.length} opções (utilize a busca para refinar)
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </th>
  );
}
