import React from 'react';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem } from '../lib/tipos';
import { inferCategoriaEnvase, inferCorProduto, parseProductUnitWeightKg } from '../lib/lotes';
import { ehBaseProduto } from '../../../producao/lib/unitConversion';
import { apiJson } from '../../../geral/lib/http';
import type { AuthUser } from '../../../geral/lib/auth';

export interface handleEncaixarLoteAcaoCtx {
  currentUser: AuthUser;
  envaseSelectedDate: string;
  fetchProgramacaoEnvase: (dateStr: string) => Promise<void>;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  saveEtapaStatus: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase', status: string, motivoEspera?: string | null, insumoFaltanteCodigo?: string | null, insumoFaltanteDescricao?: string | null, updatedBy?: string, dataAgendada?: string | null) => Promise<void>;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleEncaixarLoteAcao({ currentUser, envaseSelectedDate, fetchProgramacaoEnvase, programacaoEnvase, saveEtapaStatus, setLotes, showToast }: handleEncaixarLoteAcaoCtx, lote: AcompanhamentoLote, linha: 'Linha 1' | 'Linha 2' | 'Linha 3', categoriaEnvase?: string, isColorido?: boolean, cor?: string, targetDateOverride?: string) {
    const catFinal = categoriaEnvase || inferCategoriaEnvase(lote.productDescription);
    const corInfo = inferCorProduto(lote.productDescription);
    const isColFinal = isColorido !== undefined ? isColorido : corInfo.isColorido;
    const corFinal = cor || (isColFinal ? corInfo.cor : 'Branco');
    const dataAlvo = targetDateOverride || envaseSelectedDate;

    const existing = programacaoEnvase.find(it => 
      (it.loteNumber || '').trim().toUpperCase() === (lote.loteNumber || '').trim().toUpperCase() &&
      (!it.productCode || !lote.productCode || (it.productCode || '').trim() === (lote.productCode || '').trim())
    );

    const finalKg = Number(lote.quantityKg) || 0;
    let finalUn = Number(lote.quantity) || 0;
    if (finalUn <= 0 && finalKg > 0) {
      const uWeight = parseProductUnitWeightKg(lote.productDescription, ehBaseProduto({ codigo: lote.productCode, descricao: lote.productDescription }));
      if (uWeight) finalUn = Math.round(finalKg / uWeight); // sem medida na descrição: unidades desconhecidas (0)
    }

    try {
      await apiJson('/api/administrativo/envase/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: existing && existing.id > 0 ? existing.id : undefined,
          dataProgramada: dataAlvo,
          linha,
          loteNumber: lote.loteNumber,
          productCode: lote.productCode,
          productDescription: lote.productDescription,
          quantity: finalUn,
          quantityKg: finalKg,
          categoriaEnvase: catFinal,
          isColorido: isColFinal,
          cor: corFinal,
          statusEnvase: 'PROGRAMADO',
          createdBy: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador',
        })
      });
      const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
      setLotes(prev => prev.map(l => l.loteNumber === lote.loteNumber ? { ...l, dataPrevisao: dataAlvo } : l));
      try {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
          method: 'POST',
          body: JSON.stringify({
            dataPrevisao: dataAlvo,
            updatedBy: responsibleName,
            fornecedorTerceirizado: lote.fornecedorTerceirizado || null
          })
        });
      } catch (err) {
        console.warn('Erro ao sincronizar dataPrevisao no encaixe:', err);
      }
      saveEtapaStatus(lote.loteNumber, 'envase', 'ativo', null, null, null, responsibleName);
      showToast(`Lote #${lote.loteNumber} encaixado na ${linha} (${catFinal} • ${corFinal})!`);
      await fetchProgramacaoEnvase('TODOS');
    } catch (e: any) {
      console.error("Erro ao encaixar lote no quadro:", e);
      showToast("Falha ao encaixar lote: " + (e?.message || e), "error");
    }
  }
