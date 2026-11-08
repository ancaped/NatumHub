import React, { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { MapaGroup } from '../types';
import Drawer from '../../components/ui/Drawer';

export interface NovoModuloDados {
  moduleKey: string;
  label: string;
  groupKey: string;
  purpose: string;
  frontendPath: string;
  backendPath: string;
  routerPrefix: string;
}

interface ModuleCreationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  groups: MapaGroup[];
  onCreateModule: (data: NovoModuloDados) => Promise<boolean>;
  saving: boolean;
}

/** Caminhos sugeridos pela chave e pelo grupo (a ficha se gera deles). */
function caminhosSugeridos(chave: string, grupo: string) {
  return {
    frontendPath: chave ? `Frontend/src/modules/${grupo}/${chave}/` : '',
    backendPath: chave ? `Backend/src/modules/${grupo}/${chave}/` : '',
    routerPrefix: chave ? `/api/${grupo}/${chave.replace(/_/g, '-')}` : '',
  };
}

const CAMPO = 'w-full min-h-[44px] sm:min-h-0 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900';
const ROTULO = 'block text-xs font-semibold text-zinc-600 mb-1';

/** Novo módulo no mapa (painel lateral). Entra como planejado e abre o chamado na Triagem. */
export default function ModuleCreationWizard({ isOpen, onClose, groups, onCreateModule, saving }: ModuleCreationWizardProps) {
  const [moduleKey, setModuleKey] = useState('');
  const [label, setLabel] = useState('');
  const [groupKey, setGroupKey] = useState('');
  // Os grupos chegam depois de o painel montar: sem escolha, vale o primeiro.
  const grupo = groupKey || groups[0]?.key || '';
  const [purpose, setPurpose] = useState('');
  const [caminhos, setCaminhos] = useState(caminhosSugeridos('', ''));
  const [caminhosEditados, setCaminhosEditados] = useState(false);

  const chaveValida = /^[a-z0-9_]+$/.test(moduleKey.trim());
  const podeSalvar = chaveValida && label.trim() !== '' && grupo !== '' && !saving;

  const mudarChave = (v: string) => {
    const k = v.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setModuleKey(k);
    if (!caminhosEditados) setCaminhos(caminhosSugeridos(k, grupo));
  };
  const mudarGrupo = (g: string) => {
    setGroupKey(g);
    if (!caminhosEditados) setCaminhos(caminhosSugeridos(moduleKey, g));
  };
  const mudarCaminho = (campo: keyof typeof caminhos, v: string) => {
    setCaminhosEditados(true);
    setCaminhos((c) => ({ ...c, [campo]: v }));
  };

  const salvar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!podeSalvar) return;
    const ok = await onCreateModule({
      moduleKey: moduleKey.trim(),
      label: label.trim(),
      groupKey: grupo,
      purpose: purpose.trim(),
      frontendPath: caminhos.frontendPath.trim(),
      backendPath: caminhos.backendPath.trim(),
      routerPrefix: caminhos.routerPrefix.trim(),
    });
    if (ok) {
      setModuleKey('');
      setLabel('');
      setPurpose('');
      setCaminhos(caminhosSugeridos('', grupo));
      setCaminhosEditados(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Novo módulo"
      subtitle={<span className="font-sans whitespace-normal">Entra no mapa como planejado e abre um chamado na Triagem para ser implementado.</span>}
      footer={
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={!podeSalvar}
          className="ml-auto min-h-[44px] sm:min-h-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span>Cadastrar módulo</span>
        </button>
      }
    >
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <label className={ROTULO}>Nome</label>
          <input className={CAMPO} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Auditoria de processos" />
        </div>
        <div>
          <label className={ROTULO}>Chave (minúsculas, números e _)</label>
          <input
            className={`${CAMPO} font-mono`}
            value={moduleKey}
            onChange={(e) => mudarChave(e.target.value)}
            placeholder="qualidade_auditoria"
          />
          {moduleKey !== '' && !chaveValida && <p className="mt-1 text-xs text-red-700">Use só letras minúsculas, números e _.</p>}
        </div>
        <div>
          <label className={ROTULO}>Grupo do menu</label>
          <select className={CAMPO} value={grupo} onChange={(e) => mudarGrupo(e.target.value)}>
            {groups.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={ROTULO}>Para que serve</label>
          <textarea
            className={CAMPO}
            rows={3}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Qual rotina da fábrica este módulo atende?"
          />
        </div>
        <fieldset className="rounded-xl border border-zinc-200 p-3 space-y-3">
          <legend className="px-1 text-xs font-semibold text-zinc-600">Caminhos no código (a ficha se gera deles)</legend>
          {([
            ['frontendPath', 'Tela'],
            ['backendPath', 'Servidor'],
            ['routerPrefix', 'Rotas'],
          ] as const).map(([campo, rotulo]) => (
            <div key={campo}>
              <label className={ROTULO}>{rotulo}</label>
              <input
                className={`${CAMPO} font-mono text-xs`}
                value={caminhos[campo]}
                onChange={(e) => mudarCaminho(campo, e.target.value)}
              />
            </div>
          ))}
        </fieldset>
      </form>
    </Drawer>
  );
}
