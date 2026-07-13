# Resolução — Feedback 3758fa2a

**Data:** 2026-07-12
**Causa:** Produtos base (`cat_base`) eram avaliados nas regras de envase/conferência como acabados.
**Correção:** Skip de `envase_error` / `conferencia_error` e itens de detalhe quando o produto é base (override `cat_base` ou legado `bases`).
**Arquivos:** `Backend/src/handlers/producao.rs`
**Validação:** cargo check (lote final)
**Nota:** Cadastro correto em Linha de Produtos (`categoria = cat_base`) continua necessário para o skip aplicar.
