import React from 'react';
import { Check, Flame, RefreshCw, Snowflake } from 'lucide-react';
import Drawer from '../../../../geral/components/ui/Drawer';
import { parseProductUnitWeightKg } from '../../../lib/unitConversion';
import type { ReatorConfig } from '../PlanejamentoSemanalTab';
import type { DiaSemana, Setter, TechnicalModalItem } from './tiposDrawers';

interface ParametrosBateladaDrawerProps {
  technicalModalItem: TechnicalModalItem;
  setTechnicalModalItem: Setter<TechnicalModalItem | null>;
  reatores: ReatorConfig[];
  weekDays: DiaSemana[];
  handleSaveTechnicalModal: () => Promise<void>;
}

export function ParametrosBateladaDrawer({
  technicalModalItem,
  setTechnicalModalItem,
  reatores,
  weekDays,
  handleSaveTechnicalModal,
}: ParametrosBateladaDrawerProps) {
  return (
    <Drawer isOpen onClose={() => setTechnicalModalItem(null)} title="Configurações da Batelada" subtitle={technicalModalItem.item.codigo_produto} size="md"
      footer={
        <>
          <button
            type="button"
            onClick={() => setTechnicalModalItem(null)}
            className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveTechnicalModal}
            className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <Check size={14} />
            <span>Salvar Configurações</span>
          </button>
        </>
      }
    >

        {/* Identificação do Produto */}
        <div className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
          <strong className="text-zinc-900 block text-xs leading-snug">
            {technicalModalItem.item.descricao || technicalModalItem.item.codigo_produto}
          </strong>
        </div>

        {/* 1. Processo Térmico & Aquecimento */}
        <div className="space-y-1.5">
          <label className="font-bold text-zinc-800 text-xs flex items-center gap-1.5">
            <span>Processo Térmico & Aquecimento:</span>
          </label>
          
          {/* Escolha Principal: Frio vs Quente */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setTechnicalModalItem({ 
                ...technicalModalItem, 
                processoTermico: 'frio',
                recipienteDetalhe: technicalModalItem.reatorId === 'BOMBONAS' ? 'Bombona 50kg' : 'Reator'
              })}
              className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                technicalModalItem.processoTermico === 'frio'
                  ? 'bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-200 font-bold'
                  : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <Snowflake size={16} className="text-blue-500 shrink-0" />
              <div>
                <div className="font-bold">A Frio (Mistura)</div>
                <div className="text-[10px] text-zinc-500 font-normal">Homogeneização direta</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                if (technicalModalItem.processoTermico === 'frio') {
                  setTechnicalModalItem({ 
                    ...technicalModalItem, 
                    processoTermico: 'caldeira' 
                  });
                }
              }}
              className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                technicalModalItem.processoTermico !== 'frio'
                  ? 'bg-orange-50 border-orange-400 text-orange-900 ring-2 ring-orange-200 font-bold'
                  : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <Flame size={16} className="text-orange-500 shrink-0" />
              <div>
                <div className="font-bold">A Quente</div>
                <div className="text-[10px] text-zinc-500 font-normal">Aquecimento / Emulsão</div>
              </div>
            </button>
          </div>

          {/* Sub-processos térmicos com parametrização automática de equipamento */}
          {technicalModalItem.processoTermico !== 'frio' && (
            <div className="p-2.5 bg-orange-50/50 border border-orange-200 rounded-lg space-y-1.5 mt-2">
              <span className="text-[11px] font-bold text-orange-950 block">Selecione o Tipo de Processo Quente:</span>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTechnicalModalItem({
                    ...technicalModalItem,
                    processoTermico: 'agua_caldeira',
                    reatorId: 'BOMBONAS',
                    recipienteDetalhe: 'Bombona 100kg',
                  })}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                    technicalModalItem.processoTermico === 'agua_caldeira' || technicalModalItem.reatorId === 'BOMBONAS'
                      ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold ring-1 ring-amber-300'
                      : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <div className="text-xs font-bold">Bombona (Água Caldeira)</div>
                  <div className="text-[10px] text-zinc-500 font-normal">Usa água aquecida da caldeira</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTechnicalModalItem({
                    ...technicalModalItem,
                    processoTermico: 'resistencia',
                    reatorId: 'R_100',
                    recipienteDetalhe: 'Reator',
                  })}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                    technicalModalItem.processoTermico === 'resistencia' || technicalModalItem.reatorId === 'R_100'
                      ? 'bg-zinc-900 border-zinc-900 text-white font-bold'
                      : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <div className="text-xs font-bold">Tanque Resistência (R-100)</div>
                  <div className="text-[10px] text-zinc-500 font-normal">R-100 aquecimento elétrico</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTechnicalModalItem({
                    ...technicalModalItem,
                    processoTermico: 'quente',
                    reatorId: 'R_40',
                    recipienteDetalhe: 'Reator 40kg',
                  })}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                    technicalModalItem.reatorId === 'R_40'
                      ? 'bg-zinc-900 border-zinc-900 text-white font-bold'
                      : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <div className="text-xs font-bold">Panela 40kg (R-40)</div>
                  <div className="text-[10px] text-zinc-500 font-normal">Produção piloto / pequena</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const defaultReator = reatores.find(r => r.ativo && r.id !== 'BOMBONAS' && r.id !== 'R_40' && r.id !== 'R_100')?.id || 'R_500';
                    setTechnicalModalItem({
                      ...technicalModalItem,
                      processoTermico: 'caldeira',
                      reatorId: (technicalModalItem.reatorId === 'BOMBONAS' || technicalModalItem.reatorId === 'R_40' || technicalModalItem.reatorId === 'R_100') ? defaultReator : technicalModalItem.reatorId,
                      recipienteDetalhe: 'Reator',
                    });
                  }}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                    technicalModalItem.processoTermico === 'caldeira' && technicalModalItem.reatorId !== 'BOMBONAS' && technicalModalItem.reatorId !== 'R_40' && technicalModalItem.reatorId !== 'R_100'
                      ? 'bg-red-100 border-red-400 text-red-950 font-bold ring-1 ring-red-300'
                      : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <div className="text-xs font-bold">Reator Caldeira (Vapor)</div>
                  <div className="text-[10px] text-zinc-500 font-normal">Reatores industriais a vapor</div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. Origem da Formulação / Uso de Base */}
        <div className="space-y-1.5 pt-1 border-t border-zinc-150">
          <label className="font-bold text-zinc-800 text-xs">Origem da Formulação:</label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setTechnicalModalItem({ ...technicalModalItem, origemFormulacao: 'completa' })}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                technicalModalItem.origemFormulacao === 'completa'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-200 font-bold'
                  : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <div className="font-bold">Produção Completa</div>
              <div className="text-[10px] text-zinc-500 font-normal">Fabricação do zero (Granel)</div>
            </button>

            <button
              type="button"
              onClick={() => setTechnicalModalItem({ ...technicalModalItem, origemFormulacao: 'base' })}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                technicalModalItem.origemFormulacao === 'base'
                  ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-200 font-bold'
                  : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <div className="font-bold">Usar Base Pronta</div>
              <div className="text-[10px] text-zinc-500 font-normal">Diluição / Aditivação de base</div>
            </button>
          </div>

          {technicalModalItem.origemFormulacao === 'base' && (
            <div className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg text-xs space-y-1.5 mt-1">
              <label className="font-semibold text-amber-950 text-[11px] block">Código / Descrição da Base:</label>
              <input
                type="text"
                placeholder="Ex: BASE MASCARA, 8.11.002..."
                value={technicalModalItem.baseCodigo}
                onChange={(e) => setTechnicalModalItem({ 
                  ...technicalModalItem, 
                  baseCodigo: e.target.value,
                  baseNome: e.target.value 
                })}
                className="w-full p-2 bg-white border border-amber-300 rounded text-xs font-semibold text-zinc-900"
              />
            </div>
          )}
        </div>

        {/* 3. Equipamento & Recipiente */}
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-150 text-xs">
          <div>
            <label className="font-bold text-zinc-800 block mb-1">Equipamento / Reator:</label>
            <select
              value={technicalModalItem.reatorId}
              onChange={(e) => {
                const rId = e.target.value;
                let recip = technicalModalItem.recipienteDetalhe;
                if (rId === 'BOMBONAS') recip = 'Bombona 50kg';
                else if (rId === 'R_40') recip = 'Reator 40kg';
                else recip = 'Reator';
                setTechnicalModalItem({
                  ...technicalModalItem,
                  reatorId: rId,
                  recipienteDetalhe: recip,
                });
              }}
              className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs font-medium"
            >
              {reatores.filter(r => r.ativo).map(r => (
                <option key={r.id} value={r.id}>
                  {r.nome} ({r.id === 'BOMBONAS' ? '50/100/200 kg' : `${r.capacidade_kg} kg`})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-zinc-800 block mb-1">Recipiente:</label>
            {technicalModalItem.reatorId === 'BOMBONAS' ? (
              <select
                value={technicalModalItem.recipienteDetalhe}
                onChange={(e) => {
                  setTechnicalModalItem({
                    ...technicalModalItem,
                    recipienteDetalhe: e.target.value,
                  });
                }}
                className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs font-semibold text-amber-900"
              >
                <option value="Bombona 50kg">Bombona 50 kg</option>
                <option value="Bombona 100kg">Bombona 100 kg</option>
                <option value="Bombona 200kg">Bombona 200 kg</option>
              </select>
            ) : (
              <input
                type="text"
                disabled
                value={technicalModalItem.reatorId === 'R_40' ? 'Reator 40kg' : 'Reator'}
                className="w-full p-2 bg-zinc-100 border border-zinc-200 rounded-lg text-xs text-zinc-600 font-medium"
              />
            )}
          </div>
        </div>

        {/* 4. Planejamento: Dia, Massa (kg), Quantidade Esperada (~un) */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-150 text-xs">
          <div>
            <label className="font-bold text-zinc-800 block mb-1">Dia da Semana:</label>
            <select
              value={technicalModalItem.dataPlanejada}
              onChange={(e) => setTechnicalModalItem({ ...technicalModalItem, dataPlanejada: e.target.value })}
              className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs font-medium"
            >
              {weekDays.map(d => (
                <option key={d.dateStr} value={d.dateStr} disabled={!!d.holiday}>
                  {d.label} ({d.dateStr.split('-').slice(1).reverse().join('/')}) {d.holiday ? `— Feriado: ${d.holiday.name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-zinc-800 block mb-1">Massa (kg):</label>
            <input
              type="number"
              min={1}
              value={technicalModalItem.quantidadeKg || ''}
              onChange={(e) => setTechnicalModalItem({ ...technicalModalItem, quantidadeKg: Number(e.target.value) })}
              className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs font-bold text-zinc-900"
            />
          </div>

          <div>
            <label className="font-bold text-zinc-800 block mb-1">Qtd. Esperada (~un):</label>
            {(() => {
              const uW = parseProductUnitWeightKg(technicalModalItem.item.descricao);
              const expectedUnits = Math.round((technicalModalItem.quantidadeKg || 0) / (uW || 1));
              return (
                <div className="p-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold text-blue-700 flex items-center justify-between">
                  <span>~{expectedUnits.toLocaleString('pt-BR')} un</span>
                  <span className="text-[10px] text-zinc-400 font-normal">
                    ({uW >= 1 ? `${uW} kg` : `${Math.round(uW * 1000)} g`})
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* 5. Lote ERP com Data e Autoajuste de Massa */}
        <div className="pt-1 border-t border-zinc-150 text-xs space-y-1.5">
          <label className="font-bold text-zinc-800 block">Lote ERP Oficial:</label>
          {technicalModalItem.loadingUltimoLote ? (
            <div className="flex items-center gap-2 p-2 bg-blue-50/60 border border-blue-150 rounded-lg text-[11px] text-blue-700">
              <RefreshCw size={12} className="animate-spin text-blue-600 shrink-0" />
              <span>Consultando histórico de lotes no ERP...</span>
            </div>
          ) : technicalModalItem.ultimoLote ? (
            <div className="p-2 bg-blue-50/80 border border-blue-200 rounded-lg text-[11px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-zinc-600">
                  Último Lote: <strong className="text-blue-900 font-mono font-bold">#{technicalModalItem.ultimoLote}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const autoMassa = technicalModalItem.quantidadeKgLote && technicalModalItem.quantidadeKgLote > 0
                      ? technicalModalItem.quantidadeKgLote
                      : technicalModalItem.quantidadeKg;
                    setTechnicalModalItem({
                      ...technicalModalItem,
                      loteErp: technicalModalItem.ultimoLote!,
                      quantidadeKg: autoMassa,
                    });
                  }}
                  className="px-2.5 py-0.5 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded text-[11px] font-semibold cursor-pointer shadow-2xs"
                >
                  Usar #{technicalModalItem.ultimoLote}
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                {technicalModalItem.dataUltimoLote && (
                  <span>Data no ERP: <strong>{technicalModalItem.dataUltimoLote.split('T')[0].split(' ')[0].split('-').reverse().join('/')}</strong></span>
                )}
                {technicalModalItem.quantidadeKgLote && (
                  <span className="text-emerald-700 font-bold">Massa no ERP: {technicalModalItem.quantidadeKgLote} kg</span>
                )}
              </div>
              {technicalModalItem.quantidadeKgLote && technicalModalItem.loteErp === technicalModalItem.ultimoLote && (
                <div className="text-[10px] text-emerald-700 font-medium pt-0.5">
                  ✓ Quantidade da batelada ajustada para {technicalModalItem.quantidadeKgLote} kg conforme registrado no ERP.
                </div>
              )}
            </div>
          ) : null}

          <input
            type="text"
            placeholder="Digite ou selecione o Lote ERP..."
            value={technicalModalItem.loteErp}
            onChange={(e) => setTechnicalModalItem({ ...technicalModalItem, loteErp: e.target.value })}
            className="w-full p-2 font-mono text-xs font-bold bg-white border border-zinc-300 rounded-lg text-zinc-900"
          />
        </div>

        {/* 6. Observações Técnicas / Instruções */}
        <div className="pt-1 border-t border-zinc-150 text-xs">
          <label className="font-bold text-zinc-800 block mb-1">Observações Técnicas / Instruções:</label>
          <textarea
            rows={2}
            placeholder="Instruções manuais para pesagem ou produção (se houver)..."
            value={technicalModalItem.observacoes}
            onChange={(e) => setTechnicalModalItem({ ...technicalModalItem, observacoes: e.target.value })}
            className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs resize-none"
          />
        </div>
    </Drawer>
  );
}
