import React, { useState, useEffect } from 'react';
import {
  Printer,
  Scissors,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import type { LaudoItem } from '../types';
import Modal from '../../../../modules/geral/components/ui/Modal';
import { printLaudoA4 } from '../lib/printLaudoA4';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  primaryLaudo: LaudoItem | null;
  allLaudos: LaudoItem[];
  logoSrc?: string | null;
}

export default function ImprimirLaudoModal({
  isOpen,
  onClose,
  primaryLaudo,
  allLaudos,
  logoSrc,
}: Props) {
  const [selectedSecondId, setSelectedSecondId] = useState<string>('blank');

  useEffect(() => {
    if (isOpen) {
      // Se houver outro laudo cadastrado na lista, sugere ele por padrão; senão, deixa em branco
      const otherLaudos = allLaudos.filter((l) => l.id !== primaryLaudo?.id);
      if (otherLaudos.length > 0) {
        setSelectedSecondId(String(otherLaudos[0].id));
      } else {
        setSelectedSecondId('blank');
      }
    }
  }, [isOpen, primaryLaudo, allLaudos]);

  if (!isOpen || !primaryLaudo) return null;

  const otherLaudos = allLaudos.filter((l) => l.id !== primaryLaudo.id);
  const secondaryLaudo = selectedSecondId === 'blank'
    ? null
    : allLaudos.find((l) => String(l.id) === selectedSecondId) || null;

  const handlePrint = (e: React.FormEvent) => {
    e.preventDefault();
    printLaudoA4(primaryLaudo, secondaryLaudo, logoSrc);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Imprimir Laudo de Qualidade (A4)"
      subtitle="2 laudos por folha A4 • Linha de corte central"
      size="lg"
    >
      <form onSubmit={handlePrint} className="space-y-4 p-1">
        {/* Informativo limpo */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p>
            A folha A4 portrait acomoda <strong>dois laudos de qualidade</strong> (superior e inferior) com linha de corte central tracejada.
          </p>
        </div>

        {/* Slot 1: Metade Superior (Laudo Selecionado) */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              Metade Superior — Laudo 1
            </span>
            <span className="font-mono font-bold text-xs text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200">
              {primaryLaudo.codigo_laudo}
            </span>
          </div>

          <div>
            <h4 className="text-sm font-extrabold text-zinc-900">
              {primaryLaudo.insumo_nome}
            </h4>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 mt-1">
              <span>Ref: <strong className="font-mono text-zinc-800">{primaryLaudo.codigo_ref}</strong></span>
              <span>Lote: <strong className="font-mono text-zinc-800">{primaryLaudo.lote_fornecedor}</strong></span>
              <span>Fornec: <strong className="text-zinc-800">{primaryLaudo.fornecedor_nome}</strong></span>
              <span>NF: <strong className="font-mono text-zinc-800">{primaryLaudo.nota_fiscal}</strong></span>
            </div>
          </div>
        </div>

        {/* Divisória de Corte */}
        <div className="flex items-center justify-center gap-2 py-0.5 text-zinc-400">
          <div className="flex-1 border-t border-dashed border-zinc-300"></div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200">
            <Scissors size={12} />
            <span>Linha de Corte A4</span>
          </div>
          <div className="flex-1 border-t border-dashed border-zinc-300"></div>
        </div>

        {/* Slot 2: Metade Inferior (Laudo 2 ou Em Branco) */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              Metade Inferior — Laudo 2
            </span>
            <span className="text-[11px] text-zinc-500">
              Escolha o segundo laudo para compor a folha
            </span>
          </div>

          <div>
            <select
              value={selectedSecondId}
              onChange={(e) => setSelectedSecondId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold text-zinc-800 cursor-pointer"
            >
              <option value="blank">
                📄 Modelo em branco (para preenchimento manual avulso)
              </option>
              {otherLaudos.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.codigo_laudo} — {l.insumo_nome} (Lote: {l.lote_fornecedor})
                </option>
              ))}
            </select>
          </div>

          {secondaryLaudo ? (
            <div className="bg-white p-3 rounded-xl border border-zinc-200 text-xs space-y-1">
              <div className="font-bold text-zinc-900">{secondaryLaudo.insumo_nome}</div>
              <div className="text-[11px] text-zinc-600 flex flex-wrap gap-x-3">
                <span>Ref: <strong className="font-mono">{secondaryLaudo.codigo_ref}</strong></span>
                <span>Lote: <strong className="font-mono">{secondaryLaudo.lote_fornecedor}</strong></span>
                <span>Fornec: <strong>{secondaryLaudo.fornecedor_nome}</strong></span>
                <span>NF: <strong className="font-mono">{secondaryLaudo.nota_fiscal}</strong></span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500 italic">
              A metade inferior será impressa com os campos em branco do formulário FOR-CQL-036, permitindo anotação manual e arquivo físico.
            </p>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-100 transition shadow-xs cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-xs transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Folha A4</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
