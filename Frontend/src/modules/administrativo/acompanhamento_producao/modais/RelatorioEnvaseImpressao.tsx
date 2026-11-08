import React from 'react';
import { formatDateOnly } from '../lib/datas';
import { rotuloLote } from '../lib/lotes';
import type { AuthUser } from '/home/edson/Documentos/api/.claude/worktrees/producao-refator-acompanhamento-04ae88/Frontend/src/modules/geral/lib/auth';

export interface RelatorioEnvaseImpressaoProps {
  currentUser: AuthUser;
  relatorioAgrupamento: 'linha' | 'tabela' | 'produto';
  relatorioConsolidadoPorProduto: { productCode: string; productDescription: string; categoriaEnvase: string; totalUn: number; totalKg: number; lotes: string[]; linhas: Set<string>; }[];
  relatorioDataFim: string;
  relatorioDataInicio: string;
  relatorioEnvaseItems: { id: string | number; loteNumber: string; productCode: string; productDescription: string; dataProgramada: string; dataProgramadaFmt: string; diaSemana: string; linha: string; ordem: number; quantity: number; quantityKg: number; categoriaEnvase: string; cor: string; statusEnvase: string; observacoes: string; origem: 'programado' | 'liberado'; }[];
  relatorioIncluirLiberados: boolean;
  relatorioLinhaFilter: 'TODAS' | 'Linha 1' | 'Linha 2' | 'Linha 3';
  relatorioLinhasGroups: { groups: { id: string; title: string; shortTitle: string; color: string; items: { id: string | number; loteNumber: string; productCode: string; productDescription: string; dataProgramada: string; dataProgramadaFmt: string; diaSemana: string; linha: string; ordem: number; quantity: number; quantityKg: number; categoriaEnvase: string; cor: string; statusEnvase: string; observacoes: string; origem: 'programado' | 'liberado'; }[]; totalUn: number; totalKg: number; }[]; liberados: { id: string; title: string; shortTitle: string; color: string; items: { id: string | number; loteNumber: string; productCode: string; productDescription: string; dataProgramada: string; dataProgramadaFmt: string; diaSemana: string; linha: string; ordem: number; quantity: number; quantityKg: number; categoriaEnvase: string; cor: string; statusEnvase: string; observacoes: string; origem: 'programado' | 'liberado'; }[]; totalUn: number; totalKg: number; }; };
  relatorioTotals: { totalCount: number; totalUn: number; totalKg: number; linha1Count: number; linha1Un: number; linha1Kg: number; linha2Count: number; linha2Un: number; linha2Kg: number; linha3Count: number; linha3Un: number; linha3Kg: number; liberadosCount: number; liberadosUn: number; liberadosKg: number; };
}

export default function RelatorioEnvaseImpressao({ currentUser, relatorioAgrupamento, relatorioConsolidadoPorProduto, relatorioDataFim, relatorioDataInicio, relatorioEnvaseItems, relatorioIncluirLiberados, relatorioLinhaFilter, relatorioLinhasGroups, relatorioTotals }: RelatorioEnvaseImpressaoProps) {
  return (
<div id="relatorio-envase-print-area" className="hidden print:block">
        {/* Cabeçalho da Empresa Compacto */}
        <div style={{ borderBottom: '2px solid #18181b', paddingBottom: '4px', marginBottom: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <h1 style={{ fontSize: '13pt', fontWeight: '900', margin: 0, color: '#18181b', letterSpacing: '-0.5px' }}>
                  NATUM COSMÉTICOS
                </h1>
                <span style={{ fontSize: '9.5pt', fontWeight: '800', color: '#4f46e5' }}>
                  PROGRAMAÇÃO DE ENVASE
                </span>
              </div>
              <div style={{ fontSize: '7.5pt', color: '#71717a', marginTop: '1px' }}>
                Relatório Operacional das Linhas de Produção &bull; {relatorioLinhaFilter === 'TODAS' ? 'Todas as Linhas' : relatorioLinhaFilter}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '7.5pt', color: '#52525b', lineHeight: 1.25 }}>
              <div><strong>Período:</strong> {formatDateOnly(relatorioDataInicio)} {relatorioDataInicio !== relatorioDataFim ? `a ${formatDateOnly(relatorioDataFim)}` : ''}</div>
              <div><strong>Emissão:</strong> {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} &bull; <strong>Op:</strong> {(currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador'}</div>
            </div>
          </div>
        </div>

        {/* Resumo de Totais Compacto (Linha Única) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f4f4f5',
            border: '1px solid #e4e4e7',
            borderRadius: '4px',
            padding: '3px 8px',
            marginBottom: '6px',
            fontSize: '8pt',
          }}
        >
          <div>
            <strong>TOTAL GERAL:</strong> {relatorioTotals.totalCount} lotes &bull;{' '}
            <strong style={{ color: '#3730a3' }}>{Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} un</strong> &bull;{' '}
            <span style={{ color: '#047857' }}>{Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} kg</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', fontSize: '7.5pt', fontFamily: 'monospace' }}>
            <span><strong>L1:</strong> {relatorioTotals.linha1Count} lotes ({Number(relatorioTotals.linha1Un).toLocaleString('pt-BR')} un)</span>
            <span><strong>L2:</strong> {relatorioTotals.linha2Count} lotes ({Number(relatorioTotals.linha2Un).toLocaleString('pt-BR')} un)</span>
            <span><strong>L3:</strong> {relatorioTotals.linha3Count} lotes ({Number(relatorioTotals.linha3Un).toLocaleString('pt-BR')} un)</span>
          </div>
        </div>

        {/* Conteúdo: Modo de Exibição */}
        {relatorioAgrupamento === 'produto' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
            <thead>
              <tr style={{ background: '#f4f4f5', borderTop: '1px solid #18181b', borderBottom: '1px solid #18181b' }}>
                <th style={{ padding: '4px 5px', textAlign: 'left', fontWeight: 'bold' }}>Cód. SKU</th>
                <th style={{ padding: '4px 5px', textAlign: 'left', fontWeight: 'bold' }}>Descrição do Produto</th>
                <th style={{ padding: '4px 5px', textAlign: 'left', fontWeight: 'bold' }}>Categoria</th>
                <th style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 'bold' }}>Qtd (UN)</th>
                <th style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 'bold' }}>Peso (KG)</th>
                <th style={{ padding: '4px 5px', textAlign: 'left', fontWeight: 'bold' }}>Lotes</th>
                <th style={{ padding: '4px 5px', textAlign: 'left', fontWeight: 'bold' }}>Linhas</th>
              </tr>
            </thead>
            <tbody>
              {relatorioConsolidadoPorProduto.map((prod, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e4e4e7', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                  <td style={{ padding: '3px 5px', fontFamily: 'monospace', fontWeight: 'bold' }}>{prod.productCode}</td>
                  <td style={{ padding: '3px 5px' }}>{prod.productDescription}</td>
                  <td style={{ padding: '3px 5px', color: '#52525b' }}>{prod.categoriaEnvase}</td>
                  <td style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                    {Number(prod.totalUn).toLocaleString('pt-BR')} un
                  </td>
                  <td style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {Number(prod.totalKg).toLocaleString('pt-BR')} kg
                  </td>
                  <td style={{ padding: '3px 5px', fontFamily: 'monospace', fontSize: '7.5pt', color: '#52525b' }}>
                    {prod.lotes.map(l => `#${l}`).join(', ')}
                  </td>
                  <td style={{ padding: '3px 5px', fontSize: '7.5pt', color: '#52525b' }}>
                    {Array.from(prod.linhas).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f4f4f5', borderTop: '2px solid #18181b', borderBottom: '2px solid #18181b', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ padding: '5px' }}>TOTAL CONSOLIDADO ({relatorioConsolidadoPorProduto.length} produtos):</td>
                <td style={{ padding: '5px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} un
                </td>
                <td style={{ padding: '5px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} kg
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        ) : relatorioAgrupamento === 'tabela' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
            <thead>
              <tr style={{ background: '#f4f4f5', borderTop: '1px solid #18181b', borderBottom: '1px solid #18181b' }}>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Data</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Linha</th>
                <th style={{ padding: '4px 3px', textAlign: 'center', fontWeight: 'bold' }}>Ord</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Lote</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>SKU</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Produto</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Cat / Cor</th>
                <th style={{ padding: '4px 3px', textAlign: 'right', fontWeight: 'bold' }}>Qtd (UN)</th>
                <th style={{ padding: '4px 3px', textAlign: 'right', fontWeight: 'bold' }}>Peso (KG)</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {relatorioEnvaseItems.map((it, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e4e4e7', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                  <td style={{ padding: '3px', whiteSpace: 'nowrap' }}>{it.dataProgramadaFmt} ({it.diaSemana})</td>
                  <td style={{ padding: '3px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{it.linha}</td>
                  <td style={{ padding: '3px', textAlign: 'center', fontFamily: 'monospace' }}>
                    {it.ordem > 0 && it.ordem < 999 ? `${it.ordem}º` : '—'}
                  </td>
                  <td style={{ padding: '3px', fontFamily: 'monospace', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{rotuloLote(it.loteNumber)}</td>
                  <td style={{ padding: '3px', fontFamily: 'monospace', color: '#52525b', whiteSpace: 'nowrap' }}>{it.productCode}</td>
                  <td style={{ padding: '3px' }}>{it.productDescription}</td>
                  <td style={{ padding: '3px', color: '#52525b', fontSize: '7.5pt', whiteSpace: 'nowrap' }}>
                    {it.categoriaEnvase} • {it.cor}
                  </td>
                  <td style={{ padding: '3px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {Number(it.quantity).toLocaleString('pt-BR')} un
                  </td>
                  <td style={{ padding: '3px', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {Number(it.quantityKg).toLocaleString('pt-BR')} kg
                  </td>
                  <td style={{ padding: '3px', fontSize: '7.5pt', whiteSpace: 'nowrap' }}>{it.statusEnvase}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f4f4f5', borderTop: '2px solid #18181b', borderBottom: '2px solid #18181b', fontWeight: 'bold' }}>
                <td colSpan={7} style={{ padding: '4px' }}>TOTAL GERAL ({relatorioTotals.totalCount} lotes):</td>
                <td style={{ padding: '4px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} un
                </td>
                <td style={{ padding: '4px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} kg
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        ) : (
          /* MODO PADRÃO: QUADRO POR LINHA COMPACTO (Como no Quadro de Envase) */
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${relatorioLinhasGroups.groups.length || 1}, minmax(0, 1fr))`,
                gap: '6px',
                alignItems: 'start',
              }}
            >
              {relatorioLinhasGroups.groups.map(group => (
                <div key={group.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Cabeçalho da Coluna / Linha */}
                  <div
                    style={{
                      background: '#18181b',
                      color: '#ffffff',
                      padding: '3px 6px',
                      borderRadius: '4px 4px 0 0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '7.5pt',
                    }}
                  >
                    <span style={{ fontWeight: '800' }}>{group.title}</span>
                    <span style={{ fontSize: '7pt', fontFamily: 'monospace', opacity: 0.9 }}>
                      {group.items.length} {group.items.length === 1 ? 'lote' : 'lotes'} &bull; {Number(group.totalUn).toLocaleString('pt-BR')} un
                    </span>
                  </div>

                  {/* Lista de Lotes da Linha */}
                  <div
                    style={{
                      border: '1px solid #d4d4d8',
                      borderTop: 'none',
                      borderRadius: '0 0 4px 4px',
                      padding: '3px',
                      background: '#fafafa',
                      minHeight: '70px',
                    }}
                  >
                    {group.items.length === 0 ? (
                      <div style={{ padding: '16px 8px', textAlign: 'center', color: '#a1a1aa', fontSize: '7pt', fontStyle: 'italic' }}>
                        Nenhum lote programado
                      </div>
                    ) : (
                      group.items.map((it, idx) => (
                        <div
                          key={it.id || idx}
                          style={{
                            border: '1px solid #e4e4e7',
                            borderRadius: '3px',
                            padding: '2.5px 4px',
                            marginBottom: '3px',
                            background: '#ffffff',
                            pageBreakInside: 'avoid',
                          }}
                        >
                          {/* Linha 1: Ordem + Lote + SKU (+ Data se período de múltiplos dias) */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '7pt' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <span
                                style={{
                                  background: '#18181b',
                                  color: '#ffffff',
                                  fontWeight: '800',
                                  fontSize: '6.5pt',
                                  padding: '0.5px 3px',
                                  borderRadius: '2px',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {it.ordem > 0 && it.ordem < 999 ? `${it.ordem}º` : '—'}
                              </span>
                              <span style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '7.5pt', color: '#09090b' }}>
                                {rotuloLote(it.loteNumber)}
                              </span>
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: '6.5pt', color: '#52525b', display: 'flex', gap: '3px' }}>
                              <span>{it.productCode}</span>
                              {relatorioDataInicio !== relatorioDataFim && (
                                <span style={{ fontWeight: 'bold', color: '#18181b', background: '#f4f4f5', padding: '0 2px', borderRadius: '2px' }}>
                                  {it.dataProgramadaFmt}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Linha 2: Descrição do Produto Resumida */}
                          <div
                            style={{
                              fontWeight: '700',
                              fontSize: '7pt',
                              color: '#18181b',
                              margin: '1px 0',
                              lineHeight: '1.15',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={it.productDescription}
                          >
                            {it.productDescription}
                          </div>

                          {/* Linha 3: Quantidade (un / kg) e Status Resumido */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '6.5pt',
                              borderTop: '1px dotted #e4e4e7',
                              paddingTop: '1px',
                              marginTop: '1px',
                            }}
                          >
                            <div style={{ fontFamily: 'monospace' }}>
                              <strong style={{ color: '#3730a3' }}>{Number(it.quantity).toLocaleString('pt-BR')} un</strong>
                              {it.quantityKg > 0 && (
                                <span style={{ color: '#71717a', marginLeft: '3px' }}>
                                  ({Number(it.quantityKg).toLocaleString('pt-BR')} kg)
                                </span>
                              )}
                            </div>
                            <div>
                              {it.statusEnvase === 'EM_ENVASE' && (
                                <span style={{ color: '#7e22ce', fontWeight: '800' }}>⚡ Em Envase</span>
                              )}
                              {it.statusEnvase === 'EM_ESPERA' && (
                                <span style={{ color: '#b45309', fontWeight: '800' }}>
                                  ⏸️ {it.observacoes ? it.observacoes.slice(0, 15) : 'Espera'}
                                </span>
                              )}
                              {it.statusEnvase === 'CONCLUIDO' && (
                                <span style={{ color: '#15803d', fontWeight: '800' }}>✅ Concluído</span>
                              )}
                              {it.statusEnvase === 'PROGRAMADO' && (
                                <span style={{ color: '#71717a' }}>Programado</span>
                              )}
                              {it.statusEnvase === 'LIBERADO' && (
                                <span style={{ color: '#0369a1', fontWeight: '800' }}>Liberado</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Se houver lotes liberados e o usuário optou por incluir */}
            {relatorioIncluirLiberados && relatorioLinhasGroups.liberados.items.length > 0 && (
              <div style={{ marginTop: '6px', pageBreakInside: 'avoid' }}>
                <div
                  style={{
                    background: '#0e7490',
                    color: '#ffffff',
                    padding: '2.5px 5px',
                    borderRadius: '3px 3px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '7pt',
                  }}
                >
                  <span style={{ fontWeight: '800' }}>{relatorioLinhasGroups.liberados.title}</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {relatorioLinhasGroups.liberados.items.length} lotes &bull; {Number(relatorioLinhasGroups.liberados.totalUn).toLocaleString('pt-BR')} un
                  </span>
                </div>
                <div
                  style={{
                    border: '1px solid #cbd5e1',
                    borderTop: 'none',
                    borderRadius: '0 0 3px 3px',
                    padding: '3px',
                    background: '#f8fafc',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '3px',
                  }}
                >
                  {relatorioLinhasGroups.liberados.items.map((it, idx) => (
                    <div
                      key={it.id || idx}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '2px',
                        padding: '2px 3px',
                        background: '#ffffff',
                        fontSize: '6.5pt',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>{rotuloLote(it.loteNumber)}</span>
                        <span style={{ color: '#64748b' }}>{it.productCode}</span>
                      </div>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '600' }}>
                        {it.productDescription}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0369a1', fontFamily: 'monospace' }}>
                        <strong>{Number(it.quantity).toLocaleString('pt-BR')} un</strong>
                        <span>{Number(it.quantityKg).toLocaleString('pt-BR')} kg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rodapé Compacto com Assinaturas */}
        <div
          style={{
            marginTop: '10px',
            paddingTop: '4px',
            borderTop: '1px solid #d4d4d8',
            display: 'flex',
            justifyContent: 'space-around',
            textAlign: 'center',
            fontSize: '7pt',
            pageBreakInside: 'avoid',
          }}
        >
          <div>
            <div style={{ borderBottom: '1px solid #71717a', width: '150px', margin: '0 auto 2px auto' }}></div>
            <strong>Responsável pelo Envase</strong>
            <div style={{ color: '#71717a', fontSize: '6pt' }}>Assinatura e Data</div>
          </div>
          <div>
            <div style={{ borderBottom: '1px solid #71717a', width: '150px', margin: '0 auto 2px auto' }}></div>
            <strong>Supervisão de Produção / PCP</strong>
            <div style={{ color: '#71717a', fontSize: '6pt' }}>Visto / Conferência</div>
          </div>
        </div>
      </div>
  );
}
