import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Drawer from '../../../../geral/components/ui/Drawer';
import { apiFetch } from '../../../../geral/lib/http';
import type { TipoAviso } from '../../../../geral/components/ui/Aviso';
import type { ReatorConfig } from '../PlanejamentoSemanalTab';
import type { Setter } from './tiposDrawers';

interface ReatoresDrawerProps {
  reatores: ReatorConfig[];
  setReatores: Setter<ReatorConfig[]>;
  setReatoresModalOpen: (aberto: boolean) => void;
  avisar: (mensagem: string, tipo?: TipoAviso) => void;
  fetchReatores: () => Promise<void>;
}

export function ReatoresDrawer({
  reatores,
  setReatores,
  setReatoresModalOpen,
  avisar,
  fetchReatores,
}: ReatoresDrawerProps) {
  return (
    <Drawer isOpen onClose={() => setReatoresModalOpen(false)} title="Configuração de Reatores & Regras de Produção" size="md"
      footer={
        <>
            <button
              type="button"
              onClick={() => setReatoresModalOpen(false)}
              className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await apiFetch('/producao/reatores', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reatores)
                  });
                  setReatoresModalOpen(false);
                  avisar("Reatores e regras atualizados com sucesso!", 'sucesso');
                  fetchReatores();
                } catch (e) {
                  console.error(e);
                  avisar("Erro ao salvar configuração de reatores.", 'erro');
                }
              }}
              className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg shadow-xs cursor-pointer"
            >
              Salvar Reatores
            </button>
        </>
      }
    >

        <p className="text-xs text-zinc-500">
          Configure os reatores fabris, capacidades nominais em kg e as regras de processo (Shampoo exclusivo, Caldeira mista quente/frio, Resistência térmica ou Bombonas móveis).
        </p>

        <div className="flex flex-col gap-2.5 overflow-y-auto pr-1 max-h-[55vh]">
          {reatores.map((r, idx) => (
            <div key={r.id || idx} className="flex flex-col gap-2 p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <span className="font-mono font-bold text-zinc-400 text-[11px]">{idx + 1}.</span>
                  <input
                    type="text"
                    value={r.nome}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReatores(reatores.map(item => item.id === r.id ? { ...item, nome: val } : item));
                    }}
                    className="flex-1 font-bold text-zinc-900 bg-white border border-zinc-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-zinc-400"
                    placeholder="Nome do Reator/Equipamento"
                  />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-zinc-700 select-none">
                    <input 
                      type="checkbox"
                      checked={r.ativo}
                      onChange={(e) => {
                        const updated = reatores.map(item => item.id === r.id ? { ...item, ativo: e.target.checked } : item);
                        setReatores(updated);
                      }}
                      className="rounded text-blue-600 border-zinc-300"
                    />
                    <span>Ativo</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remover "${r.nome}" da configuração?`)) {
                        setReatores(reatores.filter(item => item.id !== r.id));
                      }
                    }}
                    className="text-zinc-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                    title="Remover este equipamento"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px] pt-1 border-t border-zinc-150">
                <div>
                  <span className="text-zinc-500 font-medium block mb-1">Capacidade Nominal (kg):</span>
                  <input
                    type="number"
                    min={1}
                    value={r.capacidade_kg}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setReatores(reatores.map(item => item.id === r.id ? { ...item, capacidade_kg: val } : item));
                    }}
                    className="w-full px-2 py-1 bg-white border border-zinc-300 rounded text-xs font-mono font-bold text-zinc-800"
                  />
                </div>
                <div>
                  <span className="text-zinc-500 font-medium block mb-1">Regra / Processo Térmico:</span>
                  <select
                    value={r.tipo}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReatores(reatores.map(item => item.id === r.id ? { ...item, tipo: val } : item));
                    }}
                    className="w-full px-2 py-1 bg-white border border-zinc-300 rounded text-xs font-semibold text-zinc-800 cursor-pointer"
                  >
                    <option value="caldeira_shampoo">🧴 Reator Exclusivo Shampoo (A Frio / Agitação)</option>
                    <option value="caldeira">🔥 Caldeira (Produção Mista Quente/Frio)</option>
                    <option value="resistencia">⚡ Resistência Elétrica (Máx 1 batelada/dia)</option>
                    <option value="quente">♨️ Produção Quente (R-40 / Pomadas / Ceras)</option>
                    <option value="bombona">🛢️ Bombonas Móveis (50kg, 100kg, 200kg)</option>
                    <option value="frio">❄️ A Frio Simples</option>
                    <option value="misto">⚖️ Misto Geral</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-zinc-200">
          <button
            type="button"
            onClick={() => {
              const newId = `R_NOVO_${Date.now()}`;
              setReatores([
                ...reatores,
                {
                  id: newId,
                  nome: `Novo Reator (${reatores.length + 1})`,
                  capacidade_kg: 200,
                  tipo: 'caldeira',
                  ordem: reatores.length + 1,
                  ativo: true
                }
              ]);
            }}
            className="px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-dashed border-zinc-300 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus size={14} />
            <span>Adicionar Reator / Equipamento</span>
          </button>

        </div>
    </Drawer>
  );
}
