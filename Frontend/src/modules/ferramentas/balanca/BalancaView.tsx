import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Layers, Printer, RefreshCw, Scale } from 'lucide-react';
import AppLayout, { type SidebarItem } from '../../geral/components/layout/AppLayout';
import Drawer from '../../geral/components/ui/Drawer';
import { apiFetch, apiJson } from '../../geral/lib/http';
import { BotaoAcao, FilterBar, ReportHeader, ReportTabs, StatusBadge, TabelaPainel } from '../../geral/components/ui/ReportKit';
import type { AbaRelatorio } from '../../geral/components/ui/ReportKit';

type Grupo = 'ativos' | 'terceirizados' | 'inativos' | 'fragrancias';

interface ItemCarga {
  codigoErp: string;
  codigoSistema: string;
  codigoRapido: number;
  novo: boolean;
  nomeBalanca: string;
  nomeCompleto: string;
  unidade: string;
}

interface Carga {
  total: number;
  novosCodigos: number;
  grupos: Record<Grupo, ItemCarga[]>;
}

interface NovoCodigo {
  codigoErp: string;
  codigoRapido: number;
  nome: string;
}

const GRUPOS: Array<{ id: Grupo; titulo: string }> = [
  { id: 'ativos', titulo: 'Ativos' },
  { id: 'terceirizados', titulo: 'Terceirizados' },
  { id: 'inativos', titulo: 'Inativos' },
  { id: 'fragrancias', titulo: 'Fragrâncias' },
];

const ROTULO_GRUPO: Record<Grupo, string> = {
  ativos: 'Ativo',
  terceirizados: 'Terceirizado',
  inativos: 'Inativo',
  fragrancias: 'Fragrância',
};

interface BalancaViewProps {
  onBackToHub?: () => void;
}

/**
 * Carga da balança Toledo Prix 4 Due (MGV 7): tabela das matérias-primas, códigos rápidos novos em 2 passos
 * (prévia + confirmação, com auditoria) e download do ITENSMGV.TXT. Padrão visual: tabela + abas + busca + badges.
 */
export default function BalancaView({ onBackToHub }: BalancaViewProps) {
  const [dados, setDados] = useState<Carga | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<Grupo | 'todos'>('todos');
  const [previa, setPrevia] = useState<NovoCodigo[] | null>(null);
  const [gravando, setGravando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setDados(await apiJson<Carga>('/api/ferramentas/balanca/itens'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os itens da balança.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // 1º passo: prévia dos códigos novos (nada é gravado)
  const verPrevia = async () => {
    setErro(null);
    try {
      const r = await apiJson<{ novos: NovoCodigo[] }>('/api/ferramentas/balanca/codigos', {
        method: 'POST',
        body: JSON.stringify({ confirmar: false }),
      });
      setPrevia(r.novos ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível calcular os códigos novos.');
    }
  };

  // 2º passo: confirmar
  const confirmar = async () => {
    setGravando(true);
    setErro(null);
    try {
      await apiJson('/api/ferramentas/balanca/codigos', { method: 'POST', body: JSON.stringify({ confirmar: true }) });
      setPrevia(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar os códigos.');
    } finally {
      setGravando(false);
    }
  };

  const baixar = async () => {
    setErro(null);
    try {
      const res = await apiFetch('/api/ferramentas/balanca/itensmgv');
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        throw new Error(corpo?.error ?? `HTTP ${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ITENSMGV.TXT';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível baixar a carga.');
    }
  };

  const linhas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    const out: Array<ItemCarga & { grupo: Grupo }> = [];
    for (const g of GRUPOS) {
      if (aba !== 'todos' && aba !== g.id) continue;
      for (const i of dados?.grupos?.[g.id] ?? []) {
        if (!q || `${i.nomeBalanca} ${i.nomeCompleto} ${i.codigoSistema} ${i.codigoRapido}`.toUpperCase().includes(q)) out.push({ ...i, grupo: g.id });
      }
    }
    return out;
  }, [dados, aba, busca]);

  const abas: AbaRelatorio[] = [
    { id: 'todos', label: 'Todos', icone: <Layers size={14} />, contagem: dados?.total ?? 0 },
    ...GRUPOS.map((g) => ({ id: g.id, label: g.titulo, contagem: dados?.grupos?.[g.id]?.length ?? 0 })),
  ];

  const sidebarItems: SidebarItem[] = [{ id: 'carga', label: 'Carga da Balança', icon: Scale }];
  const novos = dados?.novosCodigos ?? 0;

  return (
    <AppLayout
      moduleTitle="Carga da Balança"
      moduleSubtitle="Toledo Prix 4 Due · MGV 7 · matérias-primas"
      onBackToHub={onBackToHub || (() => undefined)}
      sidebarItems={sidebarItems}
      activeTab="carga"
      onTabChange={() => undefined}
    >
      <div className="view-container balanca-print" style={{ padding: '1.5rem', paddingBottom: 30 }}>
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .balanca-print, .balanca-print * { visibility: visible; }
            .balanca-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 10mm !important; }
            .balanca-no-print { display: none !important; }
            @page { size: A4; margin: 10mm; }
            tr { break-inside: avoid; }
          }
        `}</style>

        <ReportHeader
          titulo="Carga da Balança"
          subtitulo={
            dados
              ? `${dados.total} matérias-primas · 2 códigos cada: rápido (permanente) e do sistema`
              : 'Matérias-primas para a balança Toledo'
          }
          acoes={
            <div className="balanca-no-print" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {novos > 0 && (
                <BotaoAcao onClick={verPrevia} title="Atribuir código rápido às matérias-primas novas">
                  Atribuir {novos} código(s) novo(s)
                </BotaoAcao>
              )}
              <BotaoAcao
                primario
                onClick={baixar}
                disabled={!dados || novos > 0}
                title={novos > 0 ? 'Confirme os códigos novos antes de baixar' : 'Baixar ITENSMGV.TXT para o MGV 7'}
              >
                <Download size={15} /> Baixar ITENSMGV.TXT
              </BotaoAcao>
              <BotaoAcao onClick={() => window.print()}>
                <Printer size={15} /> Imprimir
              </BotaoAcao>
              <BotaoAcao onClick={carregar} disabled={loading}>
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Atualizar
              </BotaoAcao>
            </div>
          }
        />

        {erro && <p style={{ fontSize: '0.78rem', color: 'hsl(var(--danger-hsl))', marginBottom: 8 }}>{erro}</p>}

        <div className="balanca-no-print">
          <ReportTabs abas={abas} ativa={aba} onChange={(id) => setAba(id as Grupo | 'todos')} />
          <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar nome ou código..." />
        </div>

        <TabelaPainel>
          <thead>
            <tr>
              <th style={{ width: 90, textAlign: 'center' }}>Código 1</th>
              <th style={{ width: 110, textAlign: 'center' }}>Sistema</th>
              <th>Nome na balança</th>
              <th>Nome completo</th>
              <th>Grupo</th>
              <th style={{ width: 50, textAlign: 'center' }}>Un.</th>
            </tr>
          </thead>
          <tbody>
            {loading && !dados && (
              <tr>
                <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }}>Carregando...</td>
              </tr>
            )}
            {dados && linhas.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }}>Nenhuma matéria-prima com este filtro.</td>
              </tr>
            )}
            {linhas.map((i) => (
              <tr key={i.codigoErp}>
                <td style={{ textAlign: 'center', fontWeight: 800 }}>
                  {i.codigoRapido}
                  {i.novo && <div><StatusBadge variante="ordem">Novo</StatusBadge></div>}
                </td>
                <td style={{ textAlign: 'center' }}><span className="product-code">{i.codigoSistema}</span></td>
                <td style={{ fontWeight: 600 }}>{i.nomeBalanca}</td>
                <td style={{ color: 'hsl(var(--text-secondary-hsl))', fontSize: '0.72rem' }}>{i.nomeCompleto}</td>
                <td style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))' }}>{ROTULO_GRUPO[i.grupo]}</td>
                <td style={{ textAlign: 'center' }}>{i.unidade}</td>
              </tr>
            ))}
          </tbody>
        </TabelaPainel>

        {previa && (
          <Drawer
            onClose={() => setPrevia(null)}
            title="Códigos rápidos novos"
            subtitle="Prévia: nada foi gravado ainda"
            size="md"
            footer={
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: 12 }}>
                <BotaoAcao onClick={() => setPrevia(null)}>Cancelar</BotaoAcao>
                <BotaoAcao primario onClick={confirmar} disabled={gravando || previa.length === 0}>
                  OK, gravar {previa.length} código(s)
                </BotaoAcao>
              </div>
            }
          >
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: 8 }}>
                O código rápido é permanente: depois de gravado, nunca é reatribuído. A ação fica registrada com o seu nome.
              </p>
              <div className="panel-card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="data-table compacta">
                  <thead>
                    <tr>
                      <th style={{ width: 70, textAlign: 'center' }}>Código</th>
                      <th>Matéria-prima</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.map((n) => (
                      <tr key={n.codigoErp}>
                        <td style={{ textAlign: 'center', fontWeight: 800 }}>{n.codigoRapido}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{n.nome}</div>
                          <span className="product-code" style={{ fontSize: '0.65rem' }}>{n.codigoErp}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Drawer>
        )}
      </div>
    </AppLayout>
  );
}
