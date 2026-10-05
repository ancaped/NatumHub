use serde::{Deserialize, Serialize};
use sqlx::{PgPool, FromRow};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ChatMessage {
    pub id: String,
    pub channel: String,
    pub sender_id: Option<String>,
    pub sender_name: String,
    pub sender_role: Option<String>,
    pub content_encrypted: String,
    pub is_encrypted: bool,
    pub message_type: Option<String>,
    pub attachment_data: Option<String>,
    pub attachment_name: Option<String>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub channel: Option<String>,
    pub sender_id: Option<String>,
    pub sender_name: String,
    pub sender_role: Option<String>,
    pub content_encrypted: Option<String>,
    pub is_encrypted: Option<bool>,
    pub message_type: Option<String>,
    pub attachment_data: Option<String>,
    pub attachment_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationItem {
    pub id: String,
    pub name: String,
    pub is_group: bool,
    pub is_protected: bool,
    pub role: Option<String>,
    pub description: Option<String>,
    pub last_message: Option<String>,
    pub last_message_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub description: Option<String>,
    pub password: Option<String>,
    pub created_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyGroupPasswordRequest {
    pub group_id: String,
    pub password: String,
}

#[derive(Debug, FromRow)]
pub struct ChatGroupRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_by: String,
    pub password_hash: Option<String>,
    pub is_protected: bool,
}

pub async fn list_channel_messages(
    pool: &PgPool,
    channel: &str,
    limit: i64,
) -> Result<Vec<ChatMessage>, sqlx::Error> {
    let rows = sqlx::query_as::<_, ChatMessage>(
        r#"
        SELECT id, channel, sender_id, sender_name, sender_role, content_encrypted, is_encrypted, message_type, attachment_data, attachment_name, created_at
        FROM hub_chat_messages
        WHERE channel = $1
        ORDER BY created_at DESC
        LIMIT $2
        "#
    )
    .bind(channel)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let mut list = rows;
    list.reverse();
    Ok(list)
}

pub async fn insert_chat_message(
    pool: &PgPool,
    req: SendMessageRequest,
) -> Result<ChatMessage, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let channel = req.channel.unwrap_or_else(|| "geral".to_string());
    let is_encrypted = req.is_encrypted.unwrap_or(true);
    let content = req.content_encrypted.unwrap_or_default();
    let msg_type = req.message_type.unwrap_or_else(|| "text".to_string());

    let row = sqlx::query_as::<_, ChatMessage>(
        r#"
        INSERT INTO hub_chat_messages (id, channel, sender_id, sender_name, sender_role, content_encrypted, is_encrypted, message_type, attachment_data, attachment_name, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        RETURNING id, channel, sender_id, sender_name, sender_role, content_encrypted, is_encrypted, message_type, attachment_data, attachment_name, created_at
        "#
    )
    .bind(&id)
    .bind(&channel)
    .bind(&req.sender_id)
    .bind(&req.sender_name)
    .bind(&req.sender_role)
    .bind(&content)
    .bind(is_encrypted)
    .bind(&msg_type)
    .bind(&req.attachment_data)
    .bind(&req.attachment_name)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

#[derive(Debug, FromRow)]
struct OperatorRow {
    id: String,
    display_name: String,
    role: String,
}

pub async fn create_chat_group(
    pool: &PgPool,
    req: CreateGroupRequest,
) -> Result<ConversationItem, sqlx::Error> {
    let id = format!("group_{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string());
    let has_pwd = req.password.as_ref().map(|p| !p.trim().is_empty()).unwrap_or(false);
    let pwd_hash = if has_pwd { req.password } else { None };

    sqlx::query(
        r#"
        INSERT INTO hub_chat_groups (id, name, description, created_by, password_hash, is_protected, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        "#
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.created_by)
    .bind(&pwd_hash)
    .bind(has_pwd)
    .execute(pool)
    .await?;

    Ok(ConversationItem {
        id,
        name: req.name,
        is_group: true,
        is_protected: has_pwd,
        role: None,
        description: req.description,
        last_message: None,
        last_message_time: None,
    })
}

pub async fn verify_group_password(
    pool: &PgPool,
    group_id: &str,
    password: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_scalar::<_, Option<String>>(
        "SELECT password_hash FROM hub_chat_groups WHERE id = $1"
    )
    .bind(group_id)
    .fetch_optional(pool)
    .await?;

    if let Some(Some(stored_pwd)) = row {
        Ok(stored_pwd == password)
    } else {
        Ok(true) // Sem senha
    }
}

pub async fn list_conversations(
    pool: &PgPool,
) -> Result<Vec<ConversationItem>, sqlx::Error> {
    let mut items = vec![
        ConversationItem {
            id: "geral".to_string(),
            name: "Canal Geral".to_string(),
            is_group: true,
            is_protected: false,
            role: None,
            description: Some("Comunicação geral de toda a fábrica".to_string()),
            last_message: None,
            last_message_time: None,
        },
        ConversationItem {
            id: "producao".to_string(),
            name: "Produção & Fábrica".to_string(),
            is_group: true,
            is_protected: false,
            role: None,
            description: Some("Ordens, bases, envase e lotes".to_string()),
            last_message: None,
            last_message_time: None,
        },
        ConversationItem {
            id: "compras".to_string(),
            name: "Compras & Almoxarifado".to_string(),
            is_group: true,
            is_protected: false,
            role: None,
            description: Some("Faltas, cotações e recebimento de insumos".to_string()),
            last_message: None,
            last_message_time: None,
        },
        ConversationItem {
            id: "qualidade".to_string(),
            name: "Qualidade & Laboratório".to_string(),
            is_group: true,
            is_protected: false,
            role: None,
            description: Some("Laudos, POPs, microbiologia e CQ".to_string()),
            last_message: None,
            last_message_time: None,
        },
    ];

    // Buscar grupos criados
    if let Ok(groups) = sqlx::query_as::<_, ChatGroupRow>(
        r#"
        SELECT id, name, description, created_by, password_hash, is_protected
        FROM hub_chat_groups
        ORDER BY created_at ASC
        "#
    )
    .fetch_all(pool)
    .await
    {
        for g in groups {
            items.push(ConversationItem {
                id: g.id,
                name: g.name,
                is_group: true,
                is_protected: g.is_protected,
                role: None,
                description: g.description,
                last_message: None,
                last_message_time: None,
            });
        }
    }

    // Buscar operadores ativos no sistema
    let operators = sqlx::query_as::<_, OperatorRow>(
        r#"
        SELECT id, display_name, role
        FROM hub_operators
        WHERE active = 1
        ORDER BY display_name ASC
        "#
    )
    .fetch_all(pool)
    .await?;

    for op in operators {
        items.push(ConversationItem {
            id: format!("user_{}", op.id),
            name: op.display_name.clone(),
            is_group: false,
            is_protected: false,
            role: Some(op.role.clone()),
            description: Some(format!("Função: {}", op.role)),
            last_message: None,
            last_message_time: None,
        });
    }

    Ok(items)
}
