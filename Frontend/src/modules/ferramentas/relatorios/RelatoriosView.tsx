import { useMemo, useState } from 'react';
import { FileText, ListChecks } from 'lucide-react';
import AppLayout, { type SidebarItem } from '../../geral/components/layout/AppLayout';
import Drawer from '../../geral/components/ui/Drawer';
import { FilterBar, ReportHeader, ReportTabs, StatusBadge, TabelaPainel, type AbaRelatorio } from '../../geral/components/ui/ReportKit';
import { MODULOS_RELATORIOS, RELATORIOS, type RelatorioItem } from './lib/catalogo';
import '../etiquetas/etiquetas.css';

const muted = { color: 'hsl(var(--text-secondary-hsl))' } as const;

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid hsl(var(--card-border-hsl))', fontSize: '0.78rem' }}>
      <span style={muted}>{rotulo}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{valor}</span>
    </div>
  );
}

const situacaoBadge = (r: RelatorioItem) =>
  r.situacao === 'registrado' ? (
    <StatusBadge variante="saudavel">Registrado</StatusBadge>
  ) : (
    <StatusBadge variante="descontinuado">No código</StatusBadge>
  );

/**
 * Relatórios em A4 do Nexus: catálogo de todos que o sistema imprime, de onde vêm e se já estão registrados.
 * Mesma ideia de Etiquetas: cada relatório vira um modelo com chave (do sistema ou editável).
 */
export default function RelatoriosView({ onBackToHub }: { onBackToHub: () => void }) {
  const [secao, setSecao] = useState<'catalogo' | 'como'>('catalogo');
  const [modulo, setModulo] = useState('todos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<RelatorioItem | null>(null);

  const abas: AbaRelatorio[] = useMemo(
    () => [
      { id: 'todos', label: 'Todos', contagem: RELATORIOS.length },
      ...MODULOS_RELATORIOS.map((m) => ({ id: m, label: m, contagem: RELATORIOS.filter((r) => r.modulo === m).length })),
    ],
    [],
  );

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return RELATORIOS.filter((r) => (modulo === 'todos' || r.modulo === modulo) && (!q || `${r.nome} ${r.modulo} ${r.tipo} ${r.descricao}`.toLowerCase().includes(q)));
  }, [modulo, busca]);

  const sidebarItems: SidebarItem[] = [
    { id: 'catalogo', label: 'Catálogo', icon: FileText, badge: RELATORIOS.length },
    { id: 'como', label: 'Como funciona', icon: ListChecks },
  ];

  return (
    <AppLayout
      moduleTitle="Relatórios"
      moduleSubtitle="Catálogo de relatórios A4"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={secao}
      onTabChange={(id) => setSecao(id as 'catalogo' | 'como')}
    >
      <div className="view-container ferr-view ferr-cartoes">
        {secao === 'catalogo' && (
          <>
            <ReportHeader titulo="Relatórios do sistema" subtitulo="Tudo que o Nexus imprime em A4, de onde vem e se já está registrado aqui" />
            <ReportTabs abas={abas} ativa={modulo} onChange={setModulo} />
            <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar relatório..." />
            <TabelaPainel>
              <thead>
                <tr>
                  <th>Relatório</th>
                  <th style={{ width: 120 }}>Módulo</th>
                  <th style={{ width: 90 }}>Tipo</th>
                  <th style={{ width: 110 }}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div className="lote-vazio">Nenhum relatório encontrado.</div>
                    </td>
                  </tr>
                )}
                {linhas.map((r) => (
                  <tr key={r.chave} style={{ cursor: 'pointer' }} onClick={() => setAberto(r)}>
                    <td style={{ maxWidth: 0 }}>
                      <div className="lote-nome">{r.nome}</div>
                      <div className="lote-sub">{r.descricao}</div>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{r.modulo}</td>
                    <td style={{ fontSize: '0.78rem', ...muted }}>{r.tipo}</td>
                    <td>{situacaoBadge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </TabelaPainel>
          </>
        )}

        {secao === 'como' && (
          <>
            <ReportHeader titulo="Como funciona" subtitulo="O mesmo esquema de Etiquetas, para relatórios em A4" />
            <div className="panel-card" style={{ padding: 20, fontSize: '0.82rem', lineHeight: 1.65, maxWidth: 760 }}>
              <p style={{ marginTop: 0 }}><strong>Hoje:</strong> cada relatório tem o HTML e o estilo dentro do módulo dono. Este catálogo lista todos, para você ver o que existe e onde está.</p>
              <p><strong>Próximo passo:</strong> cada relatório vira um modelo com chave (cabeçalho, tabela de itens, assinaturas), editável aqui, e o módulo só informa os dados.</p>
              <p><strong>Duas abas, como em Etiquetas:</strong> <em>Do sistema</em> (usados pelos módulos, com “restaurar padrão”) e <em>Editáveis</em> (livres, criados por você).</p>
              <p style={{ marginBottom: 0 }}><strong>Ordem sugerida:</strong> começar pelas folhas de controle (mais simples) e deixar os laudos por último. Cada migração é feita na conversa do módulo dono.</p>
            </div>
          </>
        )}
      </div>

      {aberto && (
        <Drawer onClose={() => setAberto(null)} title={aberto.nome} subtitle={`${aberto.modulo} · ${aberto.tipo}`} badge={aberto.situacao === 'registrado' ? 'Registrado' : 'No código'} size="md">
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: '0.8rem', margin: '0 0 12px', ...muted }}>{aberto.descricao}</p>
            <Linha rotulo="Módulo" valor={aberto.modulo} />
            <Linha rotulo="Tipo" valor={aberto.tipo} />
            <Linha rotulo="Chave sugerida" valor={<code>{aberto.chave}</code>} />
            <Linha rotulo="Situação" valor={aberto.situacao === 'registrado' ? 'Registrado em Relatórios' : 'Montado no código do módulo'} />
            <div style={{ marginTop: 14, fontSize: '0.72rem', fontWeight: 700, ...muted }}>ONDE ESTÁ NO CÓDIGO</div>
            {aberto.arquivos.map((a) => (
              <div key={a} className="lote-chip" style={{ display: 'block', marginTop: 6, fontSize: '0.7rem', fontWeight: 500, wordBreak: 'break-all' }}>
                {a}
              </div>
            ))}
          </div>
        </Drawer>
      )}
    </AppLayout>
  );
}
