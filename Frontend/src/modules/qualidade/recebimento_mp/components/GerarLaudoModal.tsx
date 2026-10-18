import React, { useState, useEffect } from 'react';
import {
  FileText,
  Printer,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Beaker,
} from 'lucide-react';
import type { RecebimentoErpItem, LaudoEnsaio, LaudoItem, CreateLaudoRequest } from '../types';
import Modal from '../../../../modules/geral/components/ui/Modal';
import { apiJson } from '../../../../modules/geral/lib/http';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  erpItem: RecebimentoErpItem | null;
  onSaved: (laudo: LaudoItem, andPrint: boolean) => void;
  currentUserName?: string;
}

const DEFAULT_ENSAIOS: LaudoEnsaio[] = [
  { ensaio: 'Aspecto', especificacao: 'Líquido límpido', resultado: 'Conforme', conforme: true },
  { ensaio: 'Cor', especificacao: 'Característico / Incolor', resultado: 'Conforme', conforme: true },
  { ensaio: 'Odor', especificacao: 'Característico', resultado: 'Conforme', conforme: true },
  { ensaio: 'pH', especificacao: '2,0 - 4,0', resultado: '3,0', conforme: true },
  { ensaio: 'Ponto de Fusão (°C)', especificacao: 'N/A', resultado: 'N/A', conforme: true },
];

export default function GerarLaudoModal({
  isOpen,
  onClose,
  erpItem,
  onSaved,
  currentUserName,
}: Props) {
  const [dataAnalise, setDataAnalise] = useState('');
  const [responsavelCq, setResponsavelCq] = useState('');
  const [parecer, setParecer] = useState<'APROVADO' | 'REPROVADO' | 'QUARENTENA'>('APROVADO');
  const [ensaios, setEnsaios] = useState<LaudoEnsaio[]>(DEFAULT_ENSAIOS);
  const [observacoes, setObservacoes] = useState('');
  const [criarAmostra, setCriarAmostra] = useState(true);
  const [locAmostra, setLocAmostra] = useState('Armário de Contraprovas');
  const [qtdAmostra, setQtdAmostra] = useState('100 g / mL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !erpItem) return;

    setDataAnalise(new Date().toISOString().slice(0, 10));
    setResponsavelCq(currentUserName || 'Controle de Qualidade');
    setParecer('APROVADO');
    setEnsaios(DEFAULT_ENSAIOS.map((e) => ({ ...e })));
    setObservacoes('');
    setCriarAmostra(true);
    setLocAmostra('Armário de Contraprovas');
    setQtdAmostra('100 g / mL');
    setError(null);
  }, [isOpen, erpItem, currentUserName]);

  if (!isOpen || !erpItem) return null;

  const handleEnsaioChange = (index: number, field: keyof LaudoEnsaio, value: any) => {
    setEnsaios((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddEnsaio = () => {
    setEnsaios((prev) => [
      ...prev,
      { ensaio: 'Novo Ensaio', especificacao: 'Padrão', resultado: 'Conforme', conforme: true },
    ]);
  };

  const handleRemoveEnsaio = (index: number) => {
    setEnsaios((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (andPrint: boolean) => {
    setSaving(true);
    setError(null);

    const payload: CreateLaudoRequest = {
      registro_erp: erpItem.registro,
      codigo_receb: erpItem.codigo_receb,
      codigo_ref: erpItem.codigo_ref,
      insumo_nome: erpItem.insumo_desc,
      fornecedor_nome: erpItem.fornecedor,
      nota_fiscal: erpItem.nota.toString(),
      lote_fornecedor: erpItem.lote_fornec,
      quantidade_total: erpItem.quantidade,
      unidade: erpItem.unidade,
      data_entrada: erpItem.data_entrada,
      data_validade: erpItem.data_validade,
      data_analise: dataAnalise,
      responsavel_cq: responsavelCq.trim() || 'Controle de Qualidade',
      parecer,
      ensaios,
      observacoes: observacoes.trim() || undefined,
      criar_amostra_retencao: criarAmostra,
      localizacao_amostra: criarAmostra ? locAmostra : undefined,
      quantidade_amostra: criarAmostra ? qtdAmostra : undefined,
    };

    try {
      const savedLaudo = await apiJson<LaudoItem>('/qualidade/recebimento-mp/laudos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      onSaved(savedLaudo, andPrint);
    } catch (err: any) {
      console.error('Erro gerando laudo:', err);
      setError(err?.message || 'Falha ao salvar o laudo no servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Emissão de Laudo CQ — FOR-CQL-036"
      subtitle={`Entrada #${erpItem.registro} • ${erpItem.codigo_receb} • Ref: ${erpItem.codigo_ref}`}
      size="3xl"
    >
      <div className="space-y-5 p-1">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Resumo do Insumo (Card Natum) */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                Insumo / Matéria-Prima
              </span>
              <span className="font-bold text-zinc-900 text-sm block mt-0.5">
                {erpItem.insumo_desc}
              </span>
              <span className="text-zinc-500 font-mono text-[11px] block mt-0.5">
                Cód: {erpItem.codigo_ref}
              </span>
            </div>
            <div>
              <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                Fornecedor
              </span>
              <span className="font-semibold text-zinc-800 block mt-0.5">
                {erpItem.fornecedor}
              </span>
              <span className="text-zinc-500 font-mono text-[11px] block mt-0.5">
                NF: {erpItem.nota}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                  Lote
                </span>
                <span className="font-mono font-bold text-zinc-900 block mt-0.5">
                  {erpItem.lote_fornec}
                </span>
              </div>
              <div>
                <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                  Quantidade
                </span>
                <span className="font-mono font-bold text-zinc-900 block mt-0.5">
                  {erpItem.quantidade.toLocaleString('pt-BR')} {erpItem.unidade}
                </span>
              </div>
              <div>
                <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                  Entrada
                </span>
                <span className="font-mono text-zinc-700 block mt-0.5">
                  {erpItem.data_entrada}
                </span>
              </div>
              <div>
                <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                  Validade
                </span>
                <span className="font-mono text-zinc-700 block mt-0.5">
                  {erpItem.data_validade || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Parâmetros da Análise */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Data da Análise CQ
            </label>
            <input
              type="date"
              value={dataAnalise}
              onChange={(e) => setDataAnalise(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-mono text-zinc-900 outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Responsável pelo Laudo (CQ)
            </label>
            <input
              type="text"
              value={responsavelCq}
              onChange={(e) => setResponsavelCq(e.target.value)}
              placeholder="Nome do analista..."
              className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-900 outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Parecer Final do CQ
            </label>
            <select
              value={parecer}
              onChange={(e) => setParecer(e.target.value as any)}
              className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-900 outline-none focus:border-zinc-400"
            >
              <option value="APROVADO">APROVADO</option>
              <option value="REPROVADO">REPROVADO</option>
              <option value="QUARENTENA">QUARENTENA</option>
            </select>
          </div>
        </div>

        {/* Tabela de Ensaios Físico-Químicos */}
        <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white">
          <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
              Aspectos Físico-Químicos ou Organolépticos
            </span>
            <button
              type="button"
              onClick={handleAddEnsaio}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Ensaio
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/60 text-zinc-500 uppercase text-[10px] font-semibold border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-2 w-1/4">Análise / Parâmetro</th>
                  <th className="px-3 py-2 w-1/3">Especificação Ref.</th>
                  <th className="px-3 py-2 w-1/4">Resultado Encontrado</th>
                  <th className="px-3 py-2 text-center">Conforme?</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {ensaios.map((item, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50/50">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={item.ensaio}
                        onChange={(e) => handleEnsaioChange(idx, 'ensaio', e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-zinc-200 rounded-lg outline-none focus:border-zinc-400 font-medium text-zinc-800"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.especificacao}
                        onChange={(e) => handleEnsaioChange(idx, 'especificacao', e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-zinc-200 rounded-lg outline-none focus:border-zinc-400 text-zinc-600 font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.resultado}
                        onChange={(e) => handleEnsaioChange(idx, 'resultado', e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-zinc-200 rounded-lg outline-none focus:border-zinc-400 font-mono font-bold text-zinc-900"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={item.conforme}
                        onChange={(e) => handleEnsaioChange(idx, 'conforme', e.target.checked)}
                        className="w-4 h-4 rounded text-zinc-900 focus:ring-0 border-zinc-300"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveEnsaio(idx)}
                        className="p-1 text-zinc-400 hover:text-rose-600 rounded"
                        title="Remover ensaio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Contraprova de Retenção */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={criarAmostra}
              onChange={(e) => setCriarAmostra(e.target.checked)}
              className="w-4 h-4 rounded text-zinc-900 focus:ring-0 border-zinc-300"
            />
            <span className="text-xs font-bold text-zinc-800">
              Registrar Contraprova / Amostra de Retenção no Sistema
            </span>
          </label>

          {criarAmostra && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-zinc-200 text-xs">
              <div>
                <label className="block text-zinc-500 mb-1">Localização no Armário/Setor</label>
                <input
                  type="text"
                  value={locAmostra}
                  onChange={(e) => setLocAmostra(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-xs outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="block text-zinc-500 mb-1">Volume/Peso Retido</label>
                <input
                  type="text"
                  value={qtdAmostra}
                  onChange={(e) => setQtdAmostra(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-xs outline-none focus:border-zinc-400 font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {/* Observações */}
        <div>
          <label className="block text-xs font-semibold text-zinc-700 mb-1">
            Observações Adicionais (opcional)
          </label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            placeholder="Comentários sobre a entrega, certificado do fabricante, embalagem..."
            className="w-full p-2.5 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-900 outline-none focus:border-zinc-400"
          />
        </div>

        {/* Ações do Rodapé */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-100 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition shadow-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Laudo'}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold transition shadow-sm"
          >
            <Printer className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar e Imprimir A4 (2 por folha)'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
