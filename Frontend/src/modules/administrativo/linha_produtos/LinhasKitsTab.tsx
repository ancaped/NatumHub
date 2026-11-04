import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import type { PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';
import { chamarLinhasKits, KitComLinha, LinhaKit, useLinhasKits } from './linhasKits';

interface Props {
  pedirPrevia: (previa: PreviaAcao) => void;
  avisar: (mensagem: string, tipo?: 'sucesso' | 'erro' | 'info') => void;
}

const NOVA = '__nova__';
const AUTOMATICA = '__auto__';

const prefixosDe = (texto: string) =>
  texto
    .split(/[,\s;]+/)
    .map(p => p.trim())
    .filter(Boolean);

/** Aba Linhas de Kits: mesmo desenho das linhas de produto (tabela e painel). Cada linha lista os prefixos que a sugerem. */
export default function LinhasKitsTab({ pedirPrevia, avisar }: Props) {
  const { linhas, kits, recarregar } = useLinhasKits(true);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [aba, setAba] = useState<'kits' | 'config'>('kits');
  const [buscaKit, setBuscaKit] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [formNome, setFormNome] = useState('');
  const [formPrefixos, setFormPrefixos] = useState('');

  const linhaAberta = aberta && aberta !== NOVA ? linhas.find(l => l.id === aberta) || null : null;
  const nomeLinha = (id: string | null) => (id ? linhas.find(l => l.id === id)?.nome || id : null);

  const resumo = useMemo(() => {
    const por = new Map<string, { sem: number; manuais: number }>();
    for (const k of kits) {
      if (!k.linha) continue;
      const r = por.get(k.linha) || { sem: 0, manuais: 0 };
      if (k.composicao === 0) r.sem += 1;
      if (k.linhaManual) r.manuais += 1;
      por.set(k.linha, r);
    }
    return por;
  }, [kits]);

  const linhasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter(l => l.nome.toLowerCase().includes(q) || l.prefixos.some(p => p.toLowerCase().includes(q)));
  }, [linhas, busca]);

  const kitsDaLinha = useMemo(() => {
    const q = buscaKit.trim().toLowerCase();
    return kits
      .filter(k => k.linha === aberta)
      .filter(k => !q || k.codigo.toLowerCase().includes(q) || (k.descricao || '').toLowerCase().includes(q));
  }, [kits, aberta, buscaKit]);

  const abrir = (id: string) => {
    const l = id === NOVA ? null : linhas.find(x => x.id === id) || null;
    setAberta(id);
    setAba(id === NOVA ? 'config' : 'kits');
    setBuscaKit('');
    setMarcados(new Set());
    setFormNome(l ? l.nome : '');
    setFormPrefixos(l ? l.prefixos.join(', ') : '');
  };
  const fechar = () => {
    setAberta(null);
    setMarcados(new Set());
  };

  const alternar = (codigo: string) => {
    const n = new Set(marcados);
    if (n.has(codigo)) n.delete(codigo);
    else n.add(codigo);
    setMarcados(n);
  };
  const todosMarcados = kitsDaLinha.length > 0 && kitsDaLinha.every(k => marcados.has(k.codigo));
  const marcarTodos = () => setMarcados(todosMarcados ? new Set() : new Set(kitsDaLinha.map(k => k.codigo)));

  // Move kits para outra linha de kits (ou volta ao automático): prévia do servidor e só grava no OK.
  const moverKits = async (destino: string) => {
    if (!destino || marcados.size === 0) return;
    const corpo = { codigos: Array.from(marcados), linhaId: destino === AUTOMATICA ? null : destino };
    try {
      const data = await chamarLinhasKits('/atribuir', 'POST', corpo);
      const itens: { codigo: string; descricao: string; de: string | null; para: string | null }[] = data.resultado?.itens || [];
      pedirPrevia({
        titulo: destino === AUTOMATICA ? 'Voltar kits à linha do prefixo' : `Mover kits para ${nomeLinha(destino)}`,
        linhas: itens.map(i => {
          const kit = kits.find(k => k.codigo === i.codigo);
          const atual = nomeLinha(kit?.linha ?? null) || 'sem linha';
          const novo = i.para ? nomeLinha(i.para) : `${nomeLinha(kit?.linhaSugerida ?? null) || 'sem linha'} (pelo prefixo)`;
          return { titulo: `${i.codigo} · ${i.descricao}`, detalhe: `Linha: ${atual} → ${novo}` };
        }),
        confirmarRotulo: 'Mover kits',
        executar: async () => {
          await chamarLinhasKits('/atribuir', 'POST', corpo, { confirmar: true });
          setMarcados(new Set());
          await recarregar();
          avisar('Linha dos kits atualizada.', 'sucesso');
        },
      });
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao preparar a alteração.', 'erro');
    }
  };

  const salvarConfig = async () => {
    const corpo = { id: linhaAberta?.id, nome: formNome, prefixos: prefixosDe(formPrefixos) };
    try {
      const data = await chamarLinhasKits('', 'POST', corpo);
      const r = data.resultado || {};
      pedirPrevia({
        titulo: r.acao === 'criar' ? 'Criar linha de kits' : 'Alterar linha de kits',
        linhas: [
          {
            titulo: corpo.nome,
            detalhe: `Prefixos: ${corpo.prefixos.length ? corpo.prefixos.join(', ') : '(nenhum)'}${r.antes ? ` · antes: ${r.antes.nome} (${(r.antes.prefixos || []).join(', ') || 'nenhum'})` : ''}`,
          },
        ],
        confirmarRotulo: 'Salvar linha',
        executar: async () => {
          const ok = await chamarLinhasKits('', 'POST', corpo, { confirmar: true });
          await recarregar();
          const id = ok?.resultado?.id as string | undefined;
          if (aberta === NOVA && id) setAberta(id);
          setAba('kits');
          avisar('Linha de kits salva.', 'sucesso');
        },
      });
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao preparar a linha.', 'erro');
    }
  };

  const excluir = async (l: LinhaKit) => {
    try {
      const data = await chamarLinhasKits(`/${encodeURIComponent(l.id)}`, 'DELETE', undefined);
      const r = data.resultado || {};
      pedirPrevia({
        titulo: 'Excluir linha de kits',
        linhas: [{ titulo: l.nome, detalhe: `${r.ligacoesManuaisRemovidas ?? 0} ligação(ões) manual(is) saem; os kits voltam à sugestão pelo prefixo.` }],
        confirmarRotulo: 'Excluir linha',
        pedirMotivo: true,
        executar: async (motivo?: string) => {
          await chamarLinhasKits(`/${encodeURIComponent(l.id)}`, 'DELETE', undefined, { confirmar: true, motivo });
          fechar();
          await recarregar();
          avisar('Linha de kits excluída.', 'sucesso');
        },
      });
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao preparar a exclusão.', 'erro');
    }
  };

  const compBadge = (k: KitComLinha) =>
    k.composicao > 0 ? (
      <span className="px-2 py-0.5 bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-full font-bold text-[11px]">
        {k.composicao} {k.composicao === 1 ? 'insumo' : 'insumos'}
      </span>
    ) : (
      <span className="px-2 py-0.5 bg-white border border-dashed border-zinc-300 text-zinc-500 rounded-full font-bold text-[11px]">Sem composição</span>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white border border-zinc-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar linha de kits por prefixo ou nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-sm font-medium"
          />
        </div>
        <button
          type="button"
          onClick={() => abrir(NOVA)}
          className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nova linha de kits
        </button>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[760px]">
            <thead className="bg-zinc-50 border-b border-zinc-200 font-bold text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 w-28 text-[10px] uppercase tracking-wider">Prefixos</th>
                <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider">Linha de kits</th>
                <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider">Kits</th>
                <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider">Sem composição</th>
                <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider">Ajuste manual</th>
                <th className="px-4 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {linhasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-400">Nenhuma linha de kits encontrada.</td>
                </tr>
              ) : (
                linhasFiltradas.map(l => {
                  const r = resumo.get(l.id) || { sem: 0, manuais: 0 };
                  return (
                    <tr key={l.id} onClick={() => abrir(l.id)} className="hover:bg-zinc-50/70 transition-colors cursor-pointer">
                      <td className="px-4 py-3 font-mono font-bold text-zinc-500">{l.prefixos.length ? l.prefixos.join(', ') : '—'}</td>
                      <td className="px-4 py-3 font-bold text-zinc-800 text-[13px]">{l.nome}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-700">{l.kits}</td>
                      <td className="px-4 py-3 text-right">
                        {r.sem > 0 ? (
                          <span className="px-2 py-0.5 bg-white border border-dashed border-zinc-300 text-zinc-500 rounded-full font-bold text-[11px]">
                            {r.sem} {r.sem === 1 ? 'kit' : 'kits'}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-600">{r.manuais || '—'}</td>
                      <td className="px-4 py-3 text-zinc-300">›</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-xs text-zinc-500 border-t border-zinc-200 bg-zinc-50">
          A composição vem do ERP; kit sem composição também recebe linha.
        </div>
      </div>

      {aberta && (
        <Drawer
          onClose={fechar}
          size="xl"
          badge="Linha de kits"
          title={aberta === NOVA ? 'Nova linha de kits' : linhaAberta?.nome || ''}
          subtitle={aberta === NOVA ? undefined : `Prefixo ${linhaAberta?.prefixos.join(', ') || '—'}`}
          tabs={aberta === NOVA ? undefined : [
            { id: 'kits', label: 'Kits', badge: kitsDaLinha.length },
            { id: 'config', label: 'Configuração' },
          ]}
          activeTab={aba}
          onTabChange={(id) => setAba(id as 'kits' | 'config')}
          footer={
            aba === 'config' ? (
              <>
                <button type="button" onClick={fechar} className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer">Cancelar</button>
                <button
                  type="button"
                  disabled={formNome.trim() === ''}
                  onClick={() => void salvarConfig()}
                  className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  Salvar
                </button>
              </>
            ) : (
              <button type="button" onClick={fechar} className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer">Fechar</button>
            )
          }
        >
          {aba === 'kits' && linhaAberta && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar kit nesta linha"
                    value={buscaKit}
                    onChange={(e) => setBuscaKit(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-sm"
                  />
                </div>
                <span className="text-xs text-zinc-500">{kitsDaLinha.length} kits</span>
              </div>

              {marcados.size > 0 && (
                <div className="bg-zinc-900 text-white rounded-2xl px-4 py-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold bg-zinc-800 rounded px-2 py-0.5">{marcados.size}</span>
                  <span className="text-xs text-zinc-300 flex-1">selecionados</span>
                  <select
                    aria-label="Mover para linha de kits"
                    value=""
                    onChange={(e) => void moverKits(e.target.value)}
                    className="h-8 rounded-xl border border-zinc-700 bg-zinc-800 text-white text-xs font-bold px-2 max-w-[240px] cursor-pointer"
                  >
                    <option value="">Mover para linha de kits…</option>
                    {linhas.filter(l => l.id !== aberta).map(l => (
                      <option key={l.id} value={l.id}>{l.nome}</option>
                    ))}
                    <option value={AUTOMATICA}>Voltar à linha do prefixo</option>
                  </select>
                  <button type="button" onClick={() => setMarcados(new Set())} className="text-xs text-zinc-400 hover:text-white px-2 cursor-pointer">Limpar</button>
                </div>
              )}

              <div className="border border-zinc-200 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-[36px_minmax(0,1fr)_150px] gap-3 items-center px-4 py-2 bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <span className="flex justify-center">
                    <input type="checkbox" aria-label="Selecionar todos os kits" checked={todosMarcados} onChange={marcarTodos} className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer" />
                  </span>
                  <span>Kit</span>
                  <span>Composição (ERP)</span>
                </div>
                {kitsDaLinha.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-400">Nenhum kit nesta linha.</div>
                ) : (
                  kitsDaLinha.map(k => (
                    <div key={k.codigo} className="grid grid-cols-[36px_minmax(0,1fr)_150px] gap-3 items-center px-4 py-2.5 border-b border-zinc-100 last:border-0 hover:bg-zinc-50/70">
                      <span className="flex justify-center">
                        <input type="checkbox" aria-label="Selecionar kit" checked={marcados.has(k.codigo)} onChange={() => alternar(k.codigo)} className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold text-zinc-800 truncate">{k.descricao}</span>
                        <span className="block font-mono text-[11px] text-zinc-500 mt-0.5">
                          {k.codigo} · {k.linhaManual ? 'manual' : 'automática (prefixo)'}
                        </span>
                      </span>
                      <span>{compBadge(k)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {aba === 'config' && (
            <div className="space-y-5">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold text-zinc-700">Nome da linha de kits</span>
                <input
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Ex.: Kits Natum"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </label>
              <div className="space-y-1.5">
                <label htmlFor="prefixos-linha-kits" className="text-[11px] font-bold text-zinc-700">Prefixos do código que sugerem esta linha</label>
                <input
                  id="prefixos-linha-kits"
                  value={formPrefixos}
                  onChange={(e) => setFormPrefixos(e.target.value)}
                  placeholder="Ex.: 1, 10"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {prefixosDe(formPrefixos).map(p => (
                    <span key={p} className="font-mono text-xs font-medium bg-zinc-100 border border-zinc-200 rounded px-2 py-0.5">{p}</span>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500">Um prefixo só pode estar em uma linha. Kit pode ser movido à mão na aba Kits.</p>
              </div>
              {linhaAberta && (
                <div className="border-t border-zinc-200 pt-4">
                  <button
                    type="button"
                    onClick={() => void excluir(linhaAberta)}
                    className="px-4 py-2 rounded-xl border border-red-200 bg-white text-xs font-bold text-red-700 hover:bg-red-50 cursor-pointer"
                  >
                    Excluir linha de kits
                  </button>
                </div>
              )}
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
