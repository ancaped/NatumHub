import React, { useState } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  Copy,
  Save,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Wrench,
  Thermometer,
  Layers,
} from 'lucide-react';
import type { ProcGenerateResponse } from '../../../geral/lib/types';
import { api } from '../../../geral/lib/api';

interface ProcGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const FAMILIES = [
  { key: 'AUTO', label: 'Detectar Automaticamente' },
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

export const ProcGeneratorModal: React.FC<ProcGeneratorModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [codigoProduto, setCodigoProduto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('AUTO');
  const [customProcNum, setCustomProcNum] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcGenerateResponse | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao.trim()) {
      setError('Informe o nome ou descrição do novo produto.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resp = await api.generateProc({
        descricao: descricao.trim(),
        codigoProduto: codigoProduto.trim() || undefined,
        categoriaFamilia: categoria !== 'AUTO' ? categoria : undefined,
      });
      setResult(resp);
      if (resp.sugeridoProcBase && !customProcNum) {
        setCustomProcNum(resp.sugeridoProcBase);
      }
    } catch (err: any) {
      console.error('Erro na geração do PROC:', err);
      setError(err?.message || 'Falha ao processar o gerador inteligente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDatabase = async () => {
    if (!result) return;
    setSaving(true);
    setError(null);

    try {
      await api.createProc({
        codigoProduto: codigoProduto.trim() || null,
        descricao: descricao.trim(),
        proc: customProcNum.trim() || null,
        status: customProcNum.trim() ? 'ATIVO' : 'EM_BRANCO',
        categoriaFamilia: result.categoriaFamilia,
        observacoes: 'Gerado via Assistente Inteligente de Processos',
        processoInstrucoes: result.processoTextoFormatado,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Erro ao gravar PROC gerado:', err);
      setError(err?.message || 'Falha ao cadastrar o PROC no banco.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyProcess = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.processoTextoFormatado);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Gerador Inteligente de PROC
                <span className="text-[10px] bg-amber-400 text-zinc-900 px-2 py-0.5 rounded-full font-black uppercase">
                  Novo Produto
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Padrões operacionais, etapas de fabricação e parâmetros ANVISA por família
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

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-zinc-50/40">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2.5">
              <AlertTriangle size={17} className="text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form input */}
          <form onSubmit={handleGenerate} className="bg-white p-4.5 rounded-2xl border border-zinc-200 shadow-2xs space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                  Código (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 1.14.050"
                  value={codigoProduto}
                  onChange={(e) => setCodigoProduto(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-mono font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                  Nome / Descrição do Novo Produto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: SPRAY FINALIZADOR LISO SUPREMO 200ML NATUM"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                  Família / Categoria Cosmética
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  {FAMILIES.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer h-[42px]"
              >
                <Sparkles size={16} className="text-amber-400" />
                <span>{loading ? 'Analisando Padrões...' : 'Gerar Processo Padrão (PROC)'}</span>
              </button>
            </div>
          </form>

          {/* Results Display */}
          {result && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Category & Process Base Card */}
              <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-500 uppercase">Família Detectada:</span>
                    <span className="px-3 py-1 bg-zinc-900 text-white rounded-full text-xs font-black tracking-wide">
                      {result.categoriaLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-zinc-700">PROC ANVISA:</label>
                    <input
                      type="text"
                      placeholder="Ex: 25351.000000/2026-00"
                      value={customProcNum}
                      onChange={(e) => setCustomProcNum(e.target.value)}
                      className="border border-zinc-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-zinc-900 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 w-48"
                    />
                  </div>
                </div>

                {/* Similar Approved References */}
                {result.similaresReferencia.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                      Referências Similares no Banco Natum ({result.similaresReferencia.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {result.similaresReferencia.map((sim) => (
                        <button
                          key={sim.id}
                          type="button"
                          onClick={() => sim.proc && setCustomProcNum(sim.proc)}
                          className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-lg text-[11px] font-medium text-zinc-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                          title={`Copiar PROC: ${sim.proc || 'Sem PROC'}`}
                        >
                          <span className="truncate max-w-[200px]">{sim.descricao}</span>
                          {sim.proc && (
                            <span className="text-[9px] font-mono font-bold text-zinc-500 bg-white px-1 py-0.5 rounded border">
                              {sim.proc}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Quality Standards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-white border border-zinc-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">pH Recomendado</span>
                  <span className="text-sm font-black text-zinc-900 block">{result.phFaixaSugerida}</span>
                </div>
                <div className="p-3 bg-white border border-zinc-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Viscosidade Esperada</span>
                  <span className="text-xs font-bold text-zinc-900 block truncate" title={result.viscosidadeFaixaSugerida}>
                    {result.viscosidadeFaixaSugerida}
                  </span>
                </div>
                <div className="p-3 bg-white border border-zinc-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Densidade Alvo</span>
                  <span className="text-sm font-black text-zinc-900 block">{result.densidadeFaixaSugerida}</span>
                </div>
                <div className="p-3 bg-white border border-zinc-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Aspecto</span>
                  <span className="text-xs text-zinc-800 block truncate" title={result.aspectoSugerido}>{result.aspectoSugerido}</span>
                </div>
                <div className="p-3 bg-white border border-zinc-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Cor</span>
                  <span className="text-xs text-zinc-800 block truncate" title={result.corSugerida}>{result.corSugerida}</span>
                </div>
                <div className="p-3 bg-white border border-zinc-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Odor</span>
                  <span className="text-xs text-zinc-800 block truncate" title={result.odorSugerido}>{result.odorSugerido}</span>
                </div>
              </div>

              {/* Manufacturing Steps */}
              <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 uppercase">
                    <Layers className="w-4 h-4 text-zinc-700" />
                    Etapas de Fabricação ({result.etapas.length} Passos)
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyProcess}
                    className="flex items-center gap-1 text-xs font-bold text-zinc-700 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <Copy size={13} />
                    <span>{copiedText ? 'Copiado!' : 'Copiar Processo'}</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {result.etapas.map((step) => (
                    <div key={step.ordem} className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-zinc-900 text-white text-[10px] font-black flex items-center justify-center">
                            {step.ordem}
                          </span>
                          {step.titulo}
                        </span>
                        {step.temperatura && (
                          <span className="text-[10px] text-zinc-600 bg-white px-2 py-0.5 rounded border flex items-center gap-1">
                            <Thermometer className="w-3 h-3 text-amber-600" />
                            {step.temperatura}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-700 leading-relaxed pl-6.5">
                        {step.descricao}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equipment and PPEs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-white border border-zinc-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-800">
                    <Wrench className="w-4 h-4 text-zinc-600" /> Equipamentos
                  </div>
                  <ul className="space-y-1 text-xs text-zinc-600">
                    {result.equipamentosRecomendados.map((eq, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-zinc-400">•</span>
                        <span>{eq}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-3.5 bg-white border border-zinc-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> EPIs de Segurança
                  </div>
                  <ul className="space-y-1 text-xs text-zinc-600">
                    {result.episRecomendados.map((ep, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-zinc-400">•</span>
                        <span>{ep}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Bottom action to save directly */}
              <div className="p-4 bg-zinc-900 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
                <div>
                  <h4 className="text-sm font-bold">Gravar este PROC no NatumHub?</h4>
                  <p className="text-xs text-zinc-400">
                    Vinculará o processo gerado ao produto e disponibilizará nos laudos e calendários de produção.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveToDatabase}
                  disabled={saving}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-zinc-950 hover:bg-zinc-100 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save size={15} />
                  <span>{saving ? 'Gravando...' : 'Gravar e Cadastrar PROC'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
