import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const LAB_NAME = "NATUM COSMÉTICOS";
export const DEPT_NAME = "CONTROLE DE QUALIDADE";
export const COMPANY_INFO = {
  name: "NÁTUM BIO COSMÉTICOS LTDA",
  address: "RUA LUIS BELLETI, 78, SANTA MARIA, CARANGOLA-MG",
  email: "rafael@natumcosmeticos.com.br",
  contact: "(32) 3741-1773",
  sampleType: "COSMETICOS TIPO II"
};

export const TEST_TABLE_HEADERS = [
  "ENSAIO", "RESULTADO", "UNIDADE", "LIMITE ACEITAVEL", "LQ", "MÉTODO", "DATA DO ENSAIO"
];

export const DEFAULT_TESTS = [
  {
    name: "BOLORES E LEVEDURAS",
    result: "<1,0 X 10 (EST)",
    unit: "UFC/G; ML",
    limit: "CONFORME A RDC 481",
    lq: "1,0 UFC",
    method: "PLACA PETRIFIM 3M"
  },
  {
    name: "MESÓFILOS TOTAIS AERÓBIOS",
    result: "AUSENTE",
    unit: "UFC/G; ML",
    limit: "Contagem de microorganismos mesófilos totais aeróbios, não mais que 103 UFC/g ou ml;",
    lq: "1,0 UFC",
    method: "PLACA PETRIFIM AC 3M"
  },
  {
    name: "COLIFORMES E E.COLI",
    result: "AUSENTE",
    unit: "UFC/G; ML",
    limit: "Ausência de Coliformes totais e fecais em 1g ou 1ml",
    lq: "1,0 UFC",
    method: "PLACA PETRIFIM EC 3M"
  },
  {
    name: "STAPHYLOCOCCUS AUREUS",
    result: "AUSENTE",
    unit: "UFC/G; ML",
    limit: "Ausência de Staphylococcus aureus em 1g ou 1ml;",
    lq: "1,0 UFC",
    method: "PLACA PETRIFIM STX 3M"
  },
  {
    name: "PSEUDOMONAS AERUGINOSA",
    result: "AUSENTE",
    unit: "UFC/G; ML",
    limit: "Ausência de Pseudomonas aeruginosa em 1g ou 1ml",
    lq: "1,0 UFC",
    method: "PLACA NKS CETRIMIDE SARTORIUS"
  }
];
