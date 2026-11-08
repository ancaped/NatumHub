import React from 'react';
import { contarFaltas, type ChecagemSaude, type PedidoCompra, type RelatorioFaltas } from './tipos';

/**
 * Gráficos da tela inicial, desenhados com os dados que a tela já busca (sem endpoint novo).
 * Barras horizontais: ranking em uma cor só; a barra empilhada usa as cores de status e sempre vem com
 * legenda escrita e o valor impresso ao lado (a cor nunca é a única informação).
 */

const COR_CRITICO = 'hsl(var(--danger-hsl))';
const COR_AVISO = 'hsl(var(--warning-hsl))';
const COR_NEUTRA = 'hsl(var(--primary-hsl))';

interface Segmento {
  valor: number;
  cor: string;
}

function LinhaBarra({
  rotulo,
  segmentos,
  max,
  valorTexto,
  titulo,
}: {
  rotulo: string;
  segmentos: Segmento[];
  max: number;
  valorTexto: string;
  titulo: string;
}) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  return (
    <li className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-2 py-1.5" title={titulo}>
      <span className="text-xs text-zinc-700 truncate">{rotulo}</span>
      <span className="block h-2.5 rounded-full bg-zinc-100 overflow-hidden" aria-hidden>
        <span className="flex h-full gap-[2px]" style={{ width: `${Math.max(2, (total / max) * 100)}%` }}>
          {segmentos
            .filter((s) => s.valor > 0)
            .map((s, i) => (
              <span key={i} className="h-full rounded-full" style={{ flexGrow: s.valor, flexBasis: 0, backgroundColor: s.cor }} />
            ))}
        </span>
      </span>
      <span className="text-xs font-semibold text-zinc-900 tabular-nums text-right whitespace-nowrap">{valorTexto}</span>
    </li>
  );
}

function Legenda({ itens }: { itens: { cor: string; texto: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
      {itens.map((i) => (
        <span key={i.texto} className="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: i.cor }} aria-hidden />
          {i.texto}
        </span>
      ))}
    </div>
  );
}

function Cartao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <section className="panel-card" style={{ padding: '0.9rem 1rem' }}>
      <h3 className="text-sm font-bold text-zinc-900">{titulo}</h3>
      {subtitulo && <p className="text-[11px] text-zinc-500 mt-0.5 mb-2">{subtitulo}</p>}
      {children}
    </section>
  );
}

const diasDeAtraso = (previsao?: string | null): number | null => {
  if (!previsao) return null;
  const d = new Date(`${previsao.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoje.getTime() - d.getTime()) / 86400000));
};

interface GraficosProps {
  checagens: ChecagemSaude[];
  faltas: RelatorioFaltas | null;
  pedidos: PedidoCompra[];
}

function dadosFaltas(faltas: RelatorioFaltas | null) {
  return (faltas?.ordens ?? [])
    .map((l) => ({ linha: l.linha, ...contarFaltas(l.produtos) }))
    .filter((l) => l.semCobertura + l.outros > 0)
    .sort((a, b) => b.semCobertura + b.outros - (a.semCobertura + a.outros))
    .slice(0, 8);
}

function dadosPedidos(pedidos: PedidoCompra[]) {
  return pedidos
    .map((p) => ({ p, dias: diasDeAtraso(p.dPrevisao) }))
    .filter((x): x is { p: PedidoCompra; dias: number } => x.dias !== null && x.dias > 0)
    .sort((a, b) => b.dias - a.dias)
    .slice(0, 6);
}

function dadosChecagens(checagens: ChecagemSaude[]) {
  return checagens
    .filter((c) => c.severidade !== 'ok' && c.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 6);
}

/** Há algum gráfico para mostrar? (a tela usa isso para decidir se reserva a coluna da direita) */
export function haGraficos({ checagens, faltas, pedidos }: GraficosProps): boolean {
  return dadosFaltas(faltas).length > 0 || dadosPedidos(pedidos).length > 0 || dadosChecagens(checagens).length > 0;
}

export default function Graficos({ checagens, faltas, pedidos }: GraficosProps) {
  const f = dadosFaltas(faltas);
  const p = dadosPedidos(pedidos);
  const c = dadosChecagens(checagens);
  if (f.length === 0 && p.length === 0 && c.length === 0) return null;

  const maxF = Math.max(1, ...f.map((l) => l.semCobertura + l.outros));
  const maxP = Math.max(1, ...p.map((x) => x.dias));
  const maxC = Math.max(1, ...c.map((x) => x.quantidade));
  const semanaNum = faltas?.semana.split('-W')[1] ?? '';

  return (
    <div className="space-y-4 min-w-0">
      {f.length > 0 && (
        <Cartao titulo="Faltas de insumos por linha" subtitulo={`Ordens da semana ${semanaNum}, em insumos`}>
          <Legenda
            itens={[
              { cor: COR_CRITICO, texto: 'sem cobertura' },
              { cor: COR_AVISO, texto: 'chegam depois, sem previsão ou atrasados' },
            ]}
          />
          <ul>
            {f.map((l) => (
              <LinhaBarra
                key={l.linha}
                rotulo={l.linha}
                max={maxF}
                segmentos={[
                  { valor: l.semCobertura, cor: COR_CRITICO },
                  { valor: l.outros, cor: COR_AVISO },
                ]}
                valorTexto={`${l.semCobertura} + ${l.outros}`}
                titulo={`${l.linha}: ${l.semCobertura} sem cobertura e ${l.outros} chegam depois, sem previsão ou atrasados`}
              />
            ))}
          </ul>
        </Cartao>
      )}

      {p.length > 0 && (
        <Cartao titulo="Pedidos de compra atrasados" subtitulo="Dias de atraso em relação à previsão, do mais antigo para o mais novo">
          <ul>
            {p.map(({ p: ped, dias }) => (
              <LinhaBarra
                key={ped.nRegistro}
                rotulo={`${ped.nRegistro} · ${ped.cNomeF?.trim() || 'Sem fornecedor'}`}
                max={maxP}
                segmentos={[{ valor: dias, cor: COR_NEUTRA }]}
                valorTexto={`${dias} ${dias === 1 ? 'dia' : 'dias'}`}
                titulo={`Pedido ${ped.nRegistro}, ${ped.cNomeF ?? 'sem fornecedor'}: ${dias} dias de atraso`}
              />
            ))}
          </ul>
        </Cartao>
      )}

      {c.length > 0 && (
        <Cartao titulo="Dados do ERP com problema" subtitulo="Ocorrências por checagem, da última verificação">
          <Legenda
            itens={[
              { cor: COR_CRITICO, texto: 'crítico' },
              { cor: COR_AVISO, texto: 'aviso' },
            ]}
          />
          <ul>
            {c.map((x) => (
              <LinhaBarra
                key={x.chave}
                rotulo={x.titulo}
                max={maxC}
                segmentos={[{ valor: x.quantidade, cor: x.severidade === 'critico' ? COR_CRITICO : COR_AVISO }]}
                valorTexto={`${x.quantidade}`}
                titulo={`${x.titulo}: ${x.quantidade} (${x.severidade === 'critico' ? 'crítico' : 'aviso'})`}
              />
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
