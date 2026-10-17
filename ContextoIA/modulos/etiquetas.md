# Impressão de etiquetas

Padrão único do Nexus. Estoque, produção, expedição e qualquer outro módulo que imprima etiqueta térmica usa **esta** tela. Não criar outro diálogo, iframe ou `window.print`.

## Tela padrão

`Frontend/src/modules/ferramentas/etiquetas/components/PrintModal.tsx`

Antes de enviar, o operador vê:

- a etiqueta no tamanho do adesivo, página a página
- páginas: cópias iguais ou sequência (início e fim)
- a impressora cadastrada no Windows
- orientação: **Deitada** (sem girar) ou **Em pé** (gira 90°)
- preenchimento do adesivo

**Imprimir** manda direto ao spooler. **Pelo navegador** fica só como reserva.

## Como um módulo abre

1. Montar um `LabelTemplate` já preenchido (`width_mm`, `height_mm`, `elements_json`).
2. Abrir o `PrintModal` com esse template. O módulo não chama a impressora sozinho.

```tsx
import PrintModal from '../../ferramentas/etiquetas/components/PrintModal';

<PrintModal
  template={etiquetaPronta}
  isOpen={aberta}
  onClose={() => setAberta(false)}
  initialCopies={1}
  initialEnableSequence={false}
  history={{
    product_code: codigo,
    product_name: nome,
    lot_number: lote,
  }}
/>
```

`history` é opcional e grava o histórico do módulo de Etiquetas.

## Envio

O modal usa `printLabelDirect` (`Frontend/src/modules/ferramentas/etiquetas/lib/directPrint.ts`), que faz `POST /api/ferramentas/impressoras/direct`.

- O `nexus-server` precisa estar no Windows, na mesma máquina da impressora.
- A impressora em **Impressoras** precisa do nome do Windows (`system_printer_name`).
- Não desenhar outra página de impressão no módulo. A arte é o `LabelTemplate`; o papel, a orientação e o preenchimento ficam nesta tela.
