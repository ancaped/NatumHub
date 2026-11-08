//! Ações do Feedback para o chat e para agentes de IA: fila enxuta com filtro e as transições com nota
//! (`resolver`, `devolver`), em 2 passos e auditadas. A tela segue usando as rotas antigas de `handlers`.

use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use super::commands::inserir_nota;
use crate::core::acao::{executar_em_2_passos, ErroApi, RespostaAcao};
use crate::core::catalogo::{param, Acao};

pub const STATUS_ABERTOS: [&str; 4] = ["pending", "queued", "in_progress", "planned"];
const STATUS_TODOS: [&str; 7] = ["pending", "queued", "in_progress", "planned", "awaiting_review", "wont_fix", "resolved"];
const MODULO: &str = "hub_settings";
const TAMANHO_DESCRICAO: i32 = 300;

/// Uma linha da fila: o bastante para escolher o que atacar, sem logs nem print.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackFila {
    pub id: String,
    pub tipo: String,
    pub status: String,
    pub prioridade: i32,
    pub modulo: Option<String>,
    pub tela: String,
    pub descricao: String,
    /// A descrição passou de 300 caracteres e foi cortada (o texto inteiro vem em `detalhar_feedback`).
    pub descricao_cortada: bool,
    pub solicitante: Option<String>,
    pub criado_em: Option<String>,
    pub notas: i64,
    pub tem_logs: bool,
    pub tem_print: bool,
}

/// `abertos` (padrão), `todos` ou lista separada por vírgula de status. Status desconhecido é erro, não filtro vazio.
pub fn interpretar_status(bruto: Option<&str>) -> Result<Vec<String>, ErroApi> {
    let b = bruto.map(str::trim).unwrap_or("");
    match b {
        "" | "abertos" => return Ok(STATUS_ABERTOS.iter().map(|s| s.to_string()).collect()),
        "todos" => return Ok(STATUS_TODOS.iter().map(|s| s.to_string()).collect()),
        _ => {}
    }
    let mut v = Vec::new();
    for s in b.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        if !STATUS_TODOS.contains(&s) {
            return Err(ErroApi::invalido(format!("Status desconhecido: {s}. Use abertos, todos ou {}.", STATUS_TODOS.join(", "))));
        }
        v.push(s.to_string());
    }
    Ok(v)
}

pub async fn listar_fila(pool: &PgPool, status: &[String], modulo: Option<&str>, limite: i64) -> Result<Vec<FeedbackFila>, ErroApi> {
    let rows = sqlx::query(
        r#"SELECT id, "type", status, priority, module_key, page, LEFT(description, $4) AS descricao,
                  LENGTH(description) > $4 AS cortada, requested_by, "createdAt",
                  (SELECT COUNT(*) FROM feedback_notes n WHERE n.feedback_id = feedbacks.id) AS notas,
                  logs <> '' AS tem_logs, screenshot <> '' AS tem_print
           FROM feedbacks
           WHERE status = ANY($1) AND ($2::text IS NULL OR module_key = $2)
           ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'queued' THEN 2 WHEN 'planned' THEN 3
                                WHEN 'awaiting_review' THEN 4 WHEN 'wont_fix' THEN 5 WHEN 'resolved' THEN 6 ELSE 7 END,
                    priority ASC, "createdAt" DESC
           LIMIT $3"#,
    )
    .bind(status)
    .bind(modulo.map(str::trim).filter(|m| !m.is_empty()))
    .bind(limite.clamp(1, 200))
    .bind(TAMANHO_DESCRICAO)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .iter()
        .map(|r| FeedbackFila {
            id: r.get("id"),
            tipo: r.get("type"),
            status: r.get("status"),
            prioridade: r.try_get("priority").unwrap_or(100),
            modulo: r.try_get("module_key").unwrap_or(None),
            tela: r.get("page"),
            descricao: r.get("descricao"),
            descricao_cortada: r.get("cortada"),
            solicitante: r.try_get("requested_by").unwrap_or(None),
            criado_em: r.try_get("createdAt").unwrap_or(None),
            notas: r.get("notas"),
            tem_logs: r.get("tem_logs"),
            tem_print: r.get("tem_print"),
        })
        .collect())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transicao {
    /// Fila de execução → Em aberto (conferência). Quem fez a correção deixa a nota de resolução.
    Resolver,
    /// Em aberto → fila de execução. O supervisor explica o que faltou.
    Devolver,
}

impl Transicao {
    pub fn nome(self) -> &'static str {
        match self {
            Self::Resolver => "resolver_feedback",
            Self::Devolver => "devolver_feedback",
        }
    }

    /// Novo status, ou o motivo de a transição não valer a partir de `atual`.
    pub fn destino(self, atual: &str) -> Result<&'static str, ErroApi> {
        match (self, atual) {
            (Self::Resolver, "queued" | "in_progress" | "planned") => Ok("awaiting_review"),
            (Self::Resolver, "pending") => Err(ErroApi::regra("Ainda está na triagem: o supervisor precisa aprovar para a fila antes de resolver.")),
            (Self::Resolver, "awaiting_review") => Err(ErroApi::conflito("Já está em Em aberto, aguardando conferência.")),
            (Self::Resolver, s) => Err(ErroApi::regra(format!("Feedback {s} não vai para conferência."))),
            (Self::Devolver, "awaiting_review") => Ok("queued"),
            (Self::Devolver, s) => Err(ErroApi::regra(format!("Só se devolve à fila o que está em Em aberto (aguardando conferência); este está {s}."))),
        }
    }
}

/// Muda o status com a nota na mesma transação. Sem `confirmar` mostra o que mudaria; com ele grava e audita.
pub async fn transicionar(
    pool: &PgPool,
    t: Transicao,
    id: &str,
    autor: &str,
    nota: &str,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let nota = nota.trim().to_string();
    if nota.is_empty() {
        return Err(ErroApi::invalido(match t {
            Transicao::Resolver => "Escreva a nota de resolução: o que foi feito e como conferir.",
            Transicao::Devolver => "Escreva a nota do supervisor: o que faltou.",
        }));
    }
    let (id_dono, autor_dono, nota_dono) = (id.to_string(), autor.to_string(), nota.clone());
    let resposta = executar_em_2_passos(pool, t.nome(), confirmar, move |tx| {
        Box::pin(async move {
            let atual: Option<String> = sqlx::query_scalar("SELECT status FROM feedbacks WHERE id = $1 FOR UPDATE")
                .bind(&id_dono)
                .fetch_optional(&mut **tx)
                .await?;
            let atual = atual.ok_or_else(|| ErroApi::nao_encontrado("Feedback não encontrado."))?;
            let para = t.destino(&atual)?;
            inserir_nota(&mut **tx, &id_dono, &autor_dono, &nota_dono).await?;
            sqlx::query(r#"UPDATE feedbacks SET status = $1, "resolvedAt" = NULL WHERE id = $2"#)
                .bind(para)
                .bind(&id_dono)
                .execute(&mut **tx)
                .await?;
            Ok(json!({ "id": id_dono, "de": atual, "para": para, "nota": nota_dono, "autor": autor_dono }))
        })
    })
    .await?;
    if confirmar {
        auditar(pool, autor, t.nome(), id, resposta.resultado.clone()).await;
    }
    Ok(resposta)
}

/// Grava quem fez o quê (operador ou agente). Falha de auditoria não desfaz a ação, mas fica no log.
pub async fn auditar(pool: &PgPool, usuario: &str, acao: &str, id: &str, detalhe: Value) {
    crate::modules::producao::auditoria::registrar(pool, usuario, acao, &format!("feedback:{id}"), detalhe).await;
}

pub fn acoes() -> Vec<Acao> {
    let confirmar = param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia.");
    vec![
        Acao::leitura(
            "listar_fila_feedbacks",
            MODULO,
            "Lista a fila de feedbacks (bugs e sugestões dos operadores) em formato enxuto, sem logs nem print: id, tipo, status, prioridade (menor = mais urgente), módulo, tela, descrição (cortada em 300 caracteres), solicitante, data, nº de notas e se há logs ou print. Por padrão só os abertos (triagem e fila de execução); use `status=todos` ou uma lista. Para o texto inteiro, logs e notas use `detalhar_feedback`.",
            "/api/hub/feedbacks/fila",
            vec![
                param("status", "query", "texto", false, "abertos (padrão), todos, ou lista separada por vírgula de pending, queued, in_progress, planned, awaiting_review, wont_fix, resolved."),
                param("modulo", "query", "texto", false, "Só os deste module_key (ex.: producao)."),
                param("limite", "query", "inteiro", false, "Quantos (1 a 200; padrão 50)."),
            ],
        ),
        Acao::leitura(
            "detalhar_feedback",
            MODULO,
            "Um feedback pelo id, com a descrição inteira, tela, módulo, solicitante, status, prioridade, logs do console, as notas em ordem e o print (imagem em base64, pesada). Passe `print=false` para vir sem o print e poupar o contexto. Dá 404 se o id não existir.",
            "/api/hub/feedbacks/:id",
            vec![
                param("id", "caminho", "texto", true, "Id do feedback (vem em listar_fila_feedbacks)."),
                param("print", "query", "booleano", false, "false omite o print (padrão true)."),
            ],
        ),
        Acao::gravacao(
            "resolver_feedback",
            MODULO,
            "Entrega um feedback da fila para conferência: grava a nota de resolução e passa de queued, in_progress ou planned para awaiting_review (Em aberto), na mesma operação. Quem aprova (resolved) é o supervisor. Recusa o que ainda está na triagem. Sem `confirmar=true` devolve só a prévia (de → para); com ele grava e audita quem fez.",
            "POST",
            "/api/hub/feedbacks/:id/resolver",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do feedback."),
                param("nota", "corpo", "texto", true, "O que foi feito e como conferir."),
                confirmar.clone(),
            ],
        ),
        Acao::gravacao(
            "devolver_feedback",
            MODULO,
            "Devolve à fila (queued) um feedback que está em awaiting_review, com a nota do supervisor dizendo o que faltou. Só supervisor. Sem `confirmar=true` devolve só a prévia (de → para); com ele grava a nota e o status juntos e audita quem fez.",
            "POST",
            "/api/hub/feedbacks/:id/devolver",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do feedback."),
                param("nota", "corpo", "texto", true, "O que faltou ou está errado."),
                confirmar,
            ],
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_padrao_sao_os_abertos() {
        assert_eq!(interpretar_status(None).unwrap(), vec!["pending", "queued", "in_progress", "planned"]);
        assert_eq!(interpretar_status(Some("todos")).unwrap().len(), 7);
    }

    #[test]
    fn status_em_lista_e_desconhecido_recusado() {
        assert_eq!(interpretar_status(Some("queued, resolved")).unwrap(), vec!["queued", "resolved"]);
        assert!(interpretar_status(Some("queued,xyz")).is_err());
    }

    #[test]
    fn resolver_so_sai_da_fila_de_execucao() {
        for s in ["queued", "in_progress", "planned"] {
            assert_eq!(Transicao::Resolver.destino(s).unwrap(), "awaiting_review");
        }
        assert_eq!(Transicao::Resolver.destino("pending").unwrap_err().codigo, "regra_violada");
        assert_eq!(Transicao::Resolver.destino("awaiting_review").unwrap_err().codigo, "conflito");
        assert!(Transicao::Resolver.destino("resolved").is_err());
    }

    #[test]
    fn devolver_so_do_em_aberto() {
        assert_eq!(Transicao::Devolver.destino("awaiting_review").unwrap(), "queued");
        assert!(Transicao::Devolver.destino("queued").is_err());
    }

    async fn status_de(pool: &PgPool, id: &str) -> String {
        sqlx::query_scalar("SELECT status FROM feedbacks WHERE id = $1").bind(id).fetch_one(pool).await.unwrap()
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn fila_filtra_e_transicoes_gravam_so_na_confirmacao() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let id = format!("teste-{}", &uuid::Uuid::new_v4().simple().to_string()[..10]);
        let modulo = format!("modulo_{}", &id[6..]);
        sqlx::query(
            r#"INSERT INTO feedbacks (id, "type", description, page, logs, screenshot, status, module_key)
               VALUES ($1, 'bug', $2, 'Tela X', '', '', 'queued', $3)"#,
        )
        .bind(&id)
        .bind("x".repeat(400))
        .bind(&modulo)
        .execute(&pool)
        .await
        .unwrap();

        let fila = listar_fila(&pool, &interpretar_status(None).unwrap(), Some(&modulo), 10).await.unwrap();
        assert_eq!(fila.len(), 1);
        assert_eq!(fila[0].descricao.chars().count(), 300);
        assert!(fila[0].descricao_cortada && !fila[0].tem_print && fila[0].notas == 0);
        assert!(listar_fila(&pool, &["resolved".to_string()], Some(&modulo), 10).await.unwrap().is_empty());

        assert_eq!(transicionar(&pool, Transicao::Resolver, &id, "Agente Teste", "  ", false).await.unwrap_err().status, axum::http::StatusCode::BAD_REQUEST);
        let previa = transicionar(&pool, Transicao::Resolver, &id, "Agente Teste", "Corrigido em X", false).await.unwrap();
        assert!(previa.previa);
        assert_eq!((previa.resultado["de"].as_str(), previa.resultado["para"].as_str()), (Some("queued"), Some("awaiting_review")));
        assert_eq!(status_de(&pool, &id).await, "queued", "a prévia não grava");
        let notas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM feedback_notes WHERE feedback_id = $1").bind(&id).fetch_one(&pool).await.unwrap();
        assert_eq!(notas, 0);

        transicionar(&pool, Transicao::Resolver, &id, "Agente Teste", "Corrigido em X", true).await.unwrap();
        assert_eq!(status_de(&pool, &id).await, "awaiting_review");
        let admin: Option<String> = sqlx::query_scalar("SELECT admin_notes FROM feedbacks WHERE id = $1").bind(&id).fetch_one(&pool).await.unwrap();
        assert!(admin.unwrap().contains("Corrigido em X"));
        assert_eq!(transicionar(&pool, Transicao::Resolver, &id, "Agente Teste", "de novo", true).await.unwrap_err().codigo, "conflito");

        transicionar(&pool, Transicao::Devolver, &id, "Supervisor Teste", "Falta o caso Y", true).await.unwrap();
        assert_eq!(status_de(&pool, &id).await, "queued");
        let notas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM feedback_notes WHERE feedback_id = $1").bind(&id).fetch_one(&pool).await.unwrap();
        assert_eq!(notas, 2);
        assert_eq!(transicionar(&pool, Transicao::Devolver, &id, "Supervisor Teste", "x", true).await.unwrap_err().codigo, "regra_violada");
        assert_eq!(transicionar(&pool, Transicao::Resolver, "nao-existe", "Agente Teste", "x", false).await.unwrap_err().codigo, "nao_encontrado");

        sqlx::query("DELETE FROM feedback_notes WHERE feedback_id = $1").bind(&id).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM feedbacks WHERE id = $1").bind(&id).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM producao_auditoria WHERE alvo = $1").bind(format!("feedback:{id}")).execute(&pool).await.ok();
    }
}
