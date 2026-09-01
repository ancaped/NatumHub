use std::sync::Arc;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::handlers::AppState;
use super::store::{self, CreateGroupRequest, SendMessageRequest, VerifyGroupPasswordRequest};

#[derive(Deserialize)]
pub struct GetMessagesQuery {
    pub channel: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct AiPromptRequest {
    pub prompt: String,
    pub module_context: Option<String>,
    pub user_name: Option<String>,
}

#[derive(Serialize)]
pub struct AiPromptResponse {
    pub response: String,
    pub suggested_actions: Vec<String>,
}

pub async fn get_conversations_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match store::list_conversations(pool).await {
        Ok(convs) => (StatusCode::OK, Json(serde_json::json!({ "conversations": convs }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn create_group_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateGroupRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    if req.name.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Nome do grupo é obrigatório" }))).into_response();
    }

    match store::create_chat_group(pool, req).await {
        Ok(group) => (StatusCode::CREATED, Json(serde_json::json!({ "group": group }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn verify_password_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<VerifyGroupPasswordRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    match store::verify_group_password(pool, &req.group_id, &req.password).await {
        Ok(valid) => (StatusCode::OK, Json(serde_json::json!({ "valid": valid }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn get_messages_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<GetMessagesQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let channel = query.channel.unwrap_or_else(|| "geral".to_string());
    let limit = query.limit.unwrap_or(50).clamp(1, 200);

    match store::list_channel_messages(pool, &channel, limit).await {
        Ok(msgs) => (StatusCode::OK, Json(serde_json::json!({ "messages": msgs }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn post_message_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SendMessageRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let has_content = req.content_encrypted.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
    let has_attachment = req.attachment_data.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);

    if (!has_content && !has_attachment) || req.sender_name.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Mensagem ou anexo é obrigatório" }))).into_response();
    }

    match store::insert_chat_message(pool, req).await {
        Ok(msg) => (StatusCode::CREATED, Json(serde_json::json!({ "message": msg }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn ask_ai_handler(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<AiPromptRequest>,
) -> impl IntoResponse {
    let prompt_lower = req.prompt.to_lowercase();
    let user_name = req.user_name.as_deref().unwrap_or("Operador");
    let module = req.module_context.as_deref().unwrap_or("Geral");

    let (reply, actions) = if prompt_lower.contains("estoque") || prompt_lower.contains("saldo") {
        (
            format!("Olá, {}! Para consultar ou auditar saldos de estoque e insumos, você pode utilizar a aba **Auditoria de Produtos** no Painel do Supervisor ou acessar a grade de **Almoxarifado / Estoque Geral**. Todas as contagens e reservas (-R) são atualizadas em tempo real com o ERP.", user_name),
            vec!["Ver Auditoria de Estoque".to_string(), "Consultar Almoxarifado".to_string()]
        )
    } else if prompt_lower.contains("produção") || prompt_lower.contains("lote") || prompt_lower.contains("ordem") {
        (
            "Na área de **Produção**, você pode visualizar as Ordens de Produção (OPs) abertas, programadas e finalizadas, além de acompanhar o consumo de insumos por lote e gerar etiquetas de rastreabilidade.".to_string(),
            vec!["Abrir Módulo de Produção".to_string(), "Ver Ordens Programadas".to_string()]
        )
    } else if prompt_lower.contains("compras") || prompt_lower.contains("pedido") || prompt_lower.contains("cotação") {
        (
            "O módulo de **Compras** calcula as necessidades de compra com base nas faltas da produção e pedidos pendentes. Você pode gerar cotações e lançar pedidos de fornecedores diretamente.".to_string(),
            vec!["Ir para Compras".to_string(), "Planejamento de Compras".to_string()]
        )
    } else if prompt_lower.contains("relatório") || prompt_lower.contains("relatorios") || prompt_lower.contains("saúde") {
        (
            "O novo submódulo **Relatórios** no menu **Administrativo** reúne a **Saúde de Estoque** e os **Relatórios de Produtos Ativos** para tomada de decisão rápida.".to_string(),
            vec!["Administrativo > Relatórios".to_string()]
        )
    } else if prompt_lower.contains("backup") || prompt_lower.contains("banco") {
        (
            "Os backups do PostgreSQL são gerados automaticamente nos horários programados e podem ser disparados manualmente na aba **Banco de Dados & Backups** do Painel do Supervisor.".to_string(),
            vec!["Painel do Supervisor > Banco".to_string()]
        )
    } else {
        (
            format!("Olá, {}! Sou o Assistente NatumHub para o módulo **{}**. Como posso te ajudar com processos de produção, compras, estoque, relatórios ou configurações?", user_name, module),
            vec!["Como auditar estoque?".to_string(), "Novo submódulo Relatórios".to_string(), "Como funciona o Chat com Senha?".to_string()]
        )
    };

    (StatusCode::OK, Json(AiPromptResponse {
        response: reply,
        suggested_actions: actions,
    })).into_response()
}
