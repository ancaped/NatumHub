import React, { useState, useEffect } from 'react';
import {
  Printer,
  Save,
  Trash2,
  AlertTriangle,
  Beaker,
  Edit,
} from 'lucide-react';
import type { LaudoItem, LaudoEnsaio, UpdateLaudoRequest } from '../types';
import Modal from '../../../../modules/geral/components/ui/Modal';
import { apiJson } from '../../../../modules/geral/lib/http';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  laudo: LaudoItem | null;
  onUpdated: (laudo: LaudoItem) => void;
  onPrint: (laudo: LaudoItem) => void;
  onDelete?: (id: number | string) => void;
}

export default function VisualizarLaudoModal({
  isOpen,
  onClose,
  laudo,
  onUpdated,
  onPrint,
  onDelete,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [dataAnalise, setDataAnalise] = useState('');
  const [responsavelCq, setResponsavelCq] = useState('');
  const [parecer, setParecer] = useState<'APROVADO' | 'REPROVADO' | 'QUARENTENA'>('APROVADO');
  const [ensaios, setEnsaios] = useState<LaudoEnsaio[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !laudo) return;

    setIsEditing(false);
    setDataAnalise(laudo.data_analise || '');
    setResponsavelCq(laudo.responsavel_cq || '');
    setParecer(laudo.parecer);
    setEnsaios(laudo.ensaios.map((e) => ({ ...e })));
    setObservacoes(laudo.observacoes || '');
    setError(null);
  }, [isOpen, laudo]);

  if (!isOpen || !laudo) return null;

  const handleEnsaioChange = (index: number, field: keyof LaudoEnsaio, value: any) => {
    setEnsaios((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const payload: UpdateLaudoRequest = {
      data_analise: dataAnalise,
      responsavel_cq: responsavelCq,
      parecer,
      ensaios,
      observacoes,
    };

    try {
      const res = await apiJson<LaudoItem>(
        `/api/qualidade/recebimento-mp/laudos/${laudo.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );

      onUpdated(res);
      setIsEditing(false);
    } catch (e: any) {
      setError(e.message || 'Erro ao atualizar laudo');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Tem certeza que deseja excluir o laudo ${laudo.codigo_laudo}?`)) {
      return;
    }
    try {
      await apiJson(`/api/qualidade/recebimento-mp/laudos/${laudo.id}`, {
        method: 'DELETE',
      });
      if (onDelete) onDelete(laudo.id);
      onClose();
    } catch (e: any) {
      alert('Erro ao excluir: ' + (e.message || 'Falha na requisição'));
    }
  };

  const parecerBadgeClass = (p: string) => {
    if (p === 'APROVADO') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (p === 'QUARENTENA') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-rose-50 text-rose-700 border-rose-200';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Laudo CQ — ${laudo.codigo_laudo}`}
      subtitle={`Modelo FOR-CQL-036 V.03 • Receb: ${laudo.codigo_receb} • Ref: ${laudo.codigo_ref}`}
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
                Matéria-Prima
              </span>
              <span className="font-bold text-zinc-900 text-sm block mt-0.5">
                {laudo.insumo_nome}
              </span>
              <span className="text-zinc-500 font-mono text-[11px] block mt-0.5">Ref: {laudo.codigo_ref}</span>
            </div>
            <div>
              <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                Fornecedor
              </span>
              <span className="font-semibold text-zinc-800 block mt-0.5">
                {laudo.fornecedor_nome}
              </span>
              <span className="text-zinc-500 font-mono text-[11px] block mt-0.5">NF: {laudo.nota_fiscal}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                  Lote
                </span>
                <span className="font-mono font-bold text-zinc-900 block mt-0.5">
                  {laudo.lote_fornecedor}
                </span>
              </div>
              <div>
                <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                  Quantidade
                </span>
                <span className="font-mono font-bold text-zinc-900 block mt-0.5">
                  {laudo.quantidade_total.toLocaleString('pt-BR')} {laudo.unidade}
                </span>
              </div>
              <div>
                <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                  Entrada
                </span>
                <span className="font-mono text-zinc-700 block mt-0.5">
                  {laudo.data_entrada ? laudo.data_entrada.split('-').reverse().join('/') : '—'}
                </span>
              </div>
              <div>
                <span className="block text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                  Validade
                </span>
                <span className="font-mono text-zinc-700 block mt-0.5">
                  {laudo.data_validade ? laudo.data_validade.split('-').reverse().join('/') : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dados da Análise / Edição */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Data da Análise
            </label>
            {isEditing ? (
              <input
                type="date"
                value={dataAnalise}
                onChange={(e) => setDataAnalise(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
              />
            ) : (
              <div className="px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl font-mono font-medium text-zinc-800">
                {laudo.data_analise ? laudo.data_analise.split('-').reverse().join('/') : '—'}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Responsável pelo CQ
            </label>
            {isEditing ? (
              <input
                type="text"
                value={responsavelCq}
                onChange={(e) => setResponsavelCq(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            ) : (
              <div className="px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl font-medium text-zinc-800">
                {laudo.responsavel_cq || '—'}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Parecer Final
            </label>
            {isEditing ? (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setParecer('APROVADO')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                    parecer === 'APROVADO'
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  APROVADO
                </button>
                <button
                  type="button"
                  onClick={() => setParecer('QUARENTENA')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                    parecer === 'QUARENTENA'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  QUARENTENA
                </button>
                <button
                  type="button"
                  onClick={() => setParecer('REPROVADO')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                    parecer === 'REPROVADO'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  REPROVADO
                </button>
              </div>
            ) : (
              <div
                className={`px-3 py-1.5 text-xs rounded-xl font-bold border inline-block ${parecerBadgeClass(
                  laudo.parecer
                )}`}
              >
                {laudo.parecer}
              </div>
            )}
          </div>
        </div>

        {/* Tabela de Ensaios */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-2">
            <Beaker className="w-3.5 h-3.5 text-zinc-500" />
            Ensaios Físico-Químicos
          </label>

          <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 w-1/4">Ensaio</th>
                  <th className="px-4 py-2.5 w-1/3">Especificação</th>
                  <th className="px-4 py-2.5 w-1/4">Resultado</th>
                  <th className="px-4 py-2.5 text-center w-24">Conforme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {ensaios.map((e, index) => (
                  <tr key={index} className="hover:bg-zinc-50/50">
                    <td className="px-4 py-2.5 font-bold text-zinc-900">
                      {isEditing ? (
                        <input
                          type="text"
                          value={e.ensaio}
                          onChange={(ev) => handleEnsaioChange(index, 'ensaio', ev.target.value)}
                          className="w-full px-2 py-1 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-semibold"
                        />
                      ) : (
                        e.ensaio
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {isEditing ? (
                        <input
                          type="text"
                          value={e.especificacao}
                          onChange={(ev) => handleEnsaioChange(index, 'especificacao', ev.target.value)}
                          className="w-full px-2 py-1 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs"
                        />
                      ) : (
                        e.especificacao
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-zinc-900 font-mono">
                      {isEditing ? (
                        <input
                          type="text"
                          value={e.resultado}
                          onChange={(ev) => handleEnsaioChange(index, 'resultado', ev.target.value)}
                          className="w-full px-2 py-1 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-mono"
                        />
                      ) : (
                        e.resultado
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {isEditing ? (
                        <button
                          type="button"
                          onClick={() => handleEnsaioChange(index, 'conforme', !e.conforme)}
                          className={`px-3 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                            e.conforme
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {e.conforme ? 'C' : 'NC'}
                        </button>
                      ) : (
                        <span
                          className={`px-2.5 py-0.5 text-[11px] font-bold rounded-lg border inline-block ${
                            e.conforme
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {e.conforme ? 'C' : 'NC'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Observações */}
        <div>
          <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
            Observações
          </label>
          {isEditing ? (
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          ) : (
            <div className="px-3.5 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-700">
              {laudo.observacoes || 'Nenhuma observação registrada.'}
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-200">
          <div>
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Laudo
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-100 transition shadow-xs"
              >
                <Edit className="w-3.5 h-3.5" />
                Editar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition"
              >
                Cancelar Edição
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-100 transition shadow-xs"
            >
              Fechar
            </button>

            {isEditing ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-xs transition"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Alterações
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onPrint(laudo)}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-xs transition"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir Laudo (A4)
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
