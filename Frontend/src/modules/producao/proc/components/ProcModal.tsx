import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Sparkles } from 'lucide-react';
import type { ProcItem } from '../../../geral/lib/types';
import { api } from '../../../geral/lib/api';

interface ProcModalProps {
  isOpen: boolean;
  onClose: () => void;
  procToEdit?: ProcItem | null;
  onSaved: () => void;
}

const FAMILIES = [
  { key: 'SPRAY_FINALIZADOR', label: 'Spray e Finalizador Fluido' },
  { key: 'SHAMPOO', label: 'Shampoo Capilar' },
  { key: 'MASCARA_TRATAMENTO', label: 'Máscara e Creme de Tratamento' },
  { key: 'CONDICIONADOR', label: 'Condicionador e Bálsamo' },
  { key: 'OLEO_SERUM', label: 'Óleo Capilar e Sérum' },
  { key: 'TONICO_LOCAO', label: 'Tônico e Loção Capilar' },
  { key: 'OXIDANTE_AOX', label: 'Emulsão Oxidante (AOX)' },
  { key: 'TRANSFORMACAO_ALISAMENTO', label: 'Transformação e Alisamento' },
  { key: 'AMPOLA_DOSE', label: 'Ampola e Dose Concentrada' },
  { key: 'GEL_POMADA', label: 'Pomada, Cera e Gel Capilar' },
  { key: 'PO_DESCOLORANTE', label: 'Pó Descolorante' },
  { key: 'ATIVADOR_FINALIZADOR', label: 'Ativador de Cachos' },
  { key: 'NEUTRALIZANTE', label: 'Neutralizante Capilar' },
  { key: 'OUTROS', label: 'Outros Cosméticos' },
];

export const ProcModal: React.FC<ProcModalProps> = ({
  isOpen,
  onClose,
  procToEdit,
  onSaved,
}) => {
  const [codigoProduto, setCodigoProduto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [proc, setProc] = useState('');
  const [status, setStatus] = useState<'ATIVO' | 'EM_BRANCO' | 'CANCELADO' | 'VENCIDO'>('ATIVO');
  const [categoriaFamilia, setCategoriaFamilia] = useState('OUTROS');
  const [observacoes, setObservacoes] = useState('');
  const [processoInstrucoes, setProcessoInstrucoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (procToEdit) {
      setCodigoProduto(procToEdit.codigoProduto || '');
      setDescricao(procToEdit.descricao || '');
      setProc(procToEdit.proc || '');
      setStatus((procToEdit.status as any) || 'ATIVO');
      setCategoriaFamilia(procToEdit.categoriaFamilia || 'OUTROS');
      setObservacoes(procToEdit.observacoes || '');
      setProcessoInstrucoes(procToEdit.processoInstrucoes || '');
    } else {
      setCodigoProduto('');
      setDescricao('');
      setProc('');
      setStatus('ATIVO');
      setCategoriaFamilia('OUTROS');
      setObservacoes('');
      setProcessoInstrucoes('');
    }
    setError(null);
  }, [procToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao.trim()) {
      setError('A descrição do produto é obrigatória.');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      codigoProduto: codigoProduto.trim() || null,
      descricao: descricao.trim(),
      proc: proc.trim() || null,
      status: proc.trim() ? status : 'EM_BRANCO',
      categoriaFamilia,
      observacoes: observacoes.trim() || null,
      processoInstrucoes: processoInstrucoes.trim() || null,
    };

    try {
      if (procToEdit) {
        await api.updateProc(procToEdit.id, payload);
      } else {
        await api.createProc(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar PROC:', err);
      setError(err?.message || 'Falha ao salvar o PROC no banco de dados.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              {procToEdit ? 'Editar PROC de Produto' : 'Cadastrar Novo PROC'}
            </h2>
            <p className="text-xs text-zinc-500">
              Processo de Fabricação / Notificação ANVISA
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1 space-y-1">
              <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider block">
                Código do Produto
              </label>
              <input
                type="text"
                placeholder="Ex: 1.32.001"
                value={codigoProduto}
                onChange={(e) => setCodigoProduto(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-mono font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider block">
                Descrição do Produto *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: AMONIA HAIR FAST BASE FORTE 250 G NATUM"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider block">
                Número do PROC / Processo ANVISA
              </label>
              <input
                type="text"
                placeholder="Ex: 25351.432828/2012-66"
                value={proc}
                onChange={(e) => setProc(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-mono font-bold text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              <span className="text-[10px] text-zinc-400">
                Se deixado em branco, o status será marcado como 'EM_BRANCO'.
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider block">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="ATIVO">ATIVO / VIGENTE</option>
                <option value="EM_BRANCO">EM BRANCO / PENDENTE</option>
                <option value="CANCELADO">CANCELADO</option>
                <option value="VENCIDO">VENCIDO</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider block">
                Categoria / Família Cosmética
              </label>
              <select
                value={categoriaFamilia}
                onChange={(e) => setCategoriaFamilia(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                {FAMILIES.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider block">
                Presença no Rótulo da Embalagem
              </label>
              <select
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-bold text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="TEM NO RÓTULO">🟢 TEM NO RÓTULO (Já consta impresso)</option>
                <option value="NÃO TEM NO RÓTULO">🟠 NÃO TEM NO RÓTULO (Anotar no lote)</option>
                <option value="EM BRANCO">⚪ EM BRANCO (Sem PROC)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider block">
              Instruções de Processo / Ficha Técnica (Opcional)
            </label>
            <textarea
              rows={4}
              placeholder="Instruções específicas de fabricação, fases de mistura ou detalhes adicionais..."
              value={processoInstrucoes}
              onChange={(e) => setProcessoInstrucoes(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-xs font-mono text-zinc-800 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Save size={15} />
              <span>{saving ? 'Salvando...' : 'Salvar PROC'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
