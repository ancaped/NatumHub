import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Upload, X, Trash2 } from 'lucide-react';
import { api } from '../../../geral/lib/api';
import { FiscoQuimicaPattern, FiscoQuimicaAgent } from '../../../geral/lib/types';
import Drawer from '../../../geral/components/ui/Drawer';
import { BotaoAcao } from '../../../geral/components/ui/ReportKit';
import { parseInputNumber } from '../lib/fiscoUtils';

const ASPECTOS = ['Creme Homogêneo', 'Líquido Viscoso', 'Gel Fluido', 'Emulsão Cremosa', 'Solução Aquosa', 'Líquido Límpido', 'Pomada / Cera', 'Mousse'];
const CORES = ['Branco', 'Amarelo Claro', 'Incolor / Translúcido', 'Perolado', 'Azul', 'Rosa', 'Verde Claro', 'Dourado', 'Âmbar'];
const ODORES = ['Característico', 'Floral', 'Frutado', 'Herbal', 'Inodoro / Sem Fragrância', 'Cítrico', 'Doce / Baunilha', 'Refrescante / Mentolado'];

// Limites do padrão aceitam milhar (12,000 ou 12.000 = 12000); só o valor medido é como digitado.
const limiteVisc = (v: string) => parseInt(String(v).replace(/[.,\s]/g, ''), 10) || 0;

const campoCls = 'w-full min-h-11 border border-zinc-300 rounded-xl px-3 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900';
const rotuloCls = 'text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1';

/** Padrão do produto a partir do nome ("... 250 ML" → 250 mL). */
function embalagemDoNome(nome: string): { vol: string; un: FiscoQuimicaPattern['packageUnit'] } {
  const m = nome.match(/(\d+(?:[.,]\d+)?)\s*(ML|L|G|KG)\b/i);
  if (!m) return { vol: '1000', un: 'mL' };
  const u = m[2].toUpperCase();
  return { vol: m[1].replace(',', '.'), un: u === 'ML' ? 'mL' : u === 'L' ? 'L' : u === 'G' ? 'g' : 'kg' };
}

interface PatternEditorProps {
  produto: { code: string; name: string };
  padrao: FiscoQuimicaPattern | null;
  agents: FiscoQuimicaAgent[];
  onClose: () => void;
  onSaved: () => void;
  /** Excluir o padrão (pede o motivo); só aparece quando o padrão já existe. */
  onExcluir?: () => void;
}

/** Faixas de pH, viscosidade e densidade, aspecto/cor/odor, foto e corretivos permitidos de um produto — um editor só para toda a tela. */
export function PatternEditor({ produto, padrao, agents, onClose, onSaved, onExcluir }: PatternEditorProps) {
  const emb = embalagemDoNome(produto.name);
  const [phMin, setPhMin] = useState(padrao ? String(padrao.phMin) : '5.50');
  const [phMax, setPhMax] = useState(padrao ? String(padrao.phMax) : '7.00');
  const [viscMin, setViscMin] = useState(padrao ? String(padrao.viscosityMin) : '8000');
  const [viscMax, setViscMax] = useState(padrao ? String(padrao.viscosityMax) : '12000');
  const [densAlvo, setDensAlvo] = useState(padrao ? String(padrao.densityTarget) : '1.000');
  const [densTol, setDensTol] = useState(padrao ? String(padrao.densityTolerance) : '0.020');
  const [vol, setVol] = useState(padrao ? String(padrao.packageVolume) : emb.vol);
  const [unidade, setUnidade] = useState<FiscoQuimicaPattern['packageUnit']>(padrao ? padrao.packageUnit : emb.un);
  const [permitidos, setPermitidos] = useState<string[]>(padrao?.allowedAgents || []);
  const [aspecto, setAspecto] = useState(padrao?.aspect || 'Creme Homogêneo');
  const [cor, setCor] = useState(padrao?.color || 'Branco');
  const [odor, setOdor] = useState(padrao?.odor || 'Característico');
  const [foto, setFoto] = useState(padrao?.imageUrl || '');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const num = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(',', '.'));

  const carregarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        const k = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * k);
        canvas.height = Math.round(img.height * k);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setFoto(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const salvar = async () => {
    const valores = [parseInputNumber(phMin, false), parseInputNumber(phMax, false), limiteVisc(viscMin), limiteVisc(viscMax), parseInputNumber(densAlvo, false), parseInputNumber(densTol, false), parseInputNumber(vol, false)];
    if (valores.some((v) => isNaN(v)) || !aspecto.trim() || !cor.trim() || !odor.trim()) {
      setErro('Preencha todos os campos corretamente.');
      return;
    }
    const [pMin, pMax, vMin, vMax, dAlvo, dTol, volume] = valores;
    if (pMin > pMax || vMin > vMax) {
      setErro('O mínimo não pode ser maior que o máximo.');
      return;
    }
    setSaving(true);
    setErro(null);
    try {
      await api.saveFiscoQuimicaPattern({
        productCode: produto.code,
        phMin: pMin,
        phMax: pMax,
        viscosityMin: vMin,
        viscosityMax: vMax,
        densityTarget: dAlvo,
        densityTolerance: dTol,
        packageVolume: volume,
        packageUnit: unidade,
        allowedAgents: permitidos,
        aspect: aspecto.trim(),
        color: cor.trim(),
        odor: odor.trim(),
        imageUrl: foto.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar o padrão.');
    } finally {
      setSaving(false);
    }
  };

  const par = (rotuloA: string, a: string, setA: (e: React.ChangeEvent<HTMLInputElement>) => void, rotuloB: string, b: string, setB: (e: React.ChangeEvent<HTMLInputElement>) => void, modo: 'decimal' | 'numeric' = 'decimal') => (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={rotuloCls}>{rotuloA}</label>
        <input type="text" inputMode={modo} value={a} onChange={setA} className={campoCls} />
      </div>
      <div>
        <label className={rotuloCls}>{rotuloB}</label>
        <input type="text" inputMode={modo} value={b} onChange={setB} className={campoCls} />
      </div>
    </div>
  );

  return (
    <Drawer
      onClose={onClose}
      title={padrao ? 'Padrão do produto' : 'Definir padrão do produto'}
      subtitle={`${produto.name} · ${produto.code}`}
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {padrao && onExcluir && (
            <BotaoAcao className="min-h-11 md:min-h-0" disabled={saving} onClick={onExcluir}>
              <Trash2 size={14} /> Excluir padrão
            </BotaoAcao>
          )}
          <BotaoAcao className="min-h-11 md:min-h-0" disabled={saving} onClick={onClose}>Cancelar</BotaoAcao>
          <BotaoAcao primario className="min-h-11 md:min-h-0" disabled={saving} onClick={salvar}>{saving ? 'Salvando...' : 'Salvar padrão'}</BotaoAcao>
        </div>
      }
    >
      <div className="space-y-6 p-4">
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-700">Faixas de especificação</h3>
          {par('pH mínimo', phMin, num(setPhMin), 'pH máximo', phMax, num(setPhMax))}
          {par('Viscosidade mínima (cps)', viscMin, num(setViscMin), 'Viscosidade máxima (cps)', viscMax, num(setViscMax), 'numeric')}
          {par('Densidade alvo (g/mL)', densAlvo, num(setDensAlvo), 'Tolerância (± g/mL)', densTol, num(setDensTol))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotuloCls}>Embalagem (conteúdo)</label>
              <input type="text" inputMode="decimal" value={vol} onChange={num(setVol)} className={campoCls} />
            </div>
            <div>
              <label className={rotuloCls}>Unidade</label>
              <select value={unidade} onChange={(e) => setUnidade(e.target.value as FiscoQuimicaPattern['packageUnit'])} className={campoCls}>
                <option value="mL">mL</option>
                <option value="L">L</option>
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-3 border-t border-zinc-200 pt-4">
          <h3 className="text-xs font-bold text-zinc-700">Aspecto, cor e odor do padrão</h3>
          <div>
            <label className={rotuloCls}>Aspecto</label>
            <input list="fq-aspectos" value={aspecto} onChange={(e) => setAspecto(e.target.value)} className={campoCls} />
            <datalist id="fq-aspectos">{ASPECTOS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={rotuloCls}>Cor</label>
              <input list="fq-cores" value={cor} onChange={(e) => setCor(e.target.value)} className={campoCls} />
              <datalist id="fq-cores">{CORES.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <label className={rotuloCls}>Odor</label>
              <input list="fq-odores" value={odor} onChange={(e) => setOdor(e.target.value)} className={campoCls} />
              <datalist id="fq-odores">{ODORES.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
          </div>
          <div>
            <label className={rotuloCls}>Foto da amostra padrão</label>
            <div className="flex items-center gap-3">
              {foto ? (
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-300">
                  <img src={foto} alt="Foto do padrão" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setFoto('')} aria-label="Remover foto" className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white cursor-pointer">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 text-zinc-300">
                  <ImageIcon size={22} />
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <input ref={fileRef} type="file" accept="image/*" onChange={carregarFoto} className="hidden" />
                <BotaoAcao className="min-h-11 md:min-h-0" onClick={() => fileRef.current?.click()}>
                  <Upload size={14} /> {foto ? 'Trocar foto' : 'Enviar foto'}
                </BotaoAcao>
                <p className="text-[11px] text-zinc-500">Orienta o analista na comparação da amostra.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2 border-t border-zinc-200 pt-4">
          <h3 className="text-xs font-bold text-zinc-700">Corretivos permitidos para este produto</h3>
          {agents.length === 0 ? (
            <p className="text-xs text-zinc-500">Nenhum corretivo cadastrado (aba Corretivos).</p>
          ) : (
            <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {agents.map((ag) => (
                <label key={ag.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-xs text-zinc-800">
                  <input
                    type="checkbox"
                    checked={permitidos.includes(ag.id)}
                    onChange={(e) => setPermitidos(e.target.checked ? [...permitidos, ag.id] : permitidos.filter((id) => id !== ag.id))}
                    className="h-5 w-5 shrink-0 accent-zinc-950"
                  />
                  <span className="min-w-0 break-words">{ag.name} <span className="font-mono text-zinc-400">({ag.id})</span></span>
                </label>
              ))}
            </div>
          )}
        </section>

        {erro && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{erro}</p>}
      </div>
    </Drawer>
  );
}
