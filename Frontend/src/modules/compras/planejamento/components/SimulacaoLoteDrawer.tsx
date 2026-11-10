import React, { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import Drawer from '../../../geral/components/ui/Drawer';
import { api } from '../../../geral/lib/api';
import type { SimulacaoLote } from '../../../geral/lib/types';
import { BotaoAcao, TabelaPainel } from '../../../geral/components/ui/ReportKit';
import { imprimirDocumentoHtml } from '../imprimirRelatorioCompra';
import { escaparHtml } from '../relatorioCompra';

const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const vazio: React.CSSProperties = { padding: '1.25rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' };
type Visao = 'resumo' | 'produto' | 'insumo';
const ROTULO: Record<Visao, string> = { resumo: 'só produtos', produto: 'produtos com insumos', insumo: 'por insumo' };

function htmlRelatorio(d: SimulacaoLote, visao: Visao, logo: string): string {
  const cab = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">${logo ? `<img src="${logo}" style="height:34px" />` : ''}
    <div><div style="font-size:16px;font-weight:800">Produtos da simulação — ${escaparHtml(d.lote.numero)}${d.lote.titulo ? ` · ${escaparHtml(d.lote.titulo)}` : ''}</div>
    <div style="font-size:11px;color:#52525b">${d.totais.produtos} produtos · ${d.totais.itensComSimulacao} de ${d.totais.itens} itens do lote têm simulação · gerado em ${new Date().toLocaleDateString('pt-BR')}</div></div></div>
    <div style="font-size:10px;color:#71717a;margin-bottom:10px">${escaparHtml(d.aviso)}</div>`;
  const th = 'style="text-align:left;border-bottom:1.5px solid #18181b;padding:4px 6px;font-size:10px;text-transform:uppercase"';
  const td = 'style="border-bottom:1px solid #e4e4e7;padding:4px 6px;font-size:11px;vertical-align:top"';
  let corpo: string;
  if (visao === 'resumo') {
    const thr = 'style="text-align:right;border-bottom:1.5px solid #18181b;padding:4px 6px;font-size:10px;text-transform:uppercase"';
    const tdc = 'style="border-bottom:1px solid #e4e4e7;padding:2px 6px;font-size:10.5px"';
    corpo = `<table style="width:100%;border-collapse:collapse"><thead><tr><th ${th}>Produto</th><th ${th}>Descrição</th><th ${th}>Situação</th><th ${thr}>A produzir</th><th ${thr}>Insumos do lote</th></tr></thead><tbody>${[...d.produtos]
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
      .map((p) => `<tr><td ${tdc}><b>${escaparHtml(p.codigo)}</b></td><td ${tdc}>${escaparHtml(p.descricao)}</td><td ${tdc}>${escaparHtml(p.situacao)}</td><td ${tdc} align="right">${num(p.producaoQtd)}</td><td ${tdc} align="right">${p.insumos.length}</td></tr>`)
      .join('')}</tbody></table>`;
  } else if (visao === 'produto') {
    corpo = `<table style="width:100%;border-collapse:collapse"><thead><tr><th ${th}>Produto</th><th ${th}>Situação</th><th ${th} >A produzir</th><th ${th}>Insumos deste lote</th></tr></thead><tbody>${d.produtos
      .map(
        (p) => `<tr><td ${td}><b>${escaparHtml(p.codigo)}</b><br/>${escaparHtml(p.descricao)}</td><td ${td}>${escaparHtml(p.situacao)}</td><td ${td}>${num(p.producaoQtd)}</td><td ${td}>${p.insumos
          .map((i) => `${escaparHtml(i.codigo)} ${escaparHtml(i.descricao)} — <b>${num(i.qtd)} ${escaparHtml(i.unidade)}</b>`)
          .join('<br/>')}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  } else {
    corpo = `<table style="width:100%;border-collapse:collapse"><thead><tr><th ${th}>Insumo do lote</th><th ${th}>Pedido</th><th ${th}>Simulação do lote / agora</th><th ${th}>Produtos que o puxam</th></tr></thead><tbody>${d.itens
      .map(
        (i) => `<tr><td ${td}><b>${escaparHtml(i.codigo)}</b><br/>${escaparHtml(i.descricao)}</td><td ${td}>${num(i.quantidadeSolicitada)} ${escaparHtml(i.unidade)}</td><td ${td}>${num(i.simulacaoGuardada)} / ${num(i.simulacaoAgora)}</td><td ${td}>${
          i.produtos.length
            ? i.produtos.map((p) => `${escaparHtml(p.codigo)} ${escaparHtml(p.descricao)} (${escaparHtml(p.situacao)}) — <b>${num(p.insumoQtd)}</b>`).join('<br/>')
            : '<i>sem produto na simulação</i>'
        }</td></tr>`,
      )
      .join('')}</tbody></table>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Simulação — ${escaparHtml(d.lote.numero)}</title>
    <style>@page{size:A4 landscape;margin:12mm}body{font-family:Inter,Arial,sans-serif;color:#18181b}tr{page-break-inside:avoid}</style></head><body>${cab}${corpo}</body></html>`;
}

/** Produtos da simulação de produção (Produzir Urgente / Abrir Ordem) que puxam os itens de um lote de compra. */
export function SimulacaoLoteDrawer({ loteId, onClose }: { loteId: string; onClose: () => void }) {
  const [dados, setDados] = useState<SimulacaoLote | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [visao, setVisao] = useState<Visao>('resumo');

  useEffect(() => {
    setDados(null);
    setErro(null);
    api.getSimulacaoDoLote(loteId).then(setDados).catch(() => setErro('Não foi possível calcular a simulação deste lote.'));
  }, [loteId]);

  const itensSemSim = useMemo(() => (dados ? dados.itens.filter((i) => i.produtos.length === 0) : []), [dados]);

  return (
    <Drawer
      isOpen
      onClose={onClose}
      badge="Simulação"
      title={dados ? `Produtos da simulação · ${dados.lote.numero}` : 'Produtos da simulação'}
      subtitle={dados ? `${dados.totais.produtos} produtos · ${dados.totais.itensComSimulacao} de ${dados.totais.itens} itens com simulação` : 'Calculando...'}
      size="xl"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <BotaoAcao
            primario
            disabled={!dados}
            onClick={() => dados && void imprimirDocumentoHtml((logo) => htmlRelatorio(dados, visao, logo))}
          >
            <Printer size={13} /> Imprimir ({ROTULO[visao]})
          </BotaoAcao>
        </div>
      }
    >
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {erro && <p style={{ color: '#b91c1c', fontSize: '0.8rem' }}>{erro}</p>}
        {!dados && !erro && <p style={{ color: 'hsl(var(--text-secondary-hsl))', fontSize: '0.85rem' }}>Calculando a simulação...</p>}
        {dados && (
          <>
            <p style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))' }}>{dados.aviso}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['resumo', 'produto', 'insumo'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisao(v)}
                  className={visao === v ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}
                  style={{ padding: '8px 14px', minHeight: 40, borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', border: 'none' }}
                >
                  {v === 'resumo' ? `Só produtos (${dados.produtos.length})` : v === 'produto' ? 'Produtos com insumos' : `Por insumo (${dados.itens.length})`}
                </button>
              ))}
            </div>

            {visao === 'resumo' && (
              <TabelaPainel>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Situação</th>
                    <th className="numeric-col">A produzir</th>
                    <th className="numeric-col" title="Quantos insumos deste lote o produto consome">Insumos do lote</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.produtos.length === 0 && <tr><td colSpan={4} style={vazio}>Nenhum produto da simulação usa os itens deste lote.</td></tr>}
                  {[...dados.produtos].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })).map((p) => (
                    <tr key={p.codigo}>
                      <td style={{ minWidth: 200 }}>
                        <div className="product-code" style={{ fontWeight: 700 }}>{p.codigo}</div>
                        <div>{p.descricao}</div>
                      </td>
                      <td>{p.situacao}</td>
                      <td className="numeric-col">{num(p.producaoQtd)}</td>
                      <td className="numeric-col">{p.insumos.length}</td>
                    </tr>
                  ))}
                </tbody>
              </TabelaPainel>
            )}

            {visao === 'produto' && (
              <TabelaPainel>
                <thead>
                  <tr>
                    <th>Produto e insumos deste lote</th>
                    <th>Situação</th>
                    <th className="numeric-col">A produzir</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.produtos.length === 0 && <tr><td colSpan={3} style={vazio}>Nenhum produto da simulação usa os itens deste lote.</td></tr>}
                  {dados.produtos.map((p) => (
                    <tr key={p.codigo}>
                      <td style={{ minWidth: 220 }}>
                        <div className="product-code" style={{ fontWeight: 700 }}>{p.codigo}</div>
                        <div style={{ fontWeight: 600 }}>{p.descricao}</div>
                        {p.insumos.map((i) => (
                          <div key={i.codigo} style={{ fontSize: '0.76rem', marginTop: 3, color: 'hsl(var(--text-secondary-hsl))' }}>
                            <span className="product-code">{i.codigo}</span> {i.descricao} — <strong style={{ color: 'inherit' }}>{num(i.qtd)} {i.unidade}</strong>
                            {i.trocadoDe && <span> (no lugar de {i.trocadoDe})</span>}
                          </div>
                        ))}
                      </td>
                      <td>{p.situacao}</td>
                      <td className="numeric-col">{num(p.producaoQtd)}</td>
                    </tr>
                  ))}
                </tbody>
              </TabelaPainel>
            )}

            {visao === 'insumo' && (
              <TabelaPainel>
                <thead>
                  <tr>
                    <th>Insumo do lote e produtos que o puxam</th>
                    <th className="numeric-col">Pedido</th>
                    <th className="numeric-col" title="Total simulado no dia em que o lote foi gerado">Sim. do lote</th>
                    <th className="numeric-col" title="Simulação recalculada agora">Sim. agora</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.itens.map((i) => (
                    <tr key={i.codigo}>
                      <td style={{ minWidth: 220 }}>
                        <div className="product-code" style={{ fontWeight: 700 }}>{i.codigo}</div>
                        <div style={{ fontWeight: 600 }}>{i.descricao}</div>
                        {i.produtos.length === 0 && <div style={{ fontSize: '0.76rem', marginTop: 3, color: 'hsl(var(--text-secondary-hsl))' }}>sem produto na simulação</div>}
                        {i.produtos.map((p) => (
                          <div key={p.codigo} style={{ fontSize: '0.76rem', marginTop: 3, color: 'hsl(var(--text-secondary-hsl))' }}>
                            <span className="product-code">{p.codigo}</span> {p.descricao} <em>({p.situacao})</em> — <strong style={{ color: 'inherit' }}>{num(p.insumoQtd)}</strong>
                          </div>
                        ))}
                      </td>
                      <td className="numeric-col">{num(i.quantidadeSolicitada)} {i.unidade}</td>
                      <td className="numeric-col">{num(i.simulacaoGuardada)}</td>
                      <td className="numeric-col" style={{ fontWeight: 700 }}>{num(i.simulacaoAgora)}</td>
                    </tr>
                  ))}
                </tbody>
              </TabelaPainel>
            )}
            {visao !== 'insumo' && itensSemSim.length > 0 && (
              <p style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                {itensSemSim.length} item(ns) do lote não aparecem na simulação de hoje: {itensSemSim.map((i) => i.codigo).join(', ')}.
              </p>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
