# Resolução — Feedback ac4a1814

**Data:** 2026-07-12
**Causa:** Lote multi-produto obrigava escolher uma gramatura antes de analisar.
**Correção:** Default = “Lote completo” (salva uma análise por produto com as mesmas medições); seletor opcional para gramatura única.
**Arquivos:** `Frontend/src/modules/producao/fisco_quimica/FiscoQuimicaView.tsx`
**Validação:** npm build (lote final)
