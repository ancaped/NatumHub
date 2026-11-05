import { DEFAULT_SYSTEM_VARIABLES } from './systemVariables';
import type { LabelTemplate } from './types';

/** Troca os campos do sistema (`{lot}`, `{product_name}`...) por valores de exemplo, só para mostrar a prévia. */
export function comExemplo(modelo: LabelTemplate): LabelTemplate {
  const trocar = (t: string) => {
    let r = t;
    for (const v of DEFAULT_SYSTEM_VARIABLES) r = r.split(v.token).join(v.sample);
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
