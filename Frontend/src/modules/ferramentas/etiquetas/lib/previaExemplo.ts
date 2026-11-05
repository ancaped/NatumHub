import { DEFAULT_SYSTEM_VARIABLES } from './systemVariables';
import type { LabelTemplate } from './types';

/** Exemplos dos campos dos modelos feitos para módulos (Qualidade, Produção). */
const EXEMPLOS_MODULOS: Record<string, string> = {
  '{sheet_number}': 'DEV-000123',
  '{volumes}': '2 VOLUMES',
  '{boxes}': '2 CAIXAS',
  '{destination}': 'EXPEDIÇÃO',
  '{product_name}': 'MÁSCARA THERMO RESTORE 250G',
  '{volume_line}': '100,00 L (Aproximadamente 333 unidades ou 28 caixas)',
  '{date}': '03/11/2026',
  '{status}': 'APROVADO',
  '{proc}': 'PROC: 12',
  '{envase}': 'ENVASE 300 ML',
  '{codigo_receb}': 'MP0412',
  '{codigo_ref}': '3.01.004',
  '{insumo_nome}': 'ÓLEO DE ARGAN PURO',
  '{fornecedor}': 'QUÍMICA BRASIL',
  '{lote}': '2026-0815',
  '{data_entrada}': '03/11/2026',
  '{data_validade}': '03/11/2028',
  '{peso}': '25',
  '{unidade}': 'KG',
  '{nota_fiscal}': '48213',
  '{bombona_idx}': '1',
  '{bombona_total}': '4',
};

/** Troca os campos do sistema (`{lot}`, `{product_name}`...) por valores de exemplo, só para mostrar a prévia. */
export function comExemplo(modelo: LabelTemplate): LabelTemplate {
  const trocar = (t: string) => {
    let r = t;
    for (const v of DEFAULT_SYSTEM_VARIABLES) r = r.split(v.token).join(v.sample);
    for (const [token, exemplo] of Object.entries(EXEMPLOS_MODULOS)) r = r.split(token).join(exemplo);
    return r;
  };
  return {
    ...modelo,
    elements_json: (modelo.elements_json ?? []).map((el) => {
      const props = { ...el.props };
      if (typeof props.text === 'string') props.text = trocar(props.text);
      if (typeof props.value === 'string') props.value = trocar(props.value);
      return { ...el, props };
    }),
  };
}
