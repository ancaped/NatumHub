use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Estrutura {
    pub id: String,
    pub nome: String,
    pub descricao: Option<String>,
    pub galpao: String,
    pub zona: String,
    pub linhas_permitidas: Vec<String>,
    pub estrado_largura_cm: f64,
    pub estrado_comprimento_cm: f64,
    pub ordem: i32,
    pub ativo: bool,
    pub total_posicoes: usize,
    pub posicoes_ocupadas: usize,
    pub ocupacao_media_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Posicao {
    pub id: String,
    pub estrutura_id: String,
    pub codigo: String,
    pub coluna: String,
    pub coluna_ordem: i32,
    pub nivel: i32,
    pub andar: i32,
    pub lado: i32,
    pub papel: String,
    pub largura_cm: f64,
    pub comprimento_cm: f64,
    pub altura_cm: f64,
    pub ativo: bool,
    pub observacoes: Option<String>,
    pub tipo_ocupacao: String,
    pub ocupacao_manual_pct: Option<f64>,
    pub etiqueta_livre: Option<String>,
    pub reserva_motivo: Option<String>,
    pub reserva_ate: Option<String>,
    pub compartilhado_fracionado: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Caixa {
    pub id: String,
    pub codigo: String,
    pub nome: String,
    pub altura_cm: f64,
    pub comprimento_cm: f64,
    pub largura_cm: f64,
    pub empilhamento_max: i32,
    pub insumo_erp_codigo: Option<String>,
    pub pode_girar: bool,
    pub peso_bruto_kg: Option<f64>,
    pub ativo: bool,
    pub observacoes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Atacadista {
    pub id: String,
    pub nome_exibicao: String,
    pub termo_busca: String,
    pub cliente_codigo: Option<i32>,
    pub ativo: bool,
    pub pedidos_encontrados: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlocacaoItemView {
    pub id: String,
    pub posicao_id: String,
    pub posicao_codigo: String,
    pub estrutura_id: String,
    pub papel: String,
    pub andar: i32,
    pub nivel: i32,
    pub produto_codigo: String,
    pub produto_descricao: String,
    pub linha_prefix: String,
    pub nome_linha: String,
    pub fileiras_largura: i32,
    pub camadas_altura: i32,
    pub fixado: bool,
    pub observacoes: Option<String>,
    pub caixa_id: Option<String>,
    pub caixa_codigo: Option<String>,
    pub caixa_altura_cm: Option<f64>,
    pub caixa_comprimento_cm: Option<f64>,
    pub caixa_largura_cm: Option<f64>,
    pub caixas_comprimento: i32,
    pub max_camadas: i32,
    pub total_caixas: i32,
    pub qtde_cx: Option<i32>,
    pub total_unidades: i32,
    pub largura_ocupada_cm: f64,
    pub altura_ocupada_cm: f64,
    pub altura_vao_cm: f64,
    pub estouro_altura: bool,
    pub cobertura_meses: Option<f64>,
    pub peso_estimado_kg: Option<f64>,
    pub orientacao_modo: String,
    pub orientacao_efetiva: String,
    pub empilhado_sobre: Option<String>,
    pub z_base_cm: f64,
    pub volume_ocupado_m3: f64,
    pub amarrado: bool,
    pub apoio_pct: Option<f64>,
    pub alerta_estabilidade: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PosicaoComItens {
    #[serde(flatten)]
    pub posicao: Posicao,
    pub itens: Vec<AlocacaoItemView>,
    pub lotes: Vec<AlocacaoLoteView>,
    pub largura_ocupada_cm: f64,
    pub largura_livre_cm: f64,
    pub ocupacao_pct: f64,
    pub tem_estouro: bool,
    pub total_caixas: i32,
    pub total_unidades: i32,
    pub peso_carga_kg: f64,
    pub peso_total_com_palete_kg: f64,
    pub cota_base_cm: f64,
    pub acesso_equipamento: String,
    pub volume_vao_m3: f64,
    pub volume_ocupado_m3: f64,
    pub cubagem_pct: f64,
    pub area_ocupada_pct: f64,
    pub estabilidade_status: String,
    pub estabilidade_resumo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProdutoDimensao {
    pub codigo: String,
    pub descricao: String,
    pub codigo_barras: Option<String>,
    pub linha_prefix: String,
    pub nome_linha: String,
    pub linha_principal: Option<String>,
    pub situacao: String,
    pub incluir_abc_override: Option<bool>,
    pub incluir_abc_efetivo: bool,
    pub motivo_fora_abc: Option<String>,
    pub atendimento: String,
    pub eh_kit: bool,
    pub eh_coloracao: bool,
    pub grupo_alocacao: String,
    pub grupo_alocacao_nome: String,
    pub estoque_atual: f64,
    pub estoque_caixas: Option<i32>,
    pub qtde_cx_erp: Option<i32>,
    pub qtde_cx_efetiva: Option<i32>,
    pub qtde_cx_origem: String,
    pub caixa_id: Option<String>,
    pub caixa_codigo: Option<String>,
    pub caixa_nome: Option<String>,
    pub caixa_origem: String,
    pub caixa_altura_cm: Option<f64>,
    pub caixa_comprimento_cm: Option<f64>,
    pub caixa_largura_cm: Option<f64>,
    pub empilhamento_max: Option<i32>,
    pub peso_unitario_kg: Option<f64>,
    pub peso_caixa_estimado_kg: Option<f64>,
    pub classe_empilhamento: String,
    pub insumo_caixa_erp: Option<String>,
    pub insumo_caixa_erp_desc: Option<String>,
    pub camadas_override: Option<i32>,
    pub vendas_varejo: f64,
    pub media_varejo: f64,
    pub vendas_atacado: f64,
    pub media_atacado: f64,
    pub vendas_total: f64,
    pub media_total: f64,
    pub percentual_abc: f64,
    pub acumulado_abc: f64,
    pub curva_abc: String,
    pub meta_meses_efetiva: f64,
    pub caixas_necessarias_picking: i32,
    pub caixas_necessarias_pulmao: i32,
    pub caixas_necessarias_total: i32,
    pub alocacoes: Vec<AlocacaoItemView>,
    pub enderecos_picking: Vec<String>,
    pub enderecos_pulmao: Vec<String>,
    pub total_caixas_alocadas: i32,
    pub total_unidades_alocadas: i32,
    pub cobertura_meses_alocada: Option<f64>,
    pub situacao_alocacao: String,
    pub op_pendente_unidades: i32,
    pub op_pendente_caixas: i32,
    pub op_pendente_lotes: usize,
    pub op_proxima_etapa: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsumoCaixaErpNaoVinculado {
    pub ingredient_code: String,
    pub description: String,
    pub qtd_produtos: i64,
    pub exemplos_produtos: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PainelResumo {
    pub total_produtos: usize,
    pub alocados: usize,
    pub sem_endereco: usize,
    pub sem_caixa: usize,
    pub sem_qtde_cx: usize,
    pub estoque_acima_capacidade: usize,
    pub total_posicoes: usize,
    pub posicoes_ocupadas: usize,
    pub ocupacao_media_pct: f64,
    pub ops_chegando_count: usize,
    pub ops_com_alerta_espaco: usize,
    pub lotes_alocados_count: usize,
    pub alertas_fefo_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PainelAlocacaoResponse {
    pub janela_meses: i32,
    pub meta_meses: f64,
    pub usar_meta_linha: bool,
    pub estrutura_ativa_id: String,
    pub estruturas: Vec<Estrutura>,
    pub posicoes: Vec<PosicaoComItens>,
    pub caixas: Vec<Caixa>,
    pub atacadistas: Vec<Atacadista>,
    pub produtos: Vec<ProdutoDimensao>,
    pub insumos_caixa_erp: Vec<InsumoCaixaErpNaoVinculado>,
    pub resumo: PainelResumo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PainelQuery {
    pub estrutura_id: Option<String>,
    pub janela_meses: Option<i32>,
    pub meta_meses: Option<f64>,
    pub usar_meta_linha: Option<bool>,
    pub incluir_inativos: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientesSugestaoQuery {
    pub search: Option<String>,
    pub janela_meses: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClienteSugestao {
    pub codigo: Option<i32>,
    pub nome: String,
    pub pedidos: i64,
    pub unidades: i64,
    pub ja_atacadista: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstruturaInput {
    pub nome: String,
    pub descricao: Option<String>,
    pub galpao: Option<String>,
    pub zona: Option<String>,
    pub linhas_permitidas: Option<Vec<String>>,
    pub estrado_largura_cm: Option<f64>,
    pub estrado_comprimento_cm: Option<f64>,
    pub ordem: Option<i32>,
    pub ativo: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AndarConfigInput {
    pub andar: i32,
    pub altura_cm: f64,
    pub papel: String,
    pub lados: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GerarGradeInput {
    pub colunas: Vec<String>,
    pub andares: Vec<AndarConfigInput>,
    pub largura_cm: Option<f64>,
    pub comprimento_cm: Option<f64>,
    pub substituir_nao_fixadas: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PosicaoUpdateInput {
    pub altura_cm: Option<f64>,
    pub largura_cm: Option<f64>,
    pub comprimento_cm: Option<f64>,
    pub papel: Option<String>,
    pub ativo: Option<bool>,
    pub observacoes: Option<String>,
    pub aplicar_ao_andar: Option<bool>,
    pub tipo_ocupacao: Option<String>,
    pub ocupacao_manual_pct: Option<f64>,
    pub etiqueta_livre: Option<String>,
    pub reserva_motivo: Option<String>,
    pub reserva_ate: Option<String>,
    pub compartilhado_fracionado: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaixaInput {
    pub codigo: String,
    pub nome: String,
    pub altura_cm: f64,
    pub comprimento_cm: f64,
    pub largura_cm: f64,
    pub empilhamento_max: Option<i32>,
    pub insumo_erp_codigo: Option<String>,
    pub pode_girar: Option<bool>,
    pub peso_bruto_kg: Option<f64>,
    pub ativo: Option<bool>,
    pub observacoes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProdutoCaixaInput {
    pub caixa_id: Option<String>,
    pub qtde_cx_manual: Option<i32>,
    pub camadas_override: Option<i32>,
    pub observacoes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtacadistaInput {
    pub nome_exibicao: String,
    pub termo_busca: String,
    pub cliente_codigo: Option<i32>,
    pub ativo: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlocacaoUpsertInput {
    pub posicao_id: String,
    pub produto_codigo: String,
    pub fileiras_largura: i32,
    pub camadas_altura: i32,
    pub fixado: Option<bool>,
    pub observacoes: Option<String>,
    pub orientacao_modo: Option<String>,
    pub empilhado_sobre: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SugerirInput {
    pub estrutura_id: Option<String>,
    pub janela_meses: Option<i32>,
    pub meta_meses: Option<f64>,
    pub usar_meta_linha: Option<bool>,
    pub linha_prefix: Option<String>,
    pub incluir_saindo_de_linha: Option<bool>,
    pub manter_fixados: Option<bool>,
    pub limpar_nao_fixados: Option<bool>,
    pub considerar_ops_chegando: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SugestaoProposta {
    pub produto_codigo: String,
    pub produto_descricao: String,
    pub curva_abc: String,
    pub linha_prefix: String,
    pub posicao_id: String,
    pub posicao_codigo: String,
    pub papel: String,
    pub acesso_equipamento: String,
    pub motivo_escolha: String,
    pub fileiras_largura: i32,
    pub camadas_altura: i32,
    pub total_caixas: i32,
    pub total_unidades: i32,
    pub largura_ocupada_cm: f64,
    pub orientacao_modo: String,
    pub empilhado_sobre: Option<String>,
    pub amarrado: bool,
    pub volume_ocupado_m3: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SugestaoNaoAlocado {
    pub produto_codigo: String,
    pub produto_descricao: String,
    pub curva_abc: String,
    pub motivo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SugestaoResumo {
    pub estrutura_id: String,
    pub removidas_count: usize,
    pub propostas_count: usize,
    pub produtos_alocados: usize,
    pub posicoes_usadas: usize,
    pub nao_alocados_count: usize,
    pub ocupacao_media_pct: f64,
    pub propostas_manual_count: usize,
    pub propostas_empilhadeira_count: usize,
    pub produtos_com_op_cobertos: usize,
    pub cubagem_media_pct: f64,
    pub paletes_amarrados_count: usize,
    pub itens_empilhados_mistos_count: usize,
    pub itens_so_atacado_no_pulmao: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsChegandoQuery {
    pub estrutura_id: Option<String>,
    pub etapa: Option<String>,
    pub apenas_alertas: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpChegandoItem {
    pub lote_number: String,
    pub status_erp: String,
    pub etapa: String,
    pub etapa_ordem: i32,
    pub produto_codigo: String,
    pub produto_descricao: String,
    pub grupo_alocacao: String,
    pub grupo_alocacao_nome: String,
    pub quantidade_kg: f64,
    pub unidades_estimadas: i32,
    pub caixas_chegando: i32,
    pub qtde_cx_efetiva: Option<i32>,
    pub estoque_caixas: Option<i32>,
    pub capacidade_alocada_caixas: i32,
    pub deficit_caixas: i32,
    pub situacao_espaco: String,
    pub enderecos_picking: Vec<String>,
    pub enderecos_pulmao: Vec<String>,
    pub data_lote: Option<String>,
    pub data_previsao: Option<String>,
    pub motivo_espera: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsChegandoResumo {
    pub total_ops: usize,
    pub em_envase_rotulagem: usize,
    pub liberado_envase: usize,
    pub produzido: usize,
    pub sem_endereco: usize,
    pub falta_espaco: usize,
    pub total_caixas_chegando: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsChegandoResponse {
    pub estrutura_ativa_id: String,
    pub resumo: OpsChegandoResumo,
    pub itens: Vec<OpChegandoItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlocacaoLoteView {
    pub id: String,
    pub posicao_id: String,
    pub posicao_codigo: String,
    pub papel: String,
    pub andar: i32,
    pub produto_codigo: String,
    pub produto_descricao: String,
    pub lote: String,
    pub caixas: i32,
    pub data_fabricacao: Option<String>,
    pub data_validade: Option<String>,
    pub dias_para_vencer: Option<i64>,
    pub status_validade: String,
    pub observacoes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoteErpSugestao {
    pub lote: String,
    pub data_fabricacao: Option<String>,
    pub data_validade_sugerida: Option<String>,
    pub quantidade_kg: Option<f64>,
    pub unidades: Option<f64>,
    pub resultado: Option<String>,
    pub status_erp: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalvarLotePosicaoInput {
    pub posicao_id: String,
    pub produto_codigo: String,
    pub lote: String,
    pub caixas: i32,
    pub data_fabricacao: Option<String>,
    pub data_validade: Option<String>,
    pub observacoes: Option<String>,
    pub garantir_alocacao: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoverLoteInput {
    pub lote_id: String,
    pub destino_posicao_id: String,
    pub caixas: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReposicaoFefoQuery {
    pub estrutura_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TarefaReposicaoFefo {
    pub tipo: String,
    pub prioridade: i32,
    pub produto_codigo: String,
    pub produto_descricao: String,
    pub lote_id: String,
    pub lote: String,
    pub data_validade: Option<String>,
    pub dias_para_vencer: Option<i64>,
    pub origem_posicao_id: String,
    pub origem_posicao_codigo: String,
    pub destino_posicao_id: String,
    pub destino_posicao_codigo: String,
    pub caixas_disponiveis: i32,
    pub caixas_sugeridas: i32,
    pub motivo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReposicaoFefoResumo {
    pub total_lotes: usize,
    pub total_caixas_em_lotes: i32,
    pub vencidos: usize,
    pub criticos_90d: usize,
    pub atencao_180d: usize,
    pub violacoes_fefo: usize,
    pub reposicoes_pendentes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReposicaoFefoResponse {
    pub estrutura_ativa_id: String,
    pub resumo: ReposicaoFefoResumo,
    pub tarefas: Vec<TarefaReposicaoFefo>,
    pub lotes_validade: Vec<AlocacaoLoteView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SugestaoResultado {
    pub propostas: Vec<SugestaoProposta>,
    pub nao_alocados: Vec<SugestaoNaoAlocado>,
    pub resumo: SugestaoResumo,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoverAlocacaoInput {
    pub alocacao_id: String,
    pub destino_posicao_id: String,
    #[serde(default)]
    pub copiar: bool,
    pub fileiras_largura: Option<i32>,
    pub camadas_altura: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProdutoCaixaLoteInput {
    pub produto_codigos: Vec<String>,
    pub caixa_id: Option<String>,
    #[serde(default)]
    pub limpar_caixa: bool,
    pub qtde_cx_manual: Option<i32>,
    #[serde(default)]
    pub limpar_qtde_cx: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AbcElegibilidadeLoteInput {
    pub produto_codigos: Vec<String>,
    pub incluir_abc: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportarMapaItemInput {
    pub posicao_codigo: String,
    pub produto_codigo: String,
    pub fileiras_largura: i32,
    pub camadas_altura: Option<i32>,
    #[serde(default = "default_true")]
    pub fixado: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportarMapaLoteInput {
    pub estrutura_id: String,
    #[serde(default)]
    pub substituir_estrutura: bool,
    pub itens: Vec<ImportarMapaItemInput>,
}
