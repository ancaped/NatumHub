import React from 'react';
import { moduleLabelForNotification, type HubNotification } from '../lib/notifications';
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
    <section className="panel-card break-inside-avoid 2xl:mb-4" style={{ padding: '0.9rem 1rem' }}>
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
  avisos: HubNotification[];
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

/** Insumos sem cobertura que mais produtos da semana travam (ajuda a Compras a priorizar). */
function dadosInsumos(faltas: RelatorioFaltas | null) {
  const por = new Map<string, { nome: string; produtos: number }>();
  for (const l of faltas?.ordens ?? []) {
    for (const p of l.produtos) {
      const vistos = new Set<string>();
      for (const i of [...p.embalagem, ...p.materiaPrima]) {
        if (i.status !== 'falta' || !i.codigo || vistos.has(i.codigo)) continue;
        vistos.add(i.codigo);
        const atual = por.get(i.codigo) ?? { nome: `${i.codigo} · ${i.descricao?.trim() || 'Insumo'}`, produtos: 0 };
        atual.produtos += 1;
        por.set(i.codigo, atual);
      }
    }
  }
  return [...por.values()].sort((a, b) => b.produtos - a.produtos).slice(0, 6);
}

/** Pedidos atrasados somados por fornecedor; sem informação quando cada fornecedor tem um só. */
function dadosFornecedores(pedidos: PedidoCompra[]) {
  const por = new Map<string, number>();
  for (const p of pedidos) {
    const nome = p.cNomeF?.trim() || 'Sem fornecedor';
    por.set(nome, (por.get(nome) ?? 0) + 1);
  }
  const lista = [...por.entries()].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 6);
  return lista.length > 0 && lista[0].qtd > 1 ? lista : [];
}

/** Avisos não lidos por módulo. */
function dadosAvisos(avisos: HubNotification[]) {
  const por = new Map<string, number>();
  for (const n of avisos) {
    if (n.read) continue;
    const m = moduleLabelForNotification(n.moduleKey);
    por.set(m, (por.get(m) ?? 0) + 1);
  }
  const lista = [...por.entries()].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 6);
  return lista.reduce((s, x) => s + x.qtd, 0) >= 3 ? lista : [];
}

/** Há algum gráfico para mostrar? (a tela usa isso para decidir se reserva a coluna da direita) */
export function haGraficos({ checagens, faltas, pedidos, avisos }: GraficosProps): boolean {
  return (
    dadosFaltas(faltas).length > 0 ||
    dadosPedidos(pedidos).length > 0 ||
    dadosChecagens(checagens).length > 0 ||
    dadosInsumos(faltas).length > 0 ||
    dadosFornecedores(pedidos).length > 0 ||
    dadosAvisos(avisos).length > 0
  );
}

export default function Graficos(props: GraficosProps) {
  const { checagens, faltas, pedidos } = props;
  if (!haGraficos(props)) return null;
  const f = dadosFaltas(faltas);
  const p = dadosPedidos(pedidos);
  const c = dadosChecagens(checagens);
  const ins = dadosInsumos(faltas);
  const forn = dadosFornecedores(pedidos);
  const av = dadosAvisos(props.avisos);
  const maxIns = Math.max(1, ...ins.map((x) => x.produtos));
  const maxForn = Math.max(1, ...forn.map((x) => x.qtd));
  const maxAv = Math.max(1, ...av.map((x) => x.qtd));

  const maxF = Math.max(1, ...f.map((l) => l.semCobertura + l.outros));
  const maxP = Math.max(1, ...p.map((x) => x.dias));
  const maxC = Math.max(1, ...c.map((x) => x.quantidade));
  const semanaNum = faltas?.semana.split('-W')[1] ?? '';

  return (
    <div className="space-y-4 min-w-0 2xl:space-y-0 2xl:columns-2 2xl:gap-4">
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

      {ins.length > 0 && (
        <Cartao titulo="Insumos que mais travam a produção" subtitulo="Produtos da semana afetados por cada insumo sem cobertura">
          <ul>
            {ins.map((x) => (
              <LinhaBarra
                key={x.nome}
                rotulo={x.nome}
                max={maxIns}
                segmentos={[{ valor: x.produtos, cor: COR_CRITICO }]}
                valorTexto={`${x.produtos} ${x.produtos === 1 ? 'produto' : 'produtos'}`}
                titulo={`${x.nome}: sem cobertura em ${x.produtos} produtos`}
              />
            ))}
          </ul>
        </Cartao>
      )}

      {forn.length > 0 && (
        <Cartao titulo="Atrasos por fornecedor" subtitulo="Quantidade de pedidos atrasados">
          <ul>
            {forn.map((x) => (
              <LinhaBarra
                key={x.nome}
                rotulo={x.nome}
                max={maxForn}
                segmentos={[{ valor: x.qtd, cor: COR_NEUTRA }]}
                valorTexto={`${x.qtd} ${x.qtd === 1 ? 'pedido' : 'pedidos'}`}
                titulo={`${x.nome}: ${x.qtd} pedidos atrasados`}
              />
            ))}
          </ul>
        </Cartao>
      )}

      {av.length > 0 && (
        <Cartao titulo="Avisos não lidos por módulo" subtitulo="De onde vêm os avisos pendentes">
          <ul>
            {av.map((x) => (
              <LinhaBarra
                key={x.nome}
                rotulo={x.nome}
                max={maxAv}
                segmentos={[{ valor: x.qtd, cor: COR_NEUTRA }]}
                valorTexto={`${x.qtd}`}
                titulo={`${x.nome}: ${x.qtd} avisos não lidos`}
              />
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
