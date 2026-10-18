import React, { useState, useEffect } from 'react';
import {
  Printer,
  Sliders,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import Modal from '../../../../modules/geral/components/ui/Modal';
import type { RecebimentoErpItem } from '../types';
import {
  printBombonaLabels,
  buildBarcodeSvg,
  buildBombonaBatchTemplates,
  type BombonaLabelConfig,
} from '../lib/printEtiquetasBombona';
import PrintModal from '../../../ferramentas/etiquetas/components/PrintModal';
import type { LabelTemplate } from '../../../ferramentas/etiquetas/lib/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  erpItem: RecebimentoErpItem | null;
}

interface BombonaRow {
  id: string;
  peso: number;
  copias: number;
}

export default function ImprimirEtiquetasBombonaModal({
  isOpen,
  onClose,
  erpItem,
}: Props) {
  const [mode, setMode] = useState<'igual' | 'personalizado'>('igual');
  const [numBombonas, setNumBombonas] = useState<number>(2);
  const [copiasPorBombona, setCopiasPorBombona] = useState<number>(1);
  const [rows, setRows] = useState<BombonaRow[]>([]);
  const [statusText, setStatusText] = useState('APROVADO');

  // Estado para abrir a janela padrão de conexão com a impressora (PrintModal)
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [activeTemplates, setActiveTemplates] = useState<LabelTemplate[]>([]);

  // Inicializa quando abre o modal
  useEffect(() => {
    if (!isOpen || !erpItem) return;

    const totalQtd = erpItem.quantidade || 0;
    let defaultCount = 1;
    if (totalQtd >= 400) {
      defaultCount = Math.round(totalQtd / 250) || 2;
    } else if (totalQtd >= 100) {
      defaultCount = 2;
    }

    setNumBombonas(defaultCount);
    setCopiasPorBombona(1);
    setStatusText('APROVADO');
    setMode('igual');
    setPrintModalOpen(false);

    const pesoCada = defaultCount > 0 ? Number((totalQtd / defaultCount).toFixed(2)) : totalQtd;
    const initialRows: BombonaRow[] = [];
    for (let i = 0; i < defaultCount; i++) {
      initialRows.push({
        id: Math.random().toString(36).substring(2, 9),
        peso: pesoCada,
        copias: 1,
      });
    }
    setRows(initialRows);
  }, [isOpen, erpItem]);

  // Recalcula rows quando muda numBombonas no modo 'igual'
  const handleNumBombonasChange = (count: number) => {
    const validCount = Math.max(1, count);
    setNumBombonas(validCount);

    if (erpItem) {
      const pesoCada = Number((erpItem.quantidade / validCount).toFixed(2));
      const newRows: BombonaRow[] = [];
      for (let i = 0; i < validCount; i++) {
        newRows.push({
          id: Math.random().toString(36).substring(2, 9),
          peso: pesoCada,
          copias: copiasPorBombona,
        });
      }
      setRows(newRows);
    }
  };

  const handleCopiasGlobalChange = (copies: number) => {
    const validCopies = Math.max(1, copies);
    setCopiasPorBombona(validCopies);
    setRows((prev) => prev.map((r) => ({ ...r, copias: validCopies })));
  };

  const handleRowPesoChange = (id: string, peso: number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, peso: Math.max(0, peso) } : r))
    );
  };

  const handleRowCopiasChange = (id: string, copias: number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, copias: Math.max(1, copias) } : r))
    );
  };

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        peso: 100,
        copias: copiasPorBombona,
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  if (!isOpen || !erpItem) return null;

  const totalSomaPesos = rows.reduce((acc, r) => acc + r.peso, 0);
  const totalEtiquetasImprimir = rows.reduce((acc, r) => acc + r.copias, 0);

  const getBuildConfig = (): BombonaLabelConfig => ({
    codigoReceb: erpItem.codigo_receb,
    codigoRef: erpItem.codigo_ref,
    insumoNome: erpItem.insumo_desc,
    fornecedor: erpItem.fornecedor,
    lote: erpItem.lote_fornec,
    dataEntrada: erpItem.data_entrada,
    dataValidade: erpItem.data_validade,
    notaFiscal: erpItem.nota.toString(),
    unidade: erpItem.unidade,
    statusText,
    bombonas: rows.map((r) => ({
      peso: r.peso,
      copias: r.copias,
    })),
  });

  // Abertura da janela padrão do sistema para conexão com a impressora (PrintModal)
  const handleOpenStandardPrinterModal = (e: React.FormEvent) => {
    e.preventDefault();
    const cfg = getBuildConfig();
    const templates = buildBombonaBatchTemplates(cfg);
    setActiveTemplates(templates);
    setPrintModalOpen(true);
  };

  // Fallback para impressão direta via navegador
  const handlePrintBrowser = () => {
    const cfg = getBuildConfig();
    printBombonaLabels(cfg);
    onClose();
  };

  // Preview da primeira bombona no modelo antigo
  const previewPeso = rows[0]?.peso || (erpItem.quantidade / numBombonas);
  const barcodeSvg = buildBarcodeSvg(erpItem.codigo_receb);

  return (
    <>
      <Modal
        isOpen={isOpen && !printModalOpen}
        onClose={onClose}
        title="Impressão de Etiquetas para Bombonas"
        subtitle={`Zebra GC420t (100mm x 50mm) • ${erpItem.codigo_receb} • Ref: ${erpItem.codigo_ref}`}
        size="3xl"
      >
        <form onSubmit={handleOpenStandardPrinterModal} className="space-y-5 p-1">
          {/* Identificação do Insumo (Card Natum) */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                  Matéria-Prima
                </span>
                <h4 className="text-sm font-extrabold text-zinc-900 mt-0.5">
                  {erpItem.insumo_desc}
                </h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Ref: <span className="font-mono font-bold text-zinc-700">{erpItem.codigo_ref}</span> • Fornecedor: {erpItem.fornecedor}
                </p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-zinc-200 text-left md:text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block tracking-wider">
                  Volume Total Recebido
                </span>
                <span className="text-base font-black text-zinc-900 block font-mono mt-0.5">
                  {erpItem.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {erpItem.unidade}
                </span>
                <span className="text-[11px] text-zinc-500 block font-mono">
                  Lote: {erpItem.lote_fornec} | NF: {erpItem.nota}
                </span>
              </div>
            </div>
          </div>

          {/* Divisão dos Pesos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-zinc-600" />
                Configuração de Volumes e Pesos
              </label>
              <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('igual')}
                  className={`px-3 py-1 font-semibold rounded-lg transition-all cursor-pointer ${
                    mode === 'igual'
                      ? 'bg-white text-zinc-900 shadow-sm font-bold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Divisão Igual
                </button>
                <button
                  type="button"
                  onClick={() => setMode('personalizado')}
                  className={`px-3 py-1 font-semibold rounded-lg transition-all cursor-pointer ${
                    mode === 'personalizado'
                      ? 'bg-white text-zinc-900 shadow-sm font-bold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Pesos Individuais
                </button>
              </div>
            </div>

            {mode === 'igual' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Número de Bombonas
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={numBombonas}
                    onChange={(e) => handleNumBombonasChange(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Peso por Bombona
                  </label>
                  <div className="px-3 py-2 text-sm bg-white border border-zinc-200 rounded-xl font-mono font-bold text-zinc-900">
                    {(erpItem.quantidade / numBombonas).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {erpItem.unidade}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Cópias por Bombona
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={copiasPorBombona}
                    onChange={(e) => handleCopiasGlobalChange(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5">Identificação</th>
                        <th className="px-4 py-2.5">Peso da Bombona ({erpItem.unidade})</th>
                        <th className="px-4 py-2.5">Cópias</th>
                        <th className="px-2 py-2.5 text-center w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {rows.map((row, idx) => (
                        <tr key={row.id} className="hover:bg-zinc-50/50">
                          <td className="px-4 py-2.5 font-bold text-zinc-800">
                            Bombona {idx + 1} de {rows.length}
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.peso}
                              onChange={(e) =>
                                handleRowPesoChange(row.id, parseFloat(e.target.value) || 0)
                              }
                              className="w-32 px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono font-bold"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={row.copias}
                              onChange={(e) =>
                                handleRowCopiasChange(row.id, parseInt(e.target.value) || 1)
                              }
                              className="w-20 px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
                            />
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(row.id)}
                              disabled={rows.length <= 1}
                              className="text-zinc-400 hover:text-rose-600 disabled:opacity-30 p-1 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-xs px-1">
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 font-bold text-zinc-800 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Bombona
                  </button>

                  <div className="text-right">
                    <span className="text-zinc-500">Soma dos pesos: </span>
                    <strong
                      className={
                        Math.abs(totalSomaPesos - erpItem.quantidade) < 0.01
                          ? 'text-emerald-700 font-mono font-bold'
                          : 'text-amber-700 font-mono font-bold'
                      }
                    >
                      {totalSomaPesos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /{' '}
                      {erpItem.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{' '}
                      {erpItem.unidade}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pré-visualização Fiel ao Modelo Antigo */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
              Pré-visualização da Etiqueta (Modelo Antigo — 100mm × 50mm)
            </span>

            <div className="flex justify-center p-4 bg-zinc-100 rounded-2xl border border-zinc-200">
              <div
                style={{
                  width: '380px',
                  height: '190px',
                  boxSizing: 'border-box',
                }}
                className="bg-white text-black p-3 rounded-lg border-2 border-black shadow-sm flex flex-col justify-between font-sans select-none"
              >
                {/* TOPO: CÓDIGO DE BARRAS À ESQUERDA E CÓDIGO/DESCRIÇÃO À DIREITA */}
                <div className="flex items-center border-b-2 border-black pb-1.5 gap-2">
                  <div className="w-[125px] flex flex-col items-center justify-center">
                    <div
                      className="w-full flex justify-center [&>svg]:h-[30px] [&>svg]:w-[115px]"
                      dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                    />
                    <span className="font-mono text-[9px] font-bold tracking-wider leading-none mt-0.5">
                      {erpItem.codigo_receb}
                    </span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-[10px] font-bold leading-tight font-mono">{erpItem.codigo_ref}</div>
                    <div className="text-[12px] font-black uppercase leading-tight line-clamp-2">
                      {erpItem.insumo_desc}
                    </div>
                  </div>
                </div>

                {/* CORPO: DADOS DO FORNECEDOR / LOTE E CARIMBO APROVADO */}
                <div className="flex flex-1 pt-1.5 gap-2">
                  <div className="flex-1 flex flex-col justify-between text-[9px] leading-tight">
                    <div className="truncate">
                      <strong className="text-[8px] text-zinc-700">FORNEC: </strong>
                      <span>{erpItem.fornecedor}</span>
                    </div>
                    <div>
                      <strong className="text-[8px] text-zinc-700">LOTE: </strong>
                      <span className="font-mono font-bold">{erpItem.lote_fornec}</span>
                    </div>
                    <div className="flex justify-between">
                      <div>
                        <strong className="text-[8px] text-zinc-700">ENTR: </strong>
                        <span className="font-mono">{erpItem.data_entrada}</span>
                      </div>
                      <div>
                        <strong className="text-[8px] text-zinc-700">VAL: </strong>
                        <span className="font-mono">{erpItem.data_validade || '—'}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-baseline border-t border-zinc-300 pt-0.5">
                      <div>
                        <strong className="text-[8px] text-zinc-700">QTDE. EMB: </strong>
                        <span className="text-[11px] font-extrabold font-mono">
                          {previewPeso.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{' '}
                          {erpItem.unidade}
                        </span>
                      </div>
                      <div>
                        <strong className="text-[8px] text-zinc-700">NF: </strong>
                        <span className="font-mono font-bold">{erpItem.nota}</span>
                      </div>
                    </div>
                  </div>

                  {/* CARIMBO DE STATUS */}
                  <div className="w-[85px] border-l-2 border-black pl-2 flex flex-col items-center justify-center">
                    <div className="border-2 border-black font-black text-[11px] px-1 py-1 text-center w-full rounded">
                      {statusText}
                    </div>
                    <span className="text-[8px] font-bold text-zinc-600 mt-1">
                      BOMBONA 1/{rows.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rodapé de Ações */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-200">
            <div className="text-xs text-zinc-500">
              Total a imprimir: <strong className="text-zinc-900 font-mono">{totalEtiquetasImprimir}</strong> etiqueta(s) em {rows.length} volume(s)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-100 transition shadow-xs cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handlePrintBrowser}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl shadow-xs transition cursor-pointer"
                title="Imprimir direto via diálogo do navegador"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Imprimir via Navegador
              </button>

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-xs transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Conectar Impressora (Janela Padrão)
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Janela Padrão de Impressão do Sistema (PrintModal) - Conecta direto com a impressora térmica */}
      {printModalOpen && activeTemplates[0] && (
        <PrintModal
          template={activeTemplates[0]}
          batchTemplates={activeTemplates.length > 1 ? activeTemplates : undefined}
          isOpen={printModalOpen}
          onClose={() => {
            setPrintModalOpen(false);
            onClose();
          }}
          printDpi={300}
          initialFillPercent={98}
          initialCopies={1}
          history={{
            product_code: erpItem.codigo_ref,
            product_name: erpItem.insumo_desc,
            lot_number: erpItem.lote_fornec,
          }}
        />
      )}
    </>
  );
}
