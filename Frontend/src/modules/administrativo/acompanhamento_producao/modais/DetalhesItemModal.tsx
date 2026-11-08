import React from 'react';
import { getEffectiveStatus, getPrevisaoBadge, getEffectivePrevisao, getLoteEtapaStatus, rotuloLote } from '../lib/lotes';
import { Scale, FlaskConical, Tag, Droplets, CheckSquare, History, Building2, Clock, PauseCircle, Flame } from 'lucide-react';
import Drawer from '../../../geral/components/ui/Drawer';
import { formatDateOnly, formatDateTime, formatDurationBetween } from '../lib/datas';
import { cn } from '../../../geral/lib/utils';
import type { CaldeiraRegistro, AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';

export interface DetalhesItemModalProps {
  caldeiraAtiva: { ligouEm: string; operador: string; lotes: string[]; };
  caldeiraHistorico: CaldeiraRegistro[];
  getBadgeClass: (status: string | null | undefined) => 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold' | 'bg-amber-50 text-amber-700 border-amber-200 font-semibold' | 'bg-zinc-100 text-zinc-800 border-zinc-300 font-semibold' | 'bg-zinc-100 text-zinc-700 border-zinc-200';
  handleOpenHistory: (lote: AcompanhamentoLote) => Promise<void>;
  lotesComCaldeira: Set<string>;
  pesagemConcluidosLotes: string[];
  producaoConcluidosLotes: string[];
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  selectedLoteDetails: { lote: AcompanhamentoLote | ProgramacaoEnvaseItem | ProgramacaoRotulagemItem; etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens'; };
  setSelectedLoteDetails: React.Dispatch<React.SetStateAction<{ lote: AcompanhamentoLote | ProgramacaoEnvaseItem | ProgramacaoRotulagemItem; etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens'; }>>;
}

export default function DetalhesItemModal({ caldeiraAtiva, caldeiraHistorico, getBadgeClass, handleOpenHistory, lotesComCaldeira, pesagemConcluidosLotes, producaoConcluidosLotes, programacaoEnvase, programacaoRotulagem, selectedLoteDetails, setSelectedLoteDetails }: DetalhesItemModalProps) {
  return (
(() => {
        const { lote, etapa: _etapa, quadro: _quadro } = selectedLoteDetails as any;
        const etapa = _etapa || _quadro || 'ordens';
        const eff = getEffectiveStatus(lote);
        const prevBadge = getPrevisaoBadge(getEffectivePrevisao(lote.date, lote.dataPrevisao));
        const hasCaldeira = lotesComCaldeira.has(lote.loteNumber) || lote.category === 'Caldeira';
        const caldeiraLigadaNoLote = caldeiraAtiva && caldeiraAtiva.lotes.includes(lote.loteNumber);
        const historicoCaldeiraLote = caldeiraHistorico.filter(h => h.lotes.includes(lote.loteNumber));

        // Dados quantitativos e aproveitamento de massa
        const totalUnidades = Number(lote.quantity) || 0;
        const totalKg = Number(lote.quantityKg) || 0;
        const parcialQty = Number(lote.quantidadeEnvasadaParcial || (lote as any).quantidade_envasada_parcial) || 0;
        const isFinalizada = Boolean(lote.dataFinalizada || eff === 'Ordem Finalizada');
        const qtdRealEnvasada = isFinalizada ? totalUnidades : (parcialQty > 0 ? parcialQty : 0);
        const massaRealKg = totalUnidades > 0 && qtdRealEnvasada > 0 ? Math.round(((qtdRealEnvasada * totalKg) / totalUnidades) * 100) / 100 : (isFinalizada ? totalKg : 0);
        const rendimentoPct = totalUnidades > 0 && qtdRealEnvasada > 0 ? Math.min(100, Math.round((qtdRealEnvasada / totalUnidades) * 1000) / 10) : (isFinalizada ? 100 : 0);
        const saldoUn = Math.max(0, totalUnidades - qtdRealEnvasada);
        const saldoKg = Math.max(0, Math.round((totalKg - massaRealKg) * 100) / 100);

        // Estimativa de Envase
        const envaseItem = programacaoEnvase.find(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim());
        const linhaEnvase = envaseItem?.linha || 'Linha 1';
        const taxaMediaEnvasePorHora = 1200; // 1.200 un/h taxa nominal média operacional
        const tempoEstimadoMinutos = totalUnidades > 0 ? Math.round((totalUnidades / taxaMediaEnvasePorHora) * 60) : 0;
        const horasEstimadas = Math.floor(tempoEstimadoMinutos / 60);
        const minutosEstimados = tempoEstimadoMinutos % 60;
        const tempoFormatadoEnvase = `${horasEstimadas}h ${minutosEstimados.toString().padStart(2, '0')}min`;

        const dataInicioEnvase = lote.dataEnvase || lote.dataLiberadoEnvase;
        let previsaoConclusaoEnvase: string | null = null;
        if (dataInicioEnvase) {
          try {
            const d = new Date(dataInicioEnvase);
            if (!isNaN(d.getTime())) {
              const termino = new Date(d.getTime() + tempoEstimadoMinutos * 60000);
              previsaoConclusaoEnvase = `${termino.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${termino.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            }
          } catch {}
        }

        // Programação de Rotulagem
        const rotulagemItem = programacaoRotulagem.find(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim());
        const tipoRotulagem = rotulagemItem?.tipo === 'MAQUINA' ? 'Máquina Automatizada' : rotulagemItem?.tipo === 'MANUAL' ? 'Rotulagem Manual' : 'Padrão';

        // Verificação de etapas
        const isPesagemConcluida = pesagemConcluidosLotes.includes(lote.loteNumber) || getLoteEtapaStatus(lote, 'pesagem').isConcluido || Boolean(lote.dataProducao || lote.dataLiberadoEnvase || isFinalizada);
        const isProducaoConcluida = producaoConcluidosLotes.includes(lote.loteNumber) || getLoteEtapaStatus(lote, 'producao').isConcluido || lote.customStatus === 'Liberado para Envase' || Boolean(lote.dataEnvase || isFinalizada);
        const isRotulagemConcluida = rotulagemItem?.statusRotulagem === 'CONCLUIDO' || isFinalizada;
        const isEnvaseConcluido = envaseItem?.statusEnvase === 'CONCLUIDO' || isFinalizada;

        const getEtapaInfo = () => {
          switch (etapa) {
            case 'pesagem':
              return {
                title: 'Detalhes do Lote — Pesagem',
                icon: <Scale className="h-5 w-5 text-zinc-600" />,
              };
            case 'producao':
              return {
                title: 'Detalhes do Lote — Fabricação',
                icon: <FlaskConical className="h-5 w-5 text-amber-600" />,
              };
            case 'rotulagem':
              return {
                title: 'Detalhes do Lote — Rotulagem',
                icon: <Tag className="h-5 w-5 text-zinc-600" />,
              };
            case 'envase':
              return {
                title: 'Detalhes do Lote — Envase',
                icon: <Droplets className="h-5 w-5 text-zinc-600" />,
              };
            case 'ordens':
            default:
              return {
                title: 'Detalhes da Ordem de Produção',
                icon: <CheckSquare className="h-5 w-5 text-emerald-600" />,
              };
          }
        };

        const info = getEtapaInfo();

        return (
<Drawer size="2xl" onClose={() => setSelectedLoteDetails(null)}
  title={<span className="flex items-center gap-2">{info.icon}<span className="truncate">{info.title}</span></span>}
  badge={<span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-900 text-white">{rotuloLote(lote.loteNumber)}</span>}
  subtitle={<span className="block whitespace-normal font-sans">{lote.productCode} — {lote.productDescription}</span>}
  footer={
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const l = lote;
                    setSelectedLoteDetails(null);
                    handleOpenHistory(l);
                  }}
                  className="px-4 py-2 text-xs font-bold text-zinc-700 hover:text-zinc-950 bg-zinc-200/70 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Ver todo o histórico cronológico deste lote"
                >
                  <History className="h-4 w-4" />
                  <span>Histórico do Lote</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedLoteDetails(null)}
                  className="px-6 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
}>

              {/* Scrollable Body */}
              <div className="space-y-5 min-w-0">
                {/* 1. Métricas Chave do Lote */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 text-xs">
                  <div>
                    <span className="text-[11px] md:text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Qtd Planejada</span>
                    <span className="font-mono font-bold text-sm text-zinc-900">{totalUnidades.toLocaleString('pt-BR')} un</span>
                  </div>
                  <div>
                    <span className="text-[11px] md:text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Massa Total</span>
                    <span className="font-mono font-bold text-sm text-zinc-900">{totalKg.toLocaleString('pt-BR')} kg</span>
                  </div>
                  <div>
                    <span className="text-[11px] md:text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Data de Abertura</span>
                    <span className="font-mono text-sm font-semibold text-zinc-800">{formatDateOnly(lote.date)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] md:text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Status Geral</span>
                    <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-bold border inline-block mt-0.5", getBadgeClass(eff))}>
                      {eff}
                    </span>
                  </div>
                </div>

                {/* Previsão e Fornecedor Terceirizado */}
                {(prevBadge || lote.isTerceirizado) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {prevBadge && (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-50 border border-zinc-200 rounded-lg">
                        <span className="text-zinc-500 font-medium">Previsão:</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-bold border", prevBadge.colorClass)}>
                          {prevBadge.label}
                        </span>
                      </div>
                    )}
                    {lote.isTerceirizado && (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="font-bold">Terceirizado:</span>
                        <span>{lote.fornecedorTerceirizado || (lote as any).fornecedor_terceirizado || 'Fornecedor Externo'}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. JORNADA COMPLETA DAS 4 ETAPAS DE PRODUÇÃO */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-zinc-700" />
                      Jornada do Lote — 4 Etapas de Produção
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      Rastreabilidade contínua
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* ETAPA 1: PESAGEM */}
                    <div className={cn(
                      "p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2 transition-all",
                      isPesagemConcluida
                        ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200"
                        : lote.dataPesagem
                          ? "bg-zinc-50/40 border-zinc-300 ring-1 ring-zinc-200"
                          : "bg-zinc-50 border-zinc-200 opacity-80"
                    )}>
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/60">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                          <Scale className="h-4 w-4 text-zinc-600" />
                          <span>1. Pesagem</span>
                        </div>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[11px] md:text-[10px] font-bold font-mono",
                          isPesagemConcluida
                            ? "bg-emerald-100 text-emerald-800"
                            : lote.dataPesagem
                              ? "bg-zinc-100 text-zinc-800"
                              : "bg-zinc-200 text-zinc-600"
                        )}>
                          {isPesagemConcluida ? '✓ Concluído' : lote.dataPesagem ? 'Na Balança' : 'Pendente'}
                        </span>
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="text-zinc-500">
                          Início: <strong className="text-zinc-800 font-sans">{lote.dataPesagem ? formatDateTime(lote.dataPesagem) : 'Aguardando'}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Duração: <strong className="text-zinc-700">{lote.dataPesagem ? formatDurationBetween(lote.dataPesagem, lote.dataProducao) : '—'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* ETAPA 2: PRODUÇÃO / FABRICAÇÃO */}
                    <div className={cn(
                      "p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2 transition-all",
                      isProducaoConcluida
                        ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200"
                        : lote.dataProducao
                          ? "bg-amber-50/40 border-amber-300 ring-1 ring-amber-200"
                          : "bg-zinc-50 border-zinc-200 opacity-80"
                    )}>
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/60">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                          <FlaskConical className="h-4 w-4 text-amber-600" />
                          <span>2. Fabricação</span>
                        </div>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[11px] md:text-[10px] font-bold font-mono",
                          isProducaoConcluida
                            ? "bg-emerald-100 text-emerald-800"
                            : lote.dataProducao
                              ? "bg-amber-100 text-amber-800"
                              : "bg-zinc-200 text-zinc-600"
                        )}>
                          {isProducaoConcluida ? '✓ Liberado' : lote.dataProducao ? 'Em Reator' : 'Pendente'}
                        </span>
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="text-zinc-500 truncate" title={hasCaldeira ? 'Caldeira a Vapor + Reator' : (lote.category || 'Reator')}>
                          Eq: <strong className="text-zinc-800 font-sans">{hasCaldeira ? 'Caldeira + Reator' : (lote.category || 'Reator')}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Início: <strong className="text-zinc-800 font-sans">{lote.dataProducao ? formatDateTime(lote.dataProducao) : 'Aguardando'}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Duração: <strong className="text-amber-700">{lote.dataProducao ? formatDurationBetween(lote.dataProducao, lote.dataLiberadoEnvase || lote.dataEnvase) : '—'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* ETAPA 3: ROTULAGEM */}
                    <div className={cn(
                      "p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2 transition-all",
                      isRotulagemConcluida
                        ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200"
                        : lote.dataRotulagem
                          ? "bg-zinc-50/40 border-zinc-300 ring-1 ring-zinc-200"
                          : "bg-zinc-50 border-zinc-200 opacity-80"
                    )}>
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/60">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                          <Tag className="h-4 w-4 text-zinc-600" />
                          <span>3. Rotulagem</span>
                        </div>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[11px] md:text-[10px] font-bold font-mono",
                          isRotulagemConcluida
                            ? "bg-emerald-100 text-emerald-800"
                            : lote.dataRotulagem
                              ? "bg-zinc-100 text-zinc-800"
                              : "bg-zinc-200 text-zinc-600"
                        )}>
                          {isRotulagemConcluida ? '✓ Concluído' : lote.dataRotulagem ? 'Rotulando' : 'Programado'}
                        </span>
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="text-zinc-500 truncate" title={tipoRotulagem}>
                          Modo: <strong className="text-zinc-800 font-sans">{tipoRotulagem}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Início: <strong className="text-zinc-800 font-sans">{lote.dataRotulagem ? formatDateTime(lote.dataRotulagem) : 'Aguardando'}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Duração: <strong className="text-zinc-700">{lote.dataRotulagem ? formatDurationBetween(lote.dataRotulagem, lote.dataFinalizada) : '—'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* ETAPA 4: ENVASE */}
                    <div className={cn(
                      "p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2 transition-all",
                      isEnvaseConcluido
                        ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200"
                        : lote.dataEnvase
                          ? "bg-zinc-50/40 border-zinc-300 ring-1 ring-zinc-200"
                          : "bg-zinc-50 border-zinc-200 opacity-80"
                    )}>
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/60">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                          <Droplets className="h-4 w-4 text-zinc-600" />
                          <span>4. Envase</span>
                        </div>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[11px] md:text-[10px] font-bold font-mono",
                          isEnvaseConcluido
                            ? "bg-emerald-100 text-emerald-800"
                            : lote.dataEnvase
                              ? "bg-zinc-100 text-zinc-800"
                              : "bg-zinc-200 text-zinc-600"
                        )}>
                          {isEnvaseConcluido ? '✓ Envasado' : lote.dataEnvase ? 'Em Linha' : 'Aguardando'}
                        </span>
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="text-zinc-500">
                          Linha: <strong className="text-zinc-800 font-sans">{linhaEnvase}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Entrada: <strong className="text-zinc-800 font-sans">{dataInicioEnvase ? formatDateTime(dataInicioEnvase) : 'Aguardando'}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Duração: <strong className="text-zinc-700">{lote.dataEnvase ? formatDurationBetween(lote.dataEnvase, lote.dataFinalizada) : '—'}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. ESTIMATIVA DE ENVASE */}
                <div className="bg-zinc-50/40 border border-zinc-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                    <span className="text-xs font-bold text-zinc-950 flex items-center gap-1.5">
                      <Droplets className="h-4 w-4 text-zinc-600" />
                      Estimativa de Envase & Ritmo da Linha
                    </span>
                    <span className="text-[11px] md:text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-900">
                      {linhaEnvase} • {taxaMediaEnvasePorHora.toLocaleString('pt-BR')} un/h nominal
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-zinc-100 shadow-2xs font-mono">
                      <span className="text-[11px] md:text-[10px] uppercase font-bold text-zinc-400 block font-sans">Tempo Previsto de Envase</span>
                      <span className="text-sm font-bold text-zinc-900">{tempoFormatadoEnvase}</span>
                      <span className="text-[11px] md:text-[10px] text-zinc-400 block font-sans mt-0.5">para {totalUnidades.toLocaleString('pt-BR')} unidades</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-zinc-100 shadow-2xs font-mono">
                      <span className="text-[11px] md:text-[10px] uppercase font-bold text-zinc-400 block font-sans">Previsão Estimada de Término</span>
                      <span className="text-sm font-bold text-zinc-900">
                        {previsaoConclusaoEnvase || (dataInicioEnvase ? 'Em cálculo' : 'Disponível após liberação')}
                      </span>
                      <span className="text-[11px] md:text-[10px] text-zinc-400 block font-sans mt-0.5">
                        {dataInicioEnvase ? `Início: ${formatDateTime(dataInicioEnvase)}` : 'Aguardando entrada em linha'}
                      </span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-zinc-100 shadow-2xs font-mono">
                      <span className="text-[11px] md:text-[10px] uppercase font-bold text-zinc-400 block font-sans">Status Operacional do Envase</span>
                      <span className={cn(
                        "text-xs font-bold font-sans inline-block mt-0.5 px-2 py-0.5 rounded",
                        isEnvaseConcluido
                          ? "bg-emerald-100 text-emerald-800"
                          : envaseItem?.statusEnvase === 'EM_ESPERA'
                            ? "bg-amber-100 text-amber-900"
                            : envaseItem?.statusEnvase === 'EM_ENVASE'
                              ? "bg-zinc-100 text-zinc-900"
                              : "bg-zinc-100 text-zinc-700"
                      )}>
                        {isEnvaseConcluido ? '✓ Envase Concluído' : envaseItem?.statusEnvase === 'EM_ESPERA' ? '⏸️ Linha em Espera' : envaseItem?.statusEnvase === 'EM_ENVASE' ? '⚡ Envasando em Linha' : 'Programado na Fila'}
                      </span>
                      {envaseItem?.motivoEspera && (
                        <span className="text-[11px] md:text-[10px] text-amber-700 block font-sans truncate mt-0.5" title={envaseItem.motivoEspera}>
                          {envaseItem.motivoEspera}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. HISTÓRICO DE APROVEITAMENTO DE MASSA & FECHAMENTO DE OP */}
                <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                    <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                      Histórico de Aproveitamento de Massa & Fechamento da OP
                    </span>
                    <span className={cn(
                      "text-[11px] md:text-[10px] font-mono px-2 py-0.5 rounded-md font-bold",
                      isFinalizada
                        ? "bg-emerald-100 text-emerald-900"
                        : parcialQty > 0
                          ? "bg-zinc-100 text-zinc-900"
                          : "bg-zinc-100 text-zinc-700"
                    )}>
                      {isFinalizada ? 'Ordem Finalizada' : parcialQty > 0 ? 'Envase Parcial' : 'Em Andamento'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono">
                    <div className="bg-white p-2.5 rounded-lg border border-zinc-200 shadow-2xs">
                      <span className="text-[11px] md:text-[10px] uppercase font-bold text-zinc-400 block font-sans">Massa Planejada</span>
                      <span className="font-bold text-sm text-zinc-800">{totalKg.toLocaleString('pt-BR')} kg</span>
                      <span className="text-[11px] md:text-[10px] text-zinc-500 block font-sans">{totalUnidades.toLocaleString('pt-BR')} un</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-zinc-200 shadow-2xs">
                      <span className="text-[11px] md:text-[10px] uppercase font-bold text-zinc-600 block font-sans">Real Envasado</span>
                      <span className="font-bold text-sm text-zinc-700">{massaRealKg.toLocaleString('pt-BR')} kg</span>
                      <span className="text-[11px] md:text-[10px] text-zinc-600 block font-sans">{qtdRealEnvasada.toLocaleString('pt-BR')} un</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200 shadow-2xs">
                      <span className="text-[11px] md:text-[10px] uppercase font-bold text-emerald-600 block font-sans">Aproveitamento</span>
                      <span className={cn(
                        "font-extrabold text-sm",
                        rendimentoPct >= 98 ? "text-emerald-700" : rendimentoPct >= 90 ? "text-amber-700" : "text-zinc-700"
                      )}>
                        {rendimentoPct > 0 ? `${rendimentoPct}%` : '—'}
                      </span>
                      <span className="text-[11px] md:text-[10px] text-zinc-400 block font-sans">meta: 98% a 100%</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-zinc-200 shadow-2xs">
                      <span className="text-[11px] md:text-[10px] uppercase font-bold text-zinc-400 block font-sans">Saldo / Perda</span>
                      <span className="font-bold text-sm text-amber-700">{saldoKg.toLocaleString('pt-BR')} kg</span>
                      <span className="text-[11px] md:text-[10px] text-amber-600 block font-sans">{saldoUn.toLocaleString('pt-BR')} un</span>
                    </div>
                  </div>

                  {/* Barra de Aproveitamento de Massa */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                      <span>Rendimento da Massa Produzida:</span>
                      <span className="font-bold text-emerald-800">
                        {rendimentoPct > 0 ? `${rendimentoPct}% aproveitamento` : 'Aguardando fechamento/apontamento'}
                      </span>
                    </div>
                    <div className="w-full bg-zinc-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          rendimentoPct >= 98
                            ? "bg-emerald-600"
                            : rendimentoPct >= 90
                              ? "bg-amber-500"
                              : rendimentoPct > 0
                                ? "bg-red-500"
                                : "bg-zinc-300"
                        )}
                        style={{ width: `${Math.max(4, rendimentoPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                    <div>
                      <span className="text-zinc-500 block">Fechamento no Sistema:</span>
                      <span className="font-bold text-zinc-800 font-sans">
                        {isFinalizada
                          ? '✓ Ordem Finalizada no Chão de Fábrica'
                          : parcialQty > 0
                            ? '🌓 Apontamento Parcial Registrado'
                            : 'Em Aberto / Execução no Chão de Fábrica'}
                      </span>
                      {lote.dataFinalizada && (
                        <span className="text-[11px] md:text-[10px] font-mono text-zinc-500 block">
                          Finalizada em: {formatDateTime(lote.dataFinalizada)}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Integração / Lançamento ERP:</span>
                      <span className={cn(
                        "font-bold font-sans",
                        lote.erpStatus === 'EA'
                          ? "text-emerald-700"
                          : isFinalizada
                            ? "text-amber-700"
                            : "text-zinc-600"
                      )}>
                        {lote.erpStatus === 'EA'
                          ? '✓ Baixada e Conciliada no ERP'
                          : isFinalizada
                            ? 'Aguardando Lançamento no ERP'
                            : 'Ordem ativa na fábrica'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. CONTEXTO APROFUNDADO DA ETAPA */}
                {etapa === 'pesagem' && (
                  <div className="space-y-3 bg-zinc-50/30 border border-zinc-100 rounded-xl p-3.5">
                    <span className="text-xs font-bold text-zinc-950 flex items-center gap-1.5">
                      <Scale className="h-4 w-4 text-zinc-600" />
                      Insumos & Matérias-Primas do Lote
                    </span>

                    {/* Alerta de Espera */}
                    {(lote.motivoEspera || lote.dataEmEspera || eff === 'Em Espera' || lote.customStatus === 'Em Espera') && (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <PauseCircle className="h-4 w-4 text-amber-600" />
                          <span>Lote Colocado em Espera</span>
                          {lote.dataEmEspera && (
                            <span className="text-[11px] md:text-[10px] font-mono text-amber-700 ml-auto">
                              desde {formatDateTime(lote.dataEmEspera)}
                            </span>
                          )}
                        </div>
                        <p className="text-amber-800 font-medium">
                          Motivo: <strong>{lote.motivoEspera || 'Aguardando liberação operacional'}</strong>
                        </p>
                        {(lote.insumoFaltanteCodigo || (lote as any).insumo_faltante_codigo) && (
                          <div className="text-[11px] text-amber-900 bg-amber-100/60 p-2 rounded-lg mt-1 font-mono">
                            Insumo Faltante: <strong>{lote.insumoFaltanteCodigo || (lote as any).insumo_faltante_codigo}</strong> - {lote.insumoFaltanteDescricao || (lote as any).insumo_faltante_descricao || ''}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ficha / Matérias Primas */}
                    {((lote.fichaOrdem || (lote as any).ficha_ordem)?.materias_primas?.length > 0) ? (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-zinc-700 block">
                          Ficha de Formulação ({((lote.fichaOrdem || (lote as any).ficha_ordem)?.materias_primas?.length)} itens):
                        </span>
                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                          {((lote.fichaOrdem || (lote as any).ficha_ordem).materias_primas as any[]).map((mp, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-zinc-200">
                              <span className="font-mono text-zinc-800 truncate max-w-[380px]">
                                {mp.codigo || mp.code} - {mp.descricao || mp.description}
                              </span>
                              <span className="font-mono font-bold text-zinc-900 shrink-0">
                                {Number(mp.quantidade || mp.quantity || 0).toLocaleString('pt-BR')} {mp.unidade || 'kg'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500 italic">Nenhuma matéria-prima discriminada nesta ordem no ERP.</p>
                    )}
                  </div>
                )}

                {etapa === 'producao' && (
                  <div className="space-y-3 bg-amber-50/30 border border-amber-100 rounded-xl p-3.5">
                    <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <Flame className="h-4 w-4 text-amber-600" />
                      Processamento Térmico (Caldeira / Vapor)
                    </span>

                    <div className={cn(
                      "p-3 rounded-xl border text-xs space-y-1.5 transition-all",
                      caldeiraLigadaNoLote
                        ? "bg-red-50 border-red-300 text-red-950"
                        : hasCaldeira
                          ? "bg-amber-50 border-amber-200 text-amber-950"
                          : "bg-zinc-50 border-zinc-200 text-zinc-700"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Flame className={cn("h-4 w-4", caldeiraLigadaNoLote ? "fill-red-500 text-red-500 animate-pulse" : hasCaldeira ? "fill-amber-500 text-amber-500" : "text-zinc-400")} />
                          <span>Status do Vapor</span>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[11px] md:text-[10px] font-mono font-bold uppercase",
                          caldeiraLigadaNoLote
                            ? "bg-red-600 text-white animate-pulse"
                            : hasCaldeira
                              ? "bg-amber-200 text-amber-900"
                              : "bg-zinc-200 text-zinc-700"
                        )}>
                          {caldeiraLigadaNoLote ? 'Aquecendo Agora' : hasCaldeira ? 'Requer Caldeira' : 'Processo a Frio'}
                        </span>
                      </div>

                      {caldeiraLigadaNoLote && caldeiraAtiva && (
                        <p className="text-[11px] text-red-800 font-medium">
                          🔥 Caldeira ligada desde <strong>{formatDateTime(caldeiraAtiva.ligouEm)}</strong> ({formatDurationBetween(caldeiraAtiva.ligouEm)}) pelo operador <strong>{caldeiraAtiva.operador}</strong>.
                        </p>
                      )}

                      {historicoCaldeiraLote.length > 0 && (
                        <div className="text-[11px] pt-1 border-t border-zinc-200/60 space-y-0.5">
                          <span className="font-semibold block">Histórico de aquecimentos:</span>
                          {historicoCaldeiraLote.map(h => (
                            <div key={h.id} className="text-zinc-600 font-mono">
                              • {formatDateTime(h.ligouEm)} até {formatDateTime(h.desligouEm)} ({h.duracaoMinutos} min) — {h.operador}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Observações Operacionais */}
                {lote.notes && (
                  <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs">
                    <span className="text-[11px] md:text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                      Observações Registradas
                    </span>
                    <p className="text-zinc-700 italic">"{lote.notes}"</p>
                  </div>
                )}

                <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-1">
                  <span>Última alteração por: <strong className="text-zinc-700 font-semibold">{lote.updatedBy || 'Sistema'}</strong></span>
                  {lote.updatedAt && <span className="font-mono">{formatDateTime(lote.updatedAt)}</span>}
                </div>
              </div>

              {/* Footer Actions */}
</Drawer>
        );
      })()
  );
}
