# Resolução — Feedback 921baaad

**Data:** 2026-07-12 03:30
**Causa:** Configurações de Compras ainda expunham Lista Negra (sync XLSX) e meta global (`targetDays`) como verdade principal, desatualizado frente a disparos/metas por hierarquia em Demandas.
**Correção:** Removida a aba Lista Negra e o sync. Substituída a meta global editável por texto explicando a hierarquia geral &lt; subcategoria &lt; item via `compras_config_personalizado` (já usada em Demandas). Atualizados textos de Regras Automáticas e Categorias & Insumos; painel continua por modo (mp/emb/coloracao/apoio). Mantidos atalhos, regras, categorias e configs personalizadas. Período de média mensal permanece editável.
**Arquivos:** `Frontend/src/modules/compras/planejamento/components/SettingsPanel.tsx`
**Validação:** npm run build ✓ · cargo check — falha pré-existente em `tauri_commands.rs` (pg_i64 → i32), fora do escopo deste feedback.
