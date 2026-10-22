import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiJson } from '../../../geral/lib/http';
import { BotaoAcao, FilterBar, FiltroSelect, ReportHeader, StatusBadge, TabelaPainel } from '../../../geral/components/ui/ReportKit';
import type { VarianteBadge } from '../../../geral/components/ui/ReportKit';

type StatusInsumo = 'ok' | 'depende_atrasado' | 'chega_depois' | 'chega_sem_data' | 'falta';

interface InsumoBase {
  codigo: string;
  descricao: string;
  unidade?: string | null;
  necessario: number;
  livreNaData: number;
  falta: number;
  status: StatusInsumo;
  chegaEm?: string;
  pedido?: number;
  fornecedor?: string;
}

interface BaseAberta {
  ordemId: string;
  produto: string;
  descricao: string;
  kg: number;
  data?: string;
  origem: 'ordem' | 'fila';
  consome: boolean;
  insumos: InsumoBase[];
}

interface Resposta {
  geradoEm: string;
  semanas: number;
  bases: BaseAberta[];
}

const fmt = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtData = (d?: string | null) => (d ? d.slice(0, 10).split('-').slice(1).reverse().join('/') : '');

function situacao(i: InsumoBase): { variante: VarianteBadge; rotulo: string } {
  switch (i.status) {
    case 'ok':
      return { variante: 'saudavel', rotulo: 'Coberto' };
    case 'chega_depois':
      return { variante: 'ordem', rotulo: `Chega ${fmtData(i.chegaEm)}` };
    case 'chega_sem_data':
      return { variante: 'aguardando', rotulo: 'Sem previsão' };
    case 'depende_atrasado':
      return { variante: 'ordem', rotulo: 'Pedido atrasado' };
    default:
      return { variante: 'critico', rotulo: 'Sem cobertura' };
  }
}

/**
 * Bases abertas: ordens (planejamento e fila) das próximas 4 semanas cujo produto é uma base, e o que cada uma
 * consome de matéria-prima. Usa a mesma cobertura do Planejamento (trocas, sem controle e origem da base valem).
 */
export function BasesAbertasTab({ active = true }: { active?: boolean }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [sit, setSit] = useState<'todas' | 'falta'>('todas');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setDados(await apiJson<Resposta>('/api/producao/cobertura/bases-abertas'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as bases abertas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active && !dados) carregar();
  }, [active, dados, carregar]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const out: Array<{ b: BaseAberta; i: InsumoBase; primeira: boolean }> = [];
    for (const b of dados?.bases ?? []) {
      let primeira = true;
      for (const i of b.insumos) {
        if (sit === 'falta' && i.status === 'ok') continue;
        if (q && !`${b.produto} ${b.descricao} ${i.descricao} ${i.codigo}`.toLowerCase().includes(q)) continue;
        out.push({ b, i, primeira });
        primeira = false;
      }
    }
    return out;
  }, [dados, busca, sit]);

  return (
    <div className="view-container" style={{ paddingBottom: 30 }}>
      <ReportHeader
        titulo="Bases abertas em matérias-primas"
        subtitulo={dados ? `Ordens e fila das próximas ${dados.semanas} semanas · o que cada base consome` : 'Carregando...'}
        acoes={
          <BotaoAcao onClick={carregar} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Atualizar
          </BotaoAcao>
        }
      />
      {erro && <p style={{ fontSize: '0.78rem', color: 'hsl(var(--danger-hsl))', marginBottom: 8 }}>{erro}</p>}
      <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar base ou matéria-prima...">
        <FiltroSelect
          value={sit}
          onChange={(v) => setSit(v as 'todas' | 'falta')}
          opcoes={[
            { valor: 'todas', rotulo: 'Todos os insumos' },
            { valor: 'falta', rotulo: 'Só os que faltam' },
          ]}
        />
      </FilterBar>
      <TabelaPainel>
        <thead>
          <tr>
            <th style={{ width: '28%' }}>Base</th>
            <th>Matéria-prima</th>
            <th className="numeric-col">Necessário</th>
            <th className="numeric-col">Livre</th>
            <th className="numeric-col">Falta</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {dados && linhas.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }}>
                Nenhuma base com ordem aberta nas próximas {dados.semanas} semanas.
              </td>
            </tr>
          )}
          {linhas.map(({ b, i, primeira }, idx) => {
            const s = situacao(i);
            const un = i.unidade ? ` ${i.unidade}` : '';
            return (
              <tr key={`${b.ordemId}-${i.codigo}`} style={primeira && idx > 0 ? { borderTop: '2px solid hsl(var(--card-border-hsl))' } : undefined}>
                <td>
                  {primeira && (
                    <>
                      <span className="product-code">{b.produto}</span>
                      <div className="product-desc" style={{ fontWeight: 600 }}>{b.descricao || 'sem descrição'}</div>
                      <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                        {fmt(b.kg)} kg · {b.origem === 'fila' ? 'fila' : fmtData(b.data)}
                        {!b.consome ? ' · já no ERP' : ''}
                      </div>
                    </>
                  )}
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{i.descricao}</div>
                  <span className="product-code" style={{ fontSize: '0.65rem' }}>{i.codigo}</span>
                </td>
                <td className="numeric-col" style={{ whiteSpace: 'nowrap' }}>{fmt(i.necessario)}{un}</td>
                <td className="numeric-col" style={{ whiteSpace: 'nowrap', color: 'hsl(var(--text-secondary-hsl))' }}>{fmt(i.livreNaData)}</td>
                <td className="numeric-col" style={{ whiteSpace: 'nowrap', fontWeight: 700, color: i.falta > 0 ? 'hsl(var(--danger-hsl))' : undefined }}>
                  {i.falta > 0 ? `${fmt(i.falta)}${un}` : '-'}
                </td>
                <td>
                  <StatusBadge variante={s.variante}>{s.rotulo}</StatusBadge>
                  {i.pedido ? <div style={{ fontSize: '0.62rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: 2 }}>Pedido {i.pedido}{i.fornecedor ? ` · ${i.fornecedor}` : ''}</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TabelaPainel>
    </div>
  );
}
