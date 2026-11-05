import { generateBarcodeBars } from './barcodeGenerator';
import { renderLabelPngDataUrl } from './printCanvasRenderer';
import { replaceDynamicTokens } from './printService';
import type { LabelElement, LabelTemplate } from './types';

/**
 * Modelos que imprimem com texto e código de barras **nativos** da Zebra (fontes da própria impressora).
 * A migração é por modelo, uma etiqueta de cada vez; os demais seguem como imagem.
 */
export const CHAVES_NATIVAS = ['lote_erp'];

export interface TextoNativo {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  texto: string;
  pt: number;
  negrito: boolean;
  alinhamento: string;
  multilinha: boolean;
}

export interface BarraNativa {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  valor: string;
  formato: string;
  modulos: number;
}

export interface PaginaNativa {
  textos: TextoNativo[];
  barras: BarraNativa[];
  imagem_png_base64?: string;
}

export function modeloNativo(template: LabelTemplate): boolean {
  return Boolean(template.chave && CHAVES_NATIVAS.includes(template.chave));
}

const NEGRITOS = new Set(['600', '700', '800', 'bold']);
const TIPOS_NATIVOS = new Set(['text', 'barcode']);

function paginaNativa(elementos: LabelElement[], i: number, total: number, inicio: number, padding: number): PaginaNativa {
  const textos: TextoNativo[] = [];
  const barras: BarraNativa[] = [];
  for (const el of elementos) {
    const p = el.props || {};
    if (el.type === 'text') {
      const bruto = replaceDynamicTokens(p.text || '', i, total, inicio, padding);
      textos.push({
        x_mm: el.x_mm,
        y_mm: el.y_mm,
        width_mm: el.width_mm,
        height_mm: el.height_mm,
        texto: p.uppercase ? bruto.toUpperCase() : bruto,
        pt: p.fontSize || 10,
        negrito: NEGRITOS.has(String(p.fontWeight || 'normal')),
        alinhamento: p.textAlign || 'left',
        multilinha: Boolean(p.multiline),
      });
    } else if (el.type === 'barcode') {
      const valor = replaceDynamicTokens(p.value || '123456', i, total, inicio, padding);
      const formato = p.format || 'code128';
      const res = generateBarcodeBars(valor, formato);
      const comTexto = p.showText !== false;
      barras.push({
        x_mm: el.x_mm,
        y_mm: el.y_mm,
        width_mm: el.width_mm,
        height_mm: comTexto ? el.height_mm * 0.76 : el.height_mm,
        valor: formato === 'ean13' ? res.displayText : valor,
        formato,
        modulos: res.totalModules,
      });
      if (comTexto) {
        textos.push({
          x_mm: el.x_mm,
          y_mm: el.y_mm + el.height_mm * 0.78,
          width_mm: el.width_mm,
          height_mm: el.height_mm * 0.22,
          texto: res.displayText,
          pt: p.fontSize || 7.5,
          negrito: false,
          alinhamento: 'center',
          multilinha: false,
        });
      }
    }
  }
  return { textos, barras };
}

/**
 * Páginas para o envio nativo: texto e barras viram comandos; o que for gráfico (caixa, linha, QR, selo, imagem)
 * vai numa imagem só. `copiasSequencia` > 0 gera uma página por etiqueta da sequência.
 */
export async function montarPaginasNativas(
  template: LabelTemplate,
  paginas: number,
  total: number,
  inicio: number,
  padding: number,
  dpiImagem: number,
  amostragem: number,
): Promise<PaginaNativa[]> {
  const graficos = template.elements_json.filter((el) => !TIPOS_NATIVOS.has(el.type));
  const nativos = template.elements_json.filter((el) => TIPOS_NATIVOS.has(el.type));
  const resultado: PaginaNativa[] = [];
  for (let i = 0; i < paginas; i++) {
    const pag = paginaNativa(nativos, i, total, inicio, padding);
    if (graficos.length > 0) {
      pag.imagem_png_base64 = await renderLabelPngDataUrl({ ...template, elements_json: graficos }, i, total, inicio, padding, dpiImagem, amostragem);
    }
    resultado.push(pag);
  }
  return resultado;
}
