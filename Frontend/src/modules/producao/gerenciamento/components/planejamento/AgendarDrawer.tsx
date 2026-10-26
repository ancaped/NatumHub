import React from 'react';
import { Plus, Search, Sparkles, X } from 'lucide-react';
import Drawer from '../../../../geral/components/ui/Drawer';
import { unidadesDeKg, ehBaseProduto } from '../../../lib/unitConversion';
import { getProductProcessType } from '../../../lib/processoProduto';
import type { ReatorConfig } from '../PlanejamentoSemanalTab';
import type { DiaSemana, ScheduleModalItem, Setter } from './tiposDrawers';

interface AgendarDrawerProps {
  products: any[];
  reatores: ReatorConfig[];
  weekDays: DiaSemana[];
  sameFormulaProducts: any[];
  loadingSameFormula: boolean;
  scheduleSearch: string;
  setScheduleSearch: Setter<string>;
  scheduleSelectedProducts: any[];
  setScheduleSelectedProducts: Setter<any[]>;
  scheduleItemMasses: Record<string, number>;
  scheduleQty: number;
  scheduleReator: string;
  setScheduleReator: Setter<string>;
  scheduleDate: string;
  setScheduleDate: Setter<string>;
  scheduleRecipienteDetalhe: string;
  setScheduleRecipienteDetalhe: Setter<string>;
  setScheduleModalItem: Setter<ScheduleModalItem | null>;
  handleAddProductToSchedule: (prod: any) => void;
  handleRemoveProductFromSchedule: (codigo: string) => void;
  handleChangeItemMass: (codigo: string, mass: number) => void;
  handleChangeTotalMass: (newTotal: number) => void;
  handleConfirmSchedule: () => Promise<void>;
}

export function AgendarDrawer({
  products,
  reatores,
  weekDays,
  sameFormulaProducts,
  loadingSameFormula,
  scheduleSearch,
  setScheduleSearch,
  scheduleSelectedProducts,
  setScheduleSelectedProducts,
  scheduleItemMasses,
  scheduleQty,
  scheduleReator,
  setScheduleReator,
  scheduleDate,
  setScheduleDate,
  scheduleRecipienteDetalhe,
  setScheduleRecipienteDetalhe,
  setScheduleModalItem,
  handleAddProductToSchedule,
  handleRemoveProductFromSchedule,
  handleChangeItemMass,
  handleChangeTotalMass,
  handleConfirmSchedule,
}: AgendarDrawerProps) {
  return (
    <Drawer isOpen onClose={() => {
      setScheduleModalItem(null);
      setScheduleSelectedProducts([]);
      setScheduleSearch('');
    }} title="Agendar Batelada no Quadro" size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              setScheduleModalItem(null);
              setScheduleSelectedProducts([]);
              setScheduleSearch('');
            }}
            className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={scheduleSelectedProducts.length === 0}
            onClick={handleConfirmSchedule}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg shadow-xs cursor-pointer ${
              scheduleSelectedProducts.length === 0
                ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white'
            }`}
          >
            Confirmar Agendamento ({scheduleSelectedProducts.length})
          </button>
        </>
      }
    >

        {/* Barra de Pesquisa de Produtos */}
        <div className="space-y-1.5">
          <label className="font-semibold text-zinc-700 text-xs block">
            {scheduleSelectedProducts.length === 0
              ? 'Buscar e Selecionar Produto Principal:'
              : 'Adicionar Produto na Mesma Ordem (Exata Mesma Formulação Química):'}
          </label>
          <div className="relative">
            <div className="flex items-center gap-2 border border-zinc-300 rounded-lg px-2.5 py-1.5 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
              <Search size={14} className="text-zinc-400 shrink-0" />
              <input
                type="text"
                placeholder={scheduleSelectedProducts.length === 0
                  ? "Digite nome ou código (ex: Creme, Shampoo, 8.11...)"
                  : "Buscar produto da mesma fórmula..."}
                value={scheduleSearch}
                onChange={(e) => setScheduleSearch(e.target.value)}
                className="w-full text-xs bg-transparent focus:outline-none font-medium text-zinc-800"
                autoFocus={scheduleSelectedProducts.length === 0}
              />
              {scheduleSearch && (
                <button
                  type="button"
                  onClick={() => setScheduleSearch('')}
                  className="text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Dropdown de Resultados da Pesquisa */}
            {scheduleSearch.trim().length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-zinc-200 max-h-56 overflow-y-auto z-50 divide-y divide-zinc-100">
                {(() => {
                  const term = scheduleSearch.toLowerCase();
                  const sourcePool = scheduleSelectedProducts.length > 0
                    ? products.filter(p => sameFormulaProducts.some(sf => sf.codigo === p.codigo))
                    : products;
                  const results = sourcePool.filter(p => 
                    (p.descricao || '').toLowerCase().includes(term) ||
                    (p.codigo || '').toLowerCase().includes(term)
                  ).slice(0, 10);

                  if (results.length === 0) {
                    return (
                      <div className="p-3 text-center text-xs text-zinc-500">
                        {scheduleSelectedProducts.length > 0
                          ? `Nenhum produto com a exata mesma formulação encontrado para "${scheduleSearch}".`
                          : `Nenhum produto encontrado para "${scheduleSearch}".`}
                      </div>
                    );
                  }

                  return results.map(p => {
                    const isAlreadySelected = scheduleSelectedProducts.some(x => x.codigo === p.codigo);
                    const isLimitReached = scheduleSelectedProducts.length >= 4;

                    return (
                      <div
                        key={p.codigo}
                        className="p-2.5 hover:bg-zinc-50 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-zinc-900 truncate">{p.descricao}</div>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                            <span className="font-mono">{p.codigo}</span>
                            {p.base && <span>• Base: <strong>{p.base}</strong></span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isAlreadySelected || isLimitReached}
                          onClick={() => {
                            handleAddProductToSchedule(p);
                            setScheduleSearch('');
                          }}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold shrink-0 cursor-pointer transition-colors ${
                            isAlreadySelected
                              ? 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed'
                              : isLimitReached
                              ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                              : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs'
                          }`}
                        >
                          {isAlreadySelected ? 'Já incluído' : '+ Adicionar'}
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Sugestões Rápidas: Exata Mesma Formulação Química */}
        {scheduleSelectedProducts.length > 0 && scheduleSelectedProducts.length < 4 && (() => {
          const availableCandidates = sameFormulaProducts.filter(sf => 
            !scheduleSelectedProducts.some(sel => sel.codigo === sf.codigo)
          );

          if (availableCandidates.length === 0) {
            return (
              <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs text-zinc-500 flex items-center gap-1.5">
                <Sparkles size={13} className="text-zinc-400 shrink-0" />
                <span>
                  {loadingSameFormula 
                    ? 'Verificando formulações químicas compatíveis...' 
                    : 'Não há outros produtos com a exata mesma formulação química (mesmas matérias-primas e proporções) para agendar em conjunto.'}
                </span>
              </div>
            );
          }

          return (
            <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-lg space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-blue-900 text-[11px]">
                <Sparkles size={13} className="text-blue-600" />
                <span>Exata Mesma Formulação Química ({availableCandidates.length} disponíveis):</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableCandidates.slice(0, 6).map(cand => {
                  const fullProd = products.find(p => p.codigo === cand.codigo) || cand;
                  return (
                    <button
                      key={cand.codigo}
                      type="button"
                      onClick={() => handleAddProductToSchedule(fullProd)}
                      className="text-[11px] px-2 py-1 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-md font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      title="Adicionar à batelada conjunta"
                    >
                      <Plus size={12} className="text-blue-600" />
                      <span className="truncate max-w-[200px]">{cand.descricao} ({cand.codigo})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Lista dos Produtos Selecionados na Ordem de Produção */}
        {scheduleSelectedProducts.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-800">
              <span>Itens na Ordem de Produção ({scheduleSelectedProducts.length}/4):</span>
              <span className="text-[11px] text-zinc-500 font-normal">
                {scheduleSelectedProducts.length > 1 ? 'Ajuste os kg individuais de cada um abaixo' : '100% da ordem'}
              </span>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {scheduleSelectedProducts.map((p) => {
                const currentItemKg = scheduleItemMasses[p.codigo] !== undefined 
                  ? scheduleItemMasses[p.codigo] 
                  : Number((scheduleQty / scheduleSelectedProducts.length).toFixed(1));
                const itemYield = unidadesDeKg(currentItemKg, p.descricao, ehBaseProduto(p));
                const pct = scheduleQty > 0 ? Math.round((currentItemKg / scheduleQty) * 100) : 0;
                const procP = getProductProcessType(p);

                return (
                  <div
                    key={p.codigo}
                    className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-zinc-900 truncate" title={p.descricao}>{p.descricao}</div>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                        <span className="font-mono font-medium">{p.codigo}</span>
                        {p.base && <span>• Base: <strong>{p.base}</strong></span>}
                        <span>• {pct}% da ordem</span>
                        <span className="text-[9px] text-zinc-400">({procP.label})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1">
                          <label className="text-[10px] text-zinc-500 font-medium">Qtd:</label>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={currentItemKg}
                            onChange={(e) => handleChangeItemMass(p.codigo, Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-20 px-2 py-1 text-right font-bold text-xs bg-white border border-zinc-300 rounded-md focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                          <span className="text-xs font-semibold text-zinc-700">kg</span>
                        </div>
                        <span className="text-[10px] text-blue-700 font-bold mt-0.5">
                          {itemYield == null ? '— un' : `~${itemYield.toLocaleString('pt-BR')} un`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveProductFromSchedule(p.codigo)}
                        className="p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors"
                        title="Remover produto da ordem"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 bg-zinc-50 border border-dashed border-zinc-200 rounded-lg text-center text-xs text-zinc-500">
            Digite no campo acima para pesquisar e selecionar o(s) produto(s) da ordem de produção.
          </div>
        )}

        {/* Parâmetros do Agendamento */}
        <div className="flex flex-col gap-3 text-xs pt-1 border-t border-zinc-150">
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">Dia da Semana:</label>
            <select
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs"
            >
              {weekDays.map(d => (
                <option key={d.dateStr} value={d.dateStr} disabled={!!d.holiday}>
                  {d.label} ({d.dateStr.split('-').slice(1).reverse().join('/')}) {d.holiday ? `— Feriado: ${d.holiday.name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">Equipamento / Reator de Produção:</label>
            <select
              value={scheduleReator}
              onChange={(e) => {
                const rId = e.target.value;
                setScheduleReator(rId);
                if (rId === 'BOMBONAS') {
                  setScheduleRecipienteDetalhe('Bombona 50kg');
                } else {
                  setScheduleRecipienteDetalhe('Reator');
                }
              }}
              className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs"
            >
              {reatores.filter(r => r.ativo).map(r => (
                <option key={r.id} value={r.id}>
                  {r.nome} ({r.id === 'BOMBONAS' ? '50/100/200 kg' : `${r.capacidade_kg} kg`})
                </option>
              ))}
            </select>
          </div>

          {scheduleReator === 'BOMBONAS' && (
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Recipiente da Bombona:</label>
              <select
                value={scheduleRecipienteDetalhe}
                onChange={(e) => {
                  setScheduleRecipienteDetalhe(e.target.value);
                }}
                className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-800"
              >
                <option value="Bombona 50kg">Bombona 50 kg (Mistura rápida a frio)</option>
                <option value="Bombona 100kg">Bombona 100 kg (Mistura / Água Quente da Caldeira)</option>
                <option value="Bombona 200kg">Bombona 200 kg (Bases / Água Quente da Caldeira)</option>
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-zinc-700">Massa Total da Ordem (kg):</label>
              {scheduleSelectedProducts.length > 1 && (
                <span className="text-[10px] text-zinc-500">
                  (Soma automática dos {scheduleSelectedProducts.length} itens)
                </span>
              )}
            </div>
            <input
              type="number"
              value={scheduleQty}
              onChange={(e) => handleChangeTotalMass(Number(e.target.value))}
              className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs font-bold"
            />
            {scheduleSelectedProducts.length > 1 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-zinc-600">
                {scheduleSelectedProducts.map(p => {
                  const m = scheduleItemMasses[p.codigo] ?? (scheduleQty / scheduleSelectedProducts.length);
                  return (
                    <span key={p.codigo} className="px-2 py-0.5 bg-zinc-100 rounded text-zinc-700 border border-zinc-200">
                      {p.codigo}: <strong className="text-blue-700">{Number(m).toFixed(1)} kg</strong>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
    </Drawer>
  );
}
