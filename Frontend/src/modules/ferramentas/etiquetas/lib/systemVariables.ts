export interface SystemVariable {
  token: string;
  label: string;
  category: 'produto' | 'lote' | 'volume' | 'empresa' | 'geral' | 'personalizado';
  sample: string;
  description: string;
  recommendedType: 'text' | 'barcode' | 'badge' | 'qrcode';
  isCustom?: boolean;
}

export const DEFAULT_SYSTEM_VARIABLES: SystemVariable[] = [
  // 1. Produtos & Cadastro
  {
    token: '{product_code}',
    label: 'Código do Produto',
    category: 'produto',
    sample: '1.13.035',
    description: 'Código interno do produto no cadastro e ERP',
    recommendedType: 'text',
  },
  {
    token: '{product_name}',
    label: 'Nome / Descrição do Produto',
    category: 'produto',
    sample: 'MÁSCARA THERMO RESTORE 250G',
    description: 'Descrição completa oficial do produto',
    recommendedType: 'text',
  },
  {
    token: '{line}',
    label: 'Linha Comercial',
    category: 'produto',
    sample: 'Linha Profissional',
    description: 'Linha ou família comercial do produto',
    recommendedType: 'text',
  },
  {
    token: '{product_category}',
    label: 'Categoria / Grupo',
    category: 'produto',
    sample: 'Tratamento Capilar',
    description: 'Classificação de categoria do produto',
    recommendedType: 'text',
  },
  {
    token: '{barcode}',
    label: 'Código de Barras EAN-13',
    category: 'produto',
    sample: '7898553231964',
    description: 'Código EAN-13 do item unitário',
    recommendedType: 'barcode',
  },
  {
    token: '{box_barcode}',
    label: 'Código de Barras DUN-14 (Caixa)',
    category: 'produto',
    sample: '17898553231961',
    description: 'Código DUN-14 de expedição da caixa de embarque',
    recommendedType: 'barcode',
  },
  {
    token: '{box_qty}',
    label: 'Quantidade Padrão por Caixa',
    category: 'produto',
    sample: '12 un.',
    description: 'Quantidade de unidades que compõem a caixa padrão',
    recommendedType: 'text',
  },
  {
    token: '{volume_net}',
    label: 'Conteúdo Líquido / Volume',
    category: 'produto',
    sample: '250g',
    description: 'Peso líquido ou volume do frasco/pote',
    recommendedType: 'text',
  },
  {
    token: '{unit}',
    label: 'Unidade de Medida',
    category: 'produto',
    sample: 'UN',
    description: 'Unidade de estoque (UN, CX, KG, L)',
    recommendedType: 'text',
  },
  {
    token: '{ncm}',
    label: 'Classificação Fiscal (NCM)',
    category: 'produto',
    sample: '3305.90.00',
    description: 'Nomenclatura Comum do Mercosul',
    recommendedType: 'text',
  },
  {
    token: '{anvisa_reg}',
    label: 'Notificação / Registro ANVISA',
    category: 'produto',
    sample: 'Processo ANVISA nº 25351.123456/2024-11',
    description: 'Número de processo regulatório ANVISA',
    recommendedType: 'text',
  },

  // 2. Lotes, Produção & Rastreabilidade
  {
    token: '{lot}',
    label: 'Número do Lote',
    category: 'lote',
    sample: '15527',
    description: 'Identificador único do lote de fabricação',
    recommendedType: 'text',
  },
  {
    token: '{manufacturing_date}',
    label: 'Data de Fabricação',
    category: 'lote',
    sample: new Date().toLocaleDateString('pt-BR'),
    description: 'Data em que o lote foi envasado/produzido',
    recommendedType: 'text',
  },
  {
    token: '{expiry_date}',
    label: 'Data de Validade',
    category: 'lote',
    sample: (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 2);
      return d.toLocaleDateString('pt-BR');
    })(),
    description: 'Data limite de validade do produto',
    recommendedType: 'text',
  },
  {
    token: '{production_time}',
    label: 'Hora da Produção',
    category: 'lote',
    sample: '14:30',
    description: 'Horário do apontamento de produção',
    recommendedType: 'text',
  },
  {
    token: '{lot_total_qty}',
    label: 'Quantidade Total do Lote',
    category: 'lote',
    sample: '720 un.',
    description: 'Total de unidades produzidas no lote',
    recommendedType: 'text',
  },
  {
    token: '{technical_resp}',
    label: 'Responsável Técnico / Químico',
    category: 'lote',
    sample: 'Resp. Téc.: CRQ IV - 04261890',
    description: 'Registro profissional do químico responsável',
    recommendedType: 'text',
  },
  {
    token: '{machine_line}',
    label: 'Linha / Envasadora',
    category: 'lote',
    sample: 'Linha 02 - Bisnagas',
    description: 'Linha de envase onde o lote foi produzido',
    recommendedType: 'text',
  },

  // 3. Volumes, Logística & Caixas
  {
    token: '{seq}',
    label: 'Número da Caixa (Contador)',
    category: 'volume',
    sample: '01',
    description: 'Número sequencial da caixa atual impressa',
    recommendedType: 'text',
  },
  {
    token: '{total}',
    label: 'Total de Caixas do Lote',
    category: 'volume',
    sample: '60',
    description: 'Quantidade total de caixas geradas para o lote',
    recommendedType: 'text',
  },
  {
    token: '{box_sequence}',
    label: 'Sequência Formatada (Caixa X de Y)',
    category: 'volume',
    sample: 'Caixa 01 de 60',
    description: 'Texto completo de identificação do volume',
    recommendedType: 'text',
  },
  {
    token: '{gross_weight}',
    label: 'Peso Bruto Estimado',
    category: 'volume',
    sample: '3.45 kg',
    description: 'Peso bruto total da caixa com embalagem',
    recommendedType: 'text',
  },
  {
    token: '{customer_name}',
    label: 'Destinatário / Cliente',
    category: 'volume',
    sample: 'Distribuidora Bella Cosméticos',
    description: 'Nome do cliente de destino do pedido',
    recommendedType: 'text',
  },
  {
    token: '{order_number}',
    label: 'Número do Pedido / NF',
    category: 'volume',
    sample: 'PED-9842',
    description: 'Número do pedido de venda ou nota fiscal',
    recommendedType: 'text',
  },

  // 4. Dados da Empresa Fabricante
  {
    token: '{company_name}',
    label: 'Razão Social Fabricante',
    category: 'empresa',
    sample: 'Nátum Cosméticos Indústria e Comércio Ltda',
    description: 'Razão social oficial da empresa',
    recommendedType: 'text',
  },
  {
    token: '{brand_name}',
    label: 'Marca / Nome Fantasia',
    category: 'empresa',
    sample: 'NÁTUM COSMÉTICOS',
    description: 'Nome comercial da marca',
    recommendedType: 'text',
  },
  {
    token: '{company_cnpj}',
    label: 'CNPJ do Fabricante',
    category: 'empresa',
    sample: '00.000.000/0001-00',
    description: 'Cadastro Nacional de Pessoa Jurídica',
    recommendedType: 'text',
  },
  {
    token: '{company_city}',
    label: 'Origem / Cidade - UF',
    category: 'empresa',
    sample: 'Franca - SP / Indústria Brasileira',
    description: 'Cidade de fabricação e procedência nacional',
    recommendedType: 'text',
  },
  {
    token: '{company_sac}',
    label: 'SAC / Atendimento ao Consumidor',
    category: 'empresa',
    sample: 'sac@natumcosmeticos.com.br',
    description: 'Canal de atendimento ao cliente',
    recommendedType: 'text',
  },
  {
    token: '{company_site}',
    label: 'Website Oficial',
    category: 'empresa',
    sample: 'www.natumcosmeticos.com.br',
    description: 'Endereço web da empresa',
    recommendedType: 'text',
  },

  // 5. Gerais & Data
  {
    token: '{date}',
    label: 'Data Atual (Impressão)',
    category: 'geral',
    sample: new Date().toLocaleDateString('pt-BR'),
    description: 'Data em que a etiqueta foi emitida',
    recommendedType: 'text',
  },
  {
    token: '{time}',
    label: 'Hora Atual (Impressão)',
    category: 'geral',
    sample: '10:45',
    description: 'Horário em que a etiqueta foi emitida',
    recommendedType: 'text',
  },
  {
    token: '{operator_name}',
    label: 'Nome do Operador',
    category: 'geral',
    sample: 'Operador Nexus',
    description: 'Usuário logado que realizou a impressão',
    recommendedType: 'text',
  },
];

const LOCAL_STORAGE_CUSTOM_VARS_KEY = 'natumhub_custom_label_variables';

export function getStoredCustomVariables(): SystemVariable[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_VARS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCustomVariable(variable: { label: string; token: string; sample: string; description?: string }): SystemVariable {
  const allCustom = getStoredCustomVariables();
  // Ensure token starts with { and ends with }
  let formattedToken = variable.token.trim();
  if (!formattedToken.startsWith('{')) formattedToken = `{${formattedToken}`;
  if (!formattedToken.endsWith('}')) formattedToken = `${formattedToken}}`;

  const newVar: SystemVariable = {
    token: formattedToken,
    label: variable.label.trim(),
    category: 'personalizado',
    sample: variable.sample.trim() || 'Valor Exemplo',
    description: variable.description?.trim() || 'Campo personalizado definido pelo usuário',
    recommendedType: 'text',
    isCustom: true,
  };

  const updated = [...allCustom.filter((v) => v.token !== newVar.token), newVar];
  localStorage.setItem(LOCAL_STORAGE_CUSTOM_VARS_KEY, JSON.stringify(updated));
  return newVar;
}

export function deleteCustomVariable(token: string): void {
  const allCustom = getStoredCustomVariables();
  const updated = allCustom.filter((v) => v.token !== token);
  localStorage.setItem(LOCAL_STORAGE_CUSTOM_VARS_KEY, JSON.stringify(updated));
}

export function getAllSystemVariables(): SystemVariable[] {
  const custom = getStoredCustomVariables();
  return [...DEFAULT_SYSTEM_VARIABLES, ...custom];
}
