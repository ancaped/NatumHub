import React, { useState, useEffect } from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import type { AmostraItem, CreateAmostraRequest } from '../types';
import Modal from '../../../../modules/geral/components/ui/Modal';
import { apiJson } from '../../../../modules/geral/lib/http';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (amostra: AmostraItem) => void;
  initialData?: Partial<CreateAmostraRequest> | null;
  currentUserName?: string;
}

export default function NovaAmostraModal({
  isOpen,
  onClose,
  onSaved,
  initialData,
  currentUserName,
}: Props) {
  const [codigoReceb, setCodigoReceb] = useState('');
  const [insumoNome, setInsumoNome] = useState('');
  const [lote, setLote] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [dataColeta, setDataColeta] = useState('');
  const [dataValidadeRetencao, setDataValidadeRetencao] = useState('');
  const [localizacao, setLocalizacao] = useState('Armário de Contraprovas - Prateleira 1');
  const [quantidadeAmostra, setQuantidadeAmostra] = useState('100 g / mL');
  const [status, setStatus] = useState('RETIDA');
  const [responsavel, setResponsavel] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setCodigoReceb(initialData?.codigo_receb || '');
    setInsumoNome(initialData?.insumo_nome || '');
    setLote(initialData?.lote || '');
    setFornecedor(initialData?.fornecedor || '');
    setDataColeta(initialData?.data_coleta || new Date().toISOString().slice(0, 10));
    setDataValidadeRetencao(initialData?.data_validade_retencao || '');
    setLocalizacao(initialData?.localizacao || 'Armário de Contraprovas - Prateleira 1');
    setQuantidadeAmostra(initialData?.quantidade_amostra || '100 g / mL');
    setStatus(initialData?.status || 'RETIDA');
    setResponsavel(initialData?.responsavel || currentUserName || 'Controle de Qualidade');
    setObservacoes(initialData?.observacoes || '');
    setError(null);
  }, [isOpen, initialData, currentUserName]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insumoNome.trim() || !lote.trim()) {
      setError('Por favor, informe ao menos o Nome do Insumo e o Lote.');
      return;
    }

    setSaving(true);
    setError(null);

    const payload: CreateAmostraRequest = {
      laudo_id: initialData?.laudo_id ? String(initialData.laudo_id) : null,
      codigo_receb: codigoReceb.trim(),
      insumo_nome: insumoNome.trim(),
      lote: lote.trim(),
      fornecedor: fornecedor.trim(),
      data_coleta: dataColeta,
      data_validade_retencao: dataValidadeRetencao || undefined,
      localizacao: localizacao.trim(),
      quantidade_amostra: quantidadeAmostra.trim(),
      status,
      responsavel: responsavel.trim(),
      observacoes: observacoes.trim(),
    };

    try {
      const res = await apiJson<AmostraItem>('/api/qualidade/recebimento-mp/amostras', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      onSaved(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar amostra');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cadastrar Amostra de Retenção (Contraprova)"
      subtitle="Guarda e rastreabilidade de amostras de matéria-prima"
      size="lg"
    >
      <form onSubmit={handleSave} className="space-y-4 p-1">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Nome da Matéria-Prima / Insumo *
            </label>
            <input
              type="text"
              required
              value={insumoNome}
              onChange={(e) => setInsumoNome(e.target.value)}
              placeholder="Ex: ÁCIDO GLIOXÍLICO"
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold text-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Lote *
            </label>
            <input
              type="text"
              required
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder="Ex: 201607030"
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono font-bold text-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Cód. Recebimento (ERP)
            </label>
            <input
              type="text"
              value={codigoReceb}
              onChange={(e) => setCodigoReceb(e.target.value)}
              placeholder="Ex: MP001852"
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono text-zinc-900"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Fornecedor
            </label>
            <input
              type="text"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              placeholder="Nome do fornecedor"
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Data da Coleta
            </label>
            <input
              type="date"
              value={dataColeta}
              onChange={(e) => setDataColeta(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono text-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Validade da Retenção
            </label>
            <input
              type="date"
              value={dataValidadeRetencao}
              onChange={(e) => setDataValidadeRetencao(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono text-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Localização Física
            </label>
            <input
              type="text"
              value={localizacao}
              onChange={(e) => setLocalizacao(e.target.value)}
              placeholder="Ex: Armário de Contraprovas - Prateleira 1"
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Quantidade Coletada
            </label>
            <input
              type="text"
              value={quantidadeAmostra}
              onChange={(e) => setQuantidadeAmostra(e.target.value)}
              placeholder="Ex: 100 mL ou 50 g"
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono text-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Status da Amostra
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-zinc-900"
            >
              <option value="RETIDA">RETIDA (Guardada)</option>
              <option value="EM_ANALISE">EM ANÁLISE</option>
              <option value="DESCARTADA">DESCARTADA</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Responsável
            </label>
            <input
              type="text"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Nome do responsável"
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-zinc-900"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Observações
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Informações adicionais da contraprova..."
              className="w-full px-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-zinc-900"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-100 transition shadow-xs"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-xs transition"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar Amostra
          </button>
        </div>
      </form>
    </Modal>
  );
}
