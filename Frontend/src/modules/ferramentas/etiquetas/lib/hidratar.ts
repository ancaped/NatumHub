import type { CatalogProduct } from './labelsApi';
import type { LabelElement, LabelTemplate } from './types';

export interface DadosDoSistema {
  produto: CatalogProduct | null;
  lote: string;
  fabricacao: string;
  validade: string;
  unidadesPorCaixa: number;
}

/** Troca os campos do sistema do modelo (produto, lote, datas, caixa) pelos dados escolhidos. */
export function hidratarModelo(template: LabelTemplate, d: DadosDoSistema): LabelTemplate {
  const pCode = d.produto?.codigo || '1.00.001';
  const pName = d.produto?.descricao || 'PRODUTO NÁTUM COSMÉTICOS';
  const pEan = d.produto?.codigo_barras || '7898912345678';
  const pDun = d.produto?.codigo_barras_caixa || (pEan.length === 13 ? `1${pEan.slice(0, 12)}` : pEan);
  const pLine = d.produto?.linha || 'Linha Profissional';

  const elements_json: LabelElement[] = template.elements_json.map((el) => {
    const cloned = JSON.parse(JSON.stringify(el)) as LabelElement;

    if (cloned.type === 'text' || cloned.type === 'badge') {
      let text = (cloned.props.text || '') as string;
      text = text
        .replace(/{product_code}/g, pCode)
        .replace(/{product_name}/g, pName)
        .replace(/{barcode}/g, pEan)
        .replace(/{box_barcode}/g, pDun)
        .replace(/{box_qty}/g, `${d.unidadesPorCaixa} un.`)
        .replace(/{lot}/g, d.lote)
        .replace(/{manufacturing_date}/g, d.fabricacao)
        .replace(/{expiry_date}/g, d.validade)
        .replace(/{line}/g, pLine);

      if (text.includes('1.30.139') || text.includes('03.13.011') || text.includes('01.01.001')) {
        text = text.replace(/1\.30\.139|03\.13\.011|01\.01\.001/g, pCode);
      }
      if (text.includes('NÁTUM') && (text.includes('300ML') || text.includes('250 ML') || text.includes('SHAMPOO'))) {
        text = pName;
      }
      cloned.props.text = text;
    }

    if (cloned.type === 'barcode') {
      let val = (cloned.props.value || '') as string;
      if (val.includes('{barcode}') || val.includes('78989') || val.includes('79087')) {
        val = pEan;
      } else if (val.includes('{box_barcode}') || val.includes('178989') || val.includes('DUN')) {
        val = pDun;
      } else if (val.includes('{product_code}')) {
        val = pCode;
      } else if (val.includes('{lot}')) {
        val = d.lote;
      } else if (pEan) {
        val = template.category === 'expedicao' || template.name.toLowerCase().includes('caixa') ? pDun : pEan;
      }
      cloned.props.value = val;
    }

    if (cloned.type === 'qrcode') {
      let val = (cloned.props.value || '') as string;
      val = val.replace(/{product_code}/g, pCode).replace(/{lot}/g, d.lote).replace(/{barcode}/g, pEan);
      cloned.props.value = val;
    }

    return cloned;
  });

  return { ...template, elements_json };
}

/** Lote do dia (`L261106-01`) e datas de hoje e de daqui a 2 anos, como o modal de impressão sempre sugeriu. */
export function dadosIniciais(): DadosDoSistema {
  const hoje = new Date();
  const val = new Date();
  val.setFullYear(val.getFullYear() + 2);
  const yy = String(hoje.getFullYear()).slice(2);
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const dd = String(hoje.getDate()).padStart(2, '0');
  return {
    produto: null,
    lote: `L${yy}${mm}${dd}-01`,
    fabricacao: hoje.toLocaleDateString('pt-BR'),
    validade: val.toLocaleDateString('pt-BR'),
    unidadesPorCaixa: 12,
  };
}
