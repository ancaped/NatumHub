import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Printer,
  Tag,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  FileText,
  Sliders,
} from 'lucide-react';
import type {
  FiscoQuimicaAnalysis,
  FiscoQuimicaPattern,
  ProcItem,
} from '../../../geral/lib/types';
import { calculateFillingTargets, parsePackageFromProductName } from '../lib/fiscoUtils';
import { printLoteZebraLabel, type LoteZebraLabelData } from '../lib/printLoteZebraLabel';

interface LoteZebraLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: FiscoQuimicaAnalysis | null;
  pattern?: FiscoQuimicaPattern | null;
  procItem?: ProcItem | null;
}

export const LoteZebraLabelModal: React.FC<LoteZebraLabelModalProps> = ({
  isOpen,
  onClose,
  analysis,
  pattern,
  procItem,
}) => {
  const [productName, setProductName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [batch, setBatch] = useState('');
  const [dateFormatted, setDateFormatted] = useState('');
  const [volumeInfo, setVolumeInfo] = useState('');
  const [statusText, setStatusText] = useState('APROVADO');
  const [procText, setProcText] = useState('');
  const [envaseText, setEnvaseText] = useState('');
  const [copies, setCopies] = useState<number>(1);

  useEffect(() => {
    if (!analysis) return;

    setProductName(analysis.productName || '');
    setProductCode(analysis.productCode || '');
    setBatch(analysis.batch || '');

    // Formatar data DD/MM/YYYY
    const rawDate = (analysis.analysisDate || '').trim().split(' ')[0].split('T')[0];
    const parts = rawDate.split(/[-/]/);
    let dateStr = rawDate;
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        dateStr = `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      } else if (parts[2].length === 4) {
        dateStr = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
    }
    setDateFormatted(dateStr);

    // Calcular Envase inicial (peso ou volume)
    const filling = calculateFillingTargets(pattern || null, analysis.densityMeasured, analysis.productName);
    let envVal = '';
    if (analysis.envaseTargetWeight && analysis.envaseTargetWeight > 0) {
      envVal = `Envase: ${analysis.envaseTargetWeight} ${analysis.envaseTargetUnit || 'g'}`;
    } else if (filling.weight.value > 0) {
      const valStr = filling.weight.value % 1 === 0 ? filling.weight.value.toFixed(0) : filling.weight.value.toFixed(1);
      envVal = `Envase: ${valStr} ${filling.weight.unit}`;
    } else {
      envVal = '';
    }
    setEnvaseText(envVal);

    // Identificar PROC
    if (procItem?.proc && procItem.status !== 'EM_BRANCO') {
      setProcText(`PROC: ${procItem.proc}`);
    } else {
      setProcText('PROC EM BRANCO');
    }

    // Calcular estimativa de volume e unidades/caixas
    const pkg = parsePackageFromProductName(analysis.productName);
    if (pkg && pkg.volume > 0) {
      // Exemplo padrão se lote tiver tamanho estimado ou 60L
      const unitVolMl = pkg.unit.toLowerCase() === 'l' || pkg.unit.toLowerCase() === 'kg' ? pkg.volume * 1000 : pkg.volume;
      // Se não souber tamanho do lote, coloca 60 L / padrão
      const approxUn = Math.round((60 * 1000) / unitVolMl) || 120;
      const approxCx = Math.ceil(approxUn / 12);
      setVolumeInfo(`60,00 L  (Aproximadamente ${approxUn} unidades ou ${approxCx} caixas)`);
    } else {
      setVolumeInfo('60,00 L  (Aproximadamente 120 unidades ou 11 caixas)');
    }

    setStatusText('APROVADO');
    setCopies(1);
  }, [analysis, pattern, procItem, isOpen]);

  if (!isOpen || !analysis) return null;

  const handlePrint = (e: React.FormEvent) => {
    e.preventDefault();

    const labelData: LoteZebraLabelData = {
      productName,
      productCode,
      batch,
      dateFormatted,
      volumeInfo,
      statusText,
      procText: procText === 'PROC EM BRANCO' ? '' : procText,
      envaseText,
      copies: Math.max(1, Number(copies) || 1),
    };

    printLoteZebraLabel(labelData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Tag className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Imprimir Etiqueta de Lote (100x50 mm)
                <span className="text-[10px] bg-amber-400 text-zinc-950 px-2 py-0.5 rounded-full font-black uppercase">
                  Zebra GC420t
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Aprovado CQ, PROC ANVISA e peso de envase personalizável antes da impressão
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 bg-zinc-50/40">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Form de Edição Rápida de Impressão (5 colunas) */}
            <form onSubmit={handlePrint} className="lg:col-span-6 bg-white p-5 rounded-2xl border border-zinc-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <span className="text-xs font-bold text-zinc-800 uppercase flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-zinc-500" />
                  Dados da Etiqueta (Somente Impressão)
                </span>
                <span className="text-[10px] text-zinc-400">Não altera o laudo salvo</span>
              </div>

              {/* Descrição e Código */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                  Descrição do Produto
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 bg-zinc-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>

              {/* Sub-informação de Volume / Caixas */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                  Volume / Quantidades / Caixas
                </label>
                <input
                  type="text"
                  placeholder="Ex: 60,00 L  (Aproximadamente 120 unidades ou 11 caixas)"
                  value={volumeInfo}
                  onChange={(e) => setVolumeInfo(e.target.value)}
                  className="w-full px-3 py-1.5 border border-zinc-300 rounded-xl text-xs font-medium text-zinc-900 bg-zinc-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>

              {/* Código e Data */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Cód. Produto
                  </label>
                  <input
                    type="text"
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value)}
                    className="w-full px-3 py-1.5 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 bg-zinc-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Data do Lote
                  </label>
                  <input
                    type="text"
                    value={dateFormatted}
                    onChange={(e) => setDateFormatted(e.target.value)}
                    className="w-full px-3 py-1.5 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 bg-zinc-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>

              {/* Status e PROC */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Selo de Qualidade
                  </label>
                  <select
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value)}
                    className="w-full px-3 py-1.5 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 bg-zinc-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="APROVADO">APROVADO</option>
                    <option value="LIBERADO CQ">LIBERADO CQ</option>
                    <option value="LIBERADO COM AJUSTE">LIBERADO COM AJUSTE</option>
                    <option value="EM QUARENTENA">EM QUARENTENA</option>
                    <option value="REPROVADO">REPROVADO</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    PROC / ANVISA
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: PROC: 25351.432828/2012-66"
                    value={procText}
                    onChange={(e) => setProcText(e.target.value)}
                    className="w-full px-3 py-1.5 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 bg-zinc-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>

              {/* CAMPO DE ENVASE MANUAL */}
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    Quantidade / Peso do Envase (Manual)
                  </label>
                  <span className="text-[9px] text-amber-700 font-medium">Edição livre p/ impressão</span>
                </div>
                <input
                  type="text"
                  placeholder="Ex: Envase: 495,0 g  ou  500 mL"
                  value={envaseText}
                  onChange={(e) => setEnvaseText(e.target.value)}
                  className="w-full px-3 py-2 border border-amber-300 rounded-xl text-xs font-bold text-zinc-950 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Quantidade de cópias e Nº Lote */}
              <div className="grid grid-cols-2 gap-3 items-end pt-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Nº do Lote
                  </label>
                  <input
                    type="text"
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    className="w-full px-3 py-1.5 border border-zinc-300 rounded-xl text-xs font-mono font-black text-zinc-900 bg-zinc-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Cópias a Imprimir
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={copies}
                      onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-20 px-3 py-1.5 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                    <div className="flex items-center gap-1">
                      {[1, 2, 4].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCopies(c)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                            copies === c
                              ? 'bg-zinc-900 text-white border-zinc-900'
                              : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200'
                          }`}
                        >
                          {c}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Botão de Disparo da Impressão */}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white py-3 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer mt-2"
              >
                <Printer size={16} />
                <span>Imprimir {copies}x na Zebra GC420t (100x50 mm)</span>
              </button>
            </form>

            {/* Pré-visualização Realista da Etiqueta 100x50 (6 colunas) */}
            <div className="lg:col-span-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-zinc-500" />
                  Prévia da Etiqueta (100 x 50 mm)
                </span>
                <span className="text-[10px] bg-zinc-200 text-zinc-700 font-mono px-2 py-0.5 rounded font-bold">
                  2:1 Aspect Ratio
                </span>
              </div>

              {/* Card Branco Renderizado em Escala Fiel */}
              <div className="bg-white p-3.5 rounded-2xl border-2 border-dashed border-zinc-300 shadow-md flex items-center justify-center">
                <div
                  className="w-full bg-white border border-black p-2.5 flex flex-col justify-between select-none shadow-xs text-black"
                  style={{
                    aspectRatio: '2 / 1',
                    maxHeight: '260px',
                    fontFamily: 'Arial, Helvetica, sans-serif',
                  }}
                >
                  {/* Cabeçalho */}
                  <div className="text-center font-black text-xs leading-tight tracking-tight uppercase line-clamp-2">
                    {productName || 'NOME DO PRODUTO'}
                  </div>

                  {/* Subtítulo de Volume */}
                  {volumeInfo && (
                    <div className="text-center text-[10px] font-medium text-zinc-800 leading-tight">
                      {volumeInfo}
                    </div>
                  )}

                  {/* Linha Central: Esquerda (Data e Código) + Box (Aprovado/PROC/Envase) */}
                  <div className="flex items-stretch justify-between gap-2 my-1">
                    {/* Esquerda */}
                    <div className="flex flex-col justify-around text-left">
                      <div className="leading-tight">
                        <span className="text-[8px] font-black uppercase tracking-wider block">DATA LOTE</span>
                        <span className="text-[10px] font-bold block">{dateFormatted || '—'}</span>
                      </div>
                      <div className="leading-tight mt-1">
                        <span className="text-[8px] font-black uppercase tracking-wider block">CÓD.PROD.</span>
                        <span className="text-xs font-black block">{productCode || '—'}</span>
                      </div>
                    </div>

                    {/* Quadro Central */}
                    <div className="flex-1 border border-black rounded p-1 flex flex-col justify-evenly items-center text-center bg-white min-h-[52px]">
                      <span className="bg-black text-white text-[9px] font-black px-2 py-0.5 rounded-xs tracking-wider uppercase leading-none">
                        {statusText}
                      </span>
                      <span className="text-[9px] font-bold text-black leading-tight">
                        {procText || 'PROC EM BRANCO'}
                      </span>
                      {envaseText && (
                        <span className="text-[9.5px] font-black text-black leading-tight">
                          {envaseText}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rodapé: Nº Lote */}
                  <div className="text-right leading-none">
                    <span className="text-xs font-medium">Nº Lote: </span>
                    <span className="text-sm font-black">{batch || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Dica da Impressora */}
              <div className="p-3 bg-zinc-100 rounded-xl text-[11px] text-zinc-600 space-y-1">
                <div className="font-bold text-zinc-800 flex items-center gap-1">
                  <Printer className="w-3.5 h-3.5 text-zinc-700" />
                  Dica para Zebra GC420t:
                </div>
                <p>
                  No diálogo de impressão do navegador, selecione a <strong>Zebra GC420t</strong> com papel <strong>100x50mm</strong> (ou 4" x 2") e margens em <strong>Nenhuma / 0mm</strong>.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
