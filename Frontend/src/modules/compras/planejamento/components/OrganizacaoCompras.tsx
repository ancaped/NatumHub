import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../../../geral/lib/api';
import { getAuthUser, isSupervisor } from '../../../geral/lib/auth';
import type { PropostaSubcategoria, ResumoSubcategoria } from '../../../geral/lib/types';
import { ReportHeader, StatusBadge, TabelaPainel } from '../../../geral/components/ui/ReportKit';

/** Subcategoria com menos itens que isso mostra aviso de possível fusão (nada é fundido sozinho). */
const MINIMO_ITENS = 10;

const RAIZES_DO_MODO: Record<string, string[]> = {
  materia_prima: ['cat_mp'],
  embalagens: ['cat_emb', 'cat_mat'],
  coloracao: ['cat_coloracao'],
  apoio: ['cat_apoio'],
};

const vazio: React.CSSProperties = { padding: '1.5rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' };

function fmtData(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}

/** Propostas de subcategoria dos agentes (supervisor aprova) e aviso de subcategorias pequenas. */
export function OrganizacaoCompras({ active = false, mode = 'all', onMudou }: { active?: boolean; mode?: string; onMudou?: () => void }) {
  const supervisor = isSupervisor(getAuthUser());
  const [propostas, setPropostas] = useState<PropostaSubcategoria[]>([]);
  const [resumo, setResumo] = useState<ResumoSubcategoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [p, r] = await Promise.all([api.getPropostasSubcategoria('pendente'), api.getResumoSubcategorias()]);
      setPropostas(p);
      setResumo(r);
      setErro(null);
    } catch (e) {
      console.error(e);
      setErro('Não foi possível carregar.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (active) carregar();
  }, [active, carregar]);

  const nomes = useMemo(() => new Map(resumo.map((c) => [c.id, c.name])), [resumo]);
  const raizes = RAIZES_DO_MODO[mode];
  const daFamilia = (parentId?: string | null) => !raizes || (parentId ? raizes.includes(parentId) : false);

  const pequenas = useMemo(
    () =>
      resumo
        .filter((c) => c.parentId && daFamilia(c.parentId))
        .filter((c) => !/classe a/i.test(c.name))
        .filter((c) => c.itens + c.produtos < MINIMO_ITENS)
        .sort((a, b) => a.itens + a.produtos - (b.itens + b.produtos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resumo, mode],
  );

  const aprovar = async (p: PropostaSubcategoria) => {
    setGravando(p.id);
    try {
      await api.aprovarPropostaSubcategoria(p.id);
      await carregar();
      onMudou?.();
      window.dispatchEvent(new Event('compras_config_updated'));
    } catch (e) {
      console.error(e);
      setErro('Erro ao aprovar.');
    } finally {
      setGravando(null);
    }
  };

  const recusar = async (p: PropostaSubcategoria) => {
    const motivo = window.prompt(`Por que recusar "${p.nome}"?`);
    if (!motivo || !motivo.trim()) return;
    setGravando(p.id);
    try {
      await api.recusarPropostaSubcategoria(p.id, motivo.trim());
      await carregar();
      onMudou?.();
    } catch (e) {
      console.error(e);
      setErro('Erro ao recusar.');
    } finally {
      setGravando(null);
    }
  };

  const propostasDaFamilia = propostas.filter((p) => daFamilia(p.parentId));

  return (
    <div className="w-full max-w-none">
      <ReportHeader titulo="Organização" subtitulo="Propostas de subcategoria dos agentes e subcategorias pequenas." />
      {erro && <p style={{ color: 'hsl(var(--danger-hsl, 0 70% 45%))', fontSize: '0.8rem', marginBottom: 8 }}>{erro}</p>}

      <h4 style={{ fontSize: '0.82rem', fontWeight: 800, margin: '12px 0 6px' }}>Propostas pendentes ({propostasDaFamilia.length})</h4>
      <TabelaPainel>
        <thead>
          <tr>
            <th>Subcategoria proposta</th>
            <th>Dentro de</th>
            <th>Motivo</th>
            <th>Proposta por</th>
            <th>Data</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {carregando && <tr><td colSpan={6} style={vazio}>Carregando...</td></tr>}
          {!carregando && propostasDaFamilia.length === 0 && <tr><td colSpan={6} style={vazio}>Nenhuma proposta pendente.</td></tr>}
          {propostasDaFamilia.map((p) => (
            <tr key={p.id}>
              <td style={{ fontWeight: 700 }}>{p.nome}{p.periodo ? <span className="text-zinc-400 font-normal"> · {p.periodo} meses</span> : null}</td>
              <td>{p.parentNome}</td>
              <td style={{ maxWidth: 320 }}>{p.motivo}</td>
              <td>{p.propostoPor || '—'}</td>
              <td>{fmtData(p.criadaEm)}</td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                {supervisor ? (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <button type="button" disabled={gravando === p.id} onClick={() => aprovar(p)} className="text-xs bg-zinc-900 text-white px-2.5 py-1 rounded-md font-medium hover:bg-zinc-800 disabled:opacity-40 flex items-center gap-1 cursor-pointer">
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </button>
                    <button type="button" disabled={gravando === p.id} onClick={() => recusar(p)} className="text-xs bg-white text-zinc-700 border border-zinc-200 px-2.5 py-1 rounded-md font-medium hover:bg-zinc-50 disabled:opacity-40 flex items-center gap-1 cursor-pointer">
                      <X className="h-3.5 w-3.5" /> Recusar
                    </button>
                  </span>
                ) : (
                  <StatusBadge variante="apoio">aguarda o supervisor</StatusBadge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TabelaPainel>

      <h4 style={{ fontSize: '0.82rem', fontWeight: 800, margin: '20px 0 2px' }}>Subcategorias com menos de {MINIMO_ITENS} itens ({pequenas.length})</h4>
      <p style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: 6 }}>
        Possível fusão com uma vizinha. Nada é fundido sozinho. As subcategorias Classe A não entram: o estoque delas é mantido por mais tempo de propósito.
      </p>
      <TabelaPainel>
        <thead>
          <tr>
            <th>Subcategoria</th>
            <th>Dentro de</th>
            <th className="numeric-col">Itens</th>
          </tr>
        </thead>
        <tbody>
          {!carregando && pequenas.length === 0 && <tr><td colSpan={3} style={vazio}>Nenhuma subcategoria pequena.</td></tr>}
          {pequenas.map((c) => (
            <tr key={c.id}>
              <td style={{ fontWeight: 600 }}>{c.name}</td>
              <td>{c.parentId ? nomes.get(c.parentId) ?? c.parentId : '—'}</td>
              <td className="numeric-col">{c.itens + c.produtos}</td>
            </tr>
          ))}
        </tbody>
      </TabelaPainel>
    </div>
  );
}
