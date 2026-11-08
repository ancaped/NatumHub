import React from 'react';
import type { AcompanhamentoLote, ProgramacaoRotulagemItem } from '../lib/tipos';
import { parseLoteDateToIso } from '../lib/datas';
import { parseProductUnitWeightKg } from '../lib/lotes';
import { ehBaseProduto } from '../../../producao/lib/unitConversion';
import { apiJson } from '../../../geral/lib/http';
import type { AuthUser } from '/home/edson/Documentos/api/.claude/worktrees/producao-refator-acompanhamento-04ae88/Frontend/src/modules/geral/lib/auth';

export interface handleEncaixarRotulagemAcaoCtx {
  currentUser: AuthUser;
  fetchProgramacaoRotulagem: (dateStr?: string) => Promise<void>;
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  rotulagemSelectedDate: string;
  saveEtapaStatus: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase', status: string, motivoEspera?: string | null, insumoFaltanteCodigo?: string | null, insumoFaltanteDescricao?: string | null, updatedBy?: string, dataAgendada?: string | null) => Promise<void>;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  setProgramacaoRotulagem: React.Dispatch<React.SetStateAction<ProgramacaoRotulagemItem[]>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleEncaixarRotulagemAcao({ currentUser, fetchProgramacaoRotulagem, programacaoRotulagem, rotulagemSelectedDate, saveEtapaStatus, setLotes, setProgramacaoRotulagem, showToast }: handleEncaixarRotulagemAcaoCtx, lote: AcompanhamentoLote, tipo: 'MAQUINA' | 'MANUAL') {
    const targetDate = rotulagemSelectedDate || new Date().toISOString().split('T')[0];
    const existing = programacaoRotulagem.find(it => 
      it.loteNumber === lote.loteNumber && 
      it.tipo === tipo &&
      (!it.productCode || !lote.productCode || it.productCode === lote.productCode)
    );
    if (existing) {
      showToast(`Lote #${lote.loteNumber} (${lote.productCode || ''}) já está na fila de Rotulagem ${tipo === 'MAQUINA' ? 'Máquina' : 'Manual'}!`, 'error');
      return;
    }
    const currentList = programacaoRotulagem.filter(it => 
      it.tipo === tipo && 
      (it.dataProgramada ? parseLoteDateToIso(it.dataProgramada) === targetDate : true)
    );
    const nextOrdem = currentList.length > 0 ? Math.max(...currentList.map(it => it.ordem || 0)) + 1 : 1;
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || (typeof currentUser === 'string' ? currentUser : 'Operador');
    const numKg = Number(lote.quantityKg) || 0;
    let numQty = Number(lote.quantity) || 0;
    if (numQty <= 0 && numKg > 0) {
      const uWeight = parseProductUnitWeightKg(lote.productDescription, ehBaseProduto({ codigo: lote.productCode, descricao: lote.productDescription }));
      if (uWeight) numQty = Math.round(numKg / uWeight); // sem medida na descrição: unidades desconhecidas (0)
    }
    const payload = {
      dataProgramada: targetDate,
      tipo,
      ordem: nextOrdem,
      loteNumber: String(lote.loteNumber || '').trim(),
      productCode: String(lote.productCode || '').trim(),
      productDescription: String(lote.productDescription || '').trim(),
      quantity: (!isNaN(numQty) && numQty > 0) ? numQty : 0,
      quantityKg: (!isNaN(numKg) && numKg > 0) ? numKg : 0,
      statusRotulagem: 'PROGRAMADO',
      createdBy: responsibleName,
    };
    try {
      const savedItem = await apiJson<ProgramacaoRotulagemItem>('/api/administrativo/rotulagem/programacao', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setProgramacaoRotulagem(prev => [...prev.filter(it => it.id !== savedItem.id), savedItem]);
      setLotes(prev => prev.map(l => l.loteNumber === lote.loteNumber ? { ...l, dataPrevisao: targetDate } : l));
      try {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
          method: 'POST',
          body: JSON.stringify({
            dataPrevisao: targetDate,
            updatedBy: responsibleName,
            fornecedorTerceirizado: lote.fornecedorTerceirizado || null
          })
        });
      } catch (err) {
        console.warn('Erro ao sincronizar dataPrevisao na rotulagem:', err);
      }
      saveEtapaStatus(lote.loteNumber, 'rotulagem', 'ativo', null, null, null, responsibleName);
      showToast(`Lote #${lote.loteNumber} (${lote.productCode || ''}) adicionado à Rotulagem ${tipo === 'MAQUINA' ? 'Máquina' : 'Manual'}!`);
      fetchProgramacaoRotulagem('TODOS');
    } catch (e: any) {
      console.error("Erro ao agendar rotulagem:", e);
      showToast("Erro ao agendar rotulagem: " + (e?.message || e), "error");
    }
  }
