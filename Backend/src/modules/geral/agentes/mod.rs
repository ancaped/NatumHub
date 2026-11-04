//! Agentes de IA como operadores do Nexus.
//!
//! Um agente é um operador com `kind = 'agente'`: entra só com token próprio (`nxa_...`, guardado como SHA-256),
//! nunca por senha, nunca é supervisor e só vê/edita os módulos marcados para ele (sem módulos padrão do papel).
//! As permissões são as mesmas dos operadores (`hub_operator_modules`), então a tela Operadores também as edita.
//! Toda ação do agente sai na auditoria geral com `origem = 'agente'`.

use std::{collections::BTreeMap, sync::Arc};

use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Response},
    routing::{get, post},
    Extension, Json, Router,
};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::core::acao::{executar_em_2_passos, Confirmar, ErroApi, RespostaAcao};
use crate::core::catalogo::{self, param, Acao};
use crate::handlers::AppState;
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::{AuthContext, OperatorRole, Origem};
use crate::modules::geral::auth::modules_registry::{all_module_keys_vec, MODULE_CONFIGURACOES, MODULE_OPERADORES};
use crate::modules::geral::auth::store::{get_operator_modules_and_permissions, has_read_access, has_write_access, modulos_da_rota};

pub const PREFIXO_TOKEN: &str = "nxa_";
const MODULO_AUDITORIA: &str = "hub_settings";

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/agentes/eu", get(eu_rota))
        .route("/api/agentes/acoes", get(acoes_rota))
        .route("/api/agentes/criar", post(criar_por_agente_rota))
        .route("/api/agentes/criados", get(criados_rota))
        .route("/api/agentes/criados/:id/token", post(criado_token_rota))
        .route("/api/agentes/criados/:id/modulos", post(criado_modulos_rota))
        .route("/api/agentes/criados/:id/revogar", post(criado_revogar_rota))
        .route("/api/admin/agentes", get(listar_rota).post(criar_rota))
        .route("/api/admin/agentes/:id/token", post(novo_token_rota))
        .route("/api/admin/agentes/:id/revogar", post(revogar_rota))
}

/// Ações de criação de agentes por agentes de IA (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    vec![
        Acao::gravacao(
            "criar_agente_ia",
            MODULE_OPERADORES,
            "Cria um agente de IA limitado. Só para agentes com Gestão de Operadores (hub_operadores) em nível editar; operadores criam pela tela de Agentes. Você só pode dar módulos que você tem, em nível igual ou menor (ver ou editar), e nunca hub_operadores nem hub_settings; o agente novo também não exclui registros. Limite de 10 agentes ativos criados por você. Sem `confirmar=true` devolve a prévia (nome e módulos) ou as recusas com o motivo; com ele grava e devolve `id`, `nome`, `modulos` e o `token` UMA ÚNICA VEZ: guarde o token, ele não aparece de novo. Depois de criado, você troca o token, ajusta os módulos e revoga com trocar_token_agente_criado, ajustar_modulos_agente_criado e revogar_agente_criado (só os que você criou).",
            "POST",
            "/api/agentes/criar",
            true,
            vec![
                param("nome", "corpo", "texto", true, "Nome do agente novo (único entre operadores e agentes)."),
                param("modulos", "corpo", "objeto módulo → nível", true, "Ex.: {\"vendas\": \"ver\", \"planejamento_producao\": \"editar\"}. Só módulos que você tem, em nível igual ou menor."),
                param("confirmar", "query", "booleano", false, "true para criar de fato; sem ele só a prévia (também aceito no corpo)."),
            ],
        ),
        Acao::leitura(
            "listar_agentes_criados",
            MODULE_OPERADORES,
            "Lista os agentes de IA criados por você (quem chama), com id, nome, se está ativo, módulos e níveis, e os tokens só pelo prefixo (o token inteiro nunca volta; use o que recebeu na criação). Inclui os já revogados; o limite de 10 conta só os ativos com token não revogado. Só para agentes com Gestão de Operadores (ver ou editar).",
            "/api/agentes/criados",
            vec![],
        ),
        Acao::gravacao(
            "trocar_token_agente_criado",
            MODULE_OPERADORES,
            "Troca o token de um agente que VOCÊ criou: revoga os tokens ativos dele e gera um novo. Só para agentes com Gestão de Operadores (hub_operadores) em nível editar; agente criado por outro (ou pelo supervisor) e o seu próprio dão 403. Se o agente estava sem token (revogado), conta como reativar e respeita o limite de 10 agentes ativos. Sem `confirmar=true` devolve a prévia (agente e quantos tokens seriam revogados); com ele grava e devolve o `token` novo UMA ÚNICA VEZ: guarde o token, ele não aparece de novo. Audita quem trocou.",
            "POST",
            "/api/agentes/criados/:id/token",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do agente criado por você (veja listar_agentes_criados)."),
                param("confirmar", "query", "booleano", false, "true para trocar de fato; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "ajustar_modulos_agente_criado",
            MODULE_OPERADORES,
            "Troca o conjunto inteiro de módulos de um agente que VOCÊ criou (os módulos que não vierem no corpo saem). Mesmas regras da criação: só módulos que você tem, em nível igual ou menor (ver ou editar), nunca hub_operadores nem hub_settings, e o conjunto não pode ficar vazio (para tirar tudo, use revogar_agente_criado). Só para agentes com Gestão de Operadores em nível editar. Sem `confirmar=true` devolve a prévia com `antes` e `depois` por módulo ou as recusas com o motivo; com ele grava. O token não muda e nada é devolvido dele. Audita antes e depois.",
            "POST",
            "/api/agentes/criados/:id/modulos",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do agente criado por você."),
                param("modulos", "corpo", "objeto módulo → nível", true, "Conjunto novo e completo. Ex.: {\"vendas\": \"ver\"}. Só módulos que você tem, em nível igual ou menor."),
                param("confirmar", "query", "booleano", false, "true para gravar; sem ele só a prévia (também aceito no corpo)."),
            ],
        ),
        Acao::gravacao(
            "revogar_agente_criado",
            MODULE_OPERADORES,
            "Revoga todos os tokens ativos de um agente que VOCÊ criou: ele para de entrar até você trocar o token (trocar_token_agente_criado). Não apaga o agente nem o histórico dele. Só para agentes com Gestão de Operadores (hub_operadores) em nível editar; agente criado por outro (ou pelo supervisor) dá 403. Sem `confirmar=true` devolve a prévia (agente e quantos tokens seriam revogados); com ele grava. Revogar libera uma vaga no limite de 10 agentes ativos. Audita quem revogou.",
            "POST",
            "/api/agentes/criados/:id/revogar",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do agente criado por você."),
                param("confirmar", "query", "booleano", false, "true para revogar de fato; sem ele só a prévia."),
            ],
        ),
    ]
}

pub fn gerar_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    format!("{PREFIXO_TOKEN}{}", hex::encode(bytes))
}

pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

/// Começo do token, para reconhecer qual é sem guardá-lo.
fn prefixo_visivel(token: &str) -> String {
    token.chars().take(PREFIXO_TOKEN.len() + 6).collect()
}

/// Nível gravado (`view`/`edit`) para o usado na API (`ver`/`editar`).
fn nivel_api(nivel_db: &str) -> &'static str {
    if nivel_db == "view" { "ver" } else { "editar" }
}

fn nivel_db(nivel_api: &str) -> Option<&'static str> {
    match nivel_api {
        "ver" => Some("view"),
        "editar" => Some("edit"),
        _ => None,
    }
}

/// Sessão de um token de agente. `None` se o token não existe, foi revogado ou o agente está inativo.
pub async fn resolver_token(pool: &PgPool, token: &str) -> Result<Option<AuthContext>, String> {
    let row: Option<(String, String, String)> = sqlx::query_as(
        "SELECT t.id, o.id, o.display_name FROM hub_agent_tokens t \
         JOIN hub_operators o ON o.id = t.operator_id \
         WHERE t.token_hash = $1 AND t.revogado_em IS NULL AND o.active = 1 AND o.kind = 'agente'",
    )
    .bind(hash_token(token))
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some((token_id, operator_id, display_name)) = row else {
        return Ok(None);
    };
    let _ = sqlx::query("UPDATE hub_agent_tokens SET ultimo_uso = NOW() WHERE id = $1")
        .bind(&token_id)
        .execute(pool)
        .await;
    let (modules, permissions) = get_operator_modules_and_permissions(pool, &operator_id).await?;
    Ok(Some(AuthContext {
        operator_id,
        display_name,
        role: OperatorRole::Operador,
        modules,
        permissions,
        origem: Origem::Agente,
    }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Eu {
    pub id: String,
    pub nome: String,
    pub origem: &'static str,
    pub supervisor: bool,
    /// módulo → `ver` ou `editar`
    pub modulos: BTreeMap<String, &'static str>,
    /// Como ler o campo `modulo` das ações e de onde vem a permissão.
    pub como_ler: &'static str,
}

/// Quem está chamando e o que pode fazer. Serve para o agente se orientar antes de agir.
pub fn eu(ctx: &AuthContext) -> Eu {
    Eu {
        id: ctx.operator_id.clone(),
        nome: ctx.display_name.clone(),
        origem: ctx.origem.as_str(),
        supervisor: ctx.role.is_supervisor(),
        modulos: ctx
            .modules
            .iter()
            .map(|m| (m.clone(), if ctx.can_edit_module(m) { "editar" } else { "ver" }))
            .collect(),
        como_ler: COMO_LER,
    }
}

const COMO_LER: &str = "A permissão de cada ação vem dos módulos da rota (campo liberadaPor em /api/agentes/acoes); o campo modulo da ação é só onde ela fica. Agentes com Gestão de Operadores (hub_operadores) podem criar até 10 agentes limitados com criar_agente_ia e, só nos que criaram, trocar o token, ajustar os módulos e revogar.";

/// Ação do catálogo com a informação de o chamador poder executá-la.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcaoVisivel {
    #[serde(flatten)]
    pub acao: Acao,
    pub permitida: bool,
    /// Por que a ação não é permitida ao agente, quando a regra é de exclusão (não depende de módulo).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negada_por: Option<&'static str>,
    /// Módulos que dão acesso à rota (`modulos_da_rota`); a permissão vem daqui, não do campo `modulo`.
    pub liberada_por: Vec<LiberadaPor>,
}

#[derive(Debug, Serialize)]
pub struct LiberadaPor {
    pub modulo: &'static str,
    /// O chamador tem este módulo (agente: o que está na sua lista; operador/supervisor: todos).
    pub tem: bool,
}

fn liberada_por(ctx: &AuthContext, caminho: &str) -> Vec<LiberadaPor> {
    let mut v: Vec<LiberadaPor> = Vec::new();
    for m in modulos_da_rota(caminho).unwrap_or(&[]) {
        if v.iter().all(|x| x.modulo != *m) {
            v.push(LiberadaPor { modulo: m, tem: !ctx.is_agente() || ctx.has_module(m) });
        }
    }
    v
}

/// Ações do catálogo que o chamador enxerga. Operador: todas, permitidas. Agente: só as de módulos que ele pode
/// ler; as de escrita vêm com `permitida` = pode editar a rota (mesmas funções que o middleware usa).
pub fn acoes_para(ctx: &AuthContext, modulo: Option<&str>) -> Vec<AcaoVisivel> {
    catalogo::todas()
        .into_iter()
        .filter(|a| modulo.map_or(true, |m| a.modulo == m))
        .filter_map(|a| {
            if !ctx.is_agente() {
                let liberada_por = liberada_por(ctx, a.caminho);
                return Some(AcaoVisivel { acao: a, permitida: true, negada_por: None, liberada_por });
            }
            // Agente só vê as ações de módulos que tem. (`has_read_access` libera /api/agentes/* para todos, por
            // causa de /eu e /acoes; aqui, nas ações de criação, vale o módulo da rota.)
            if !has_read_access(ctx, a.caminho, "GET") || !modulos_da_rota(a.caminho).is_some_and(|ms| ms.iter().any(|m| ctx.has_module(m))) {
                return None;
            }
            let exclusao = a.exclui;
            let permitida = !exclusao && (!a.escrita || has_write_access(ctx, a.caminho, a.metodo));
            let negada_por = exclusao.then_some(catalogo::AGENTE_NAO_EXCLUI);
            let liberada_por = liberada_por(ctx, a.caminho);
            Some(AcaoVisivel { acao: a, permitida, negada_por, liberada_por })
        })
        .collect()
}

#[derive(Debug, Deserialize)]
struct AcoesQuery {
    modulo: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenResumo {
    pub id: String,
    pub prefixo: String,
    pub criado_em: String,
    pub criado_por: Option<String>,
    pub ultimo_uso: Option<String>,
    pub revogado_em: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Agente {
    pub id: String,
    pub nome: String,
    pub ativo: bool,
    pub modulos: BTreeMap<String, &'static str>,
    pub tokens: Vec<TokenResumo>,
}

const FMT_DATA: &str = "'YYYY-MM-DD HH24:MI:SS'";

pub async fn listar(pool: &PgPool) -> Result<Vec<Agente>, ErroApi> {
    let agentes: Vec<(String, String, i32)> = sqlx::query_as(
        "SELECT id, display_name, active FROM hub_operators WHERE kind = 'agente' ORDER BY LOWER(display_name)",
    )
    .fetch_all(pool)
    .await?;
    let mut out = Vec::with_capacity(agentes.len());
    for (id, nome, ativo) in agentes {
        let (modulos, niveis) = get_operator_modules_and_permissions(pool, &id).await.map_err(ErroApi::interno)?;
        let tokens: Vec<(String, String, String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(&format!(
            "SELECT id, prefixo, to_char(criado_em AT TIME ZONE 'America/Sao_Paulo', {FMT_DATA}), criado_por, \
                    to_char(ultimo_uso AT TIME ZONE 'America/Sao_Paulo', {FMT_DATA}), \
                    to_char(revogado_em AT TIME ZONE 'America/Sao_Paulo', {FMT_DATA}) \
             FROM hub_agent_tokens WHERE operator_id = $1 ORDER BY criado_em DESC"
        ))
        .bind(&id)
        .fetch_all(pool)
        .await?;
        out.push(Agente {
            id,
            nome,
            ativo: ativo == 1,
            modulos: modulos
                .into_iter()
                .map(|m| {
                    let n = nivel_api(niveis.get(&m).map(String::as_str).unwrap_or("edit"));
                    (m, n)
                })
                .collect(),
            tokens: tokens
                .into_iter()
                .map(|(id, prefixo, criado_em, criado_por, ultimo_uso, revogado_em)| TokenResumo {
                    id,
                    prefixo,
                    criado_em,
                    criado_por,
                    ultimo_uso,
                    revogado_em,
                })
                .collect(),
        });
    }
    Ok(out)
}

#[derive(Debug, Deserialize)]
pub struct NovoAgente {
    pub nome: String,
    /// módulo → `ver` ou `editar`
    #[serde(default)]
    pub modulos: BTreeMap<String, String>,
    #[serde(default)]
    pub confirmar: bool,
}

/// Valida módulos e níveis; devolve (módulo, nível gravado).
fn validar_modulos(modulos: &BTreeMap<String, String>) -> Result<Vec<(String, &'static str)>, ErroApi> {
    let validos = all_module_keys_vec();
    modulos
        .iter()
        .map(|(m, n)| {
            if !validos.iter().any(|v| v == m) {
                return Err(ErroApi::invalido(format!("Módulo desconhecido: {m}.")).com_detalhes(json!({ "modulo": m })));
            }
            let nivel = nivel_db(n.trim())
                .ok_or_else(|| ErroApi::invalido(format!("Nível inválido para {m}: use 'ver' ou 'editar'.")))?;
            Ok((m.clone(), nivel))
        })
        .collect()
}

/// Cria o agente com seus módulos e o primeiro token. O token só aparece na resposta com `confirmar`.
/// Quem chama é o supervisor (tela de Configurações); agente de IA usa `criar_por_agente`.
pub async fn criar(pool: &PgPool, autor: &AuthContext, entrada: NovoAgente) -> Result<RespostaAcao<Value>, ErroApi> {
    criar_interno(pool, autor, entrada, false).await
}

async fn criar_interno(pool: &PgPool, autor: &AuthContext, entrada: NovoAgente, por_agente: bool) -> Result<RespostaAcao<Value>, ErroApi> {
    let nome = entrada.nome.trim().to_string();
    if nome.is_empty() {
        return Err(ErroApi::invalido("Informe o nome do agente."));
    }
    let modulos = validar_modulos(&entrada.modulos)?;
    let confirmar = entrada.confirmar;
    let criado_por = autor.display_name.clone();
    let resposta = executar_em_2_passos(pool, "criar_agente", confirmar, move |tx| {
        Box::pin(async move {
            let existe: Option<String> =
                sqlx::query_scalar("SELECT id FROM hub_operators WHERE LOWER(display_name) = LOWER($1)")
                    .bind(&nome)
                    .fetch_optional(&mut **tx)
                    .await?;
            if existe.is_some() {
                return Err(ErroApi::conflito("Já existe um operador ou agente com esse nome."));
            }
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO hub_operators (id, display_name, role, active, update_channel, kind) \
                 VALUES ($1, $2, 'operador', 1, 'stable', 'agente')",
            )
            .bind(&id)
            .bind(&nome)
            .execute(&mut **tx)
            .await?;
            for (modulo, nivel) in &modulos {
                sqlx::query("INSERT INTO hub_operator_modules (operator_id, module_key, access_level) VALUES ($1, $2, $3)")
                    .bind(&id)
                    .bind(modulo)
                    .bind(nivel)
                    .execute(&mut **tx)
                    .await?;
            }
            let token = gerar_token();
            gravar_token(tx, &id, &token, &criado_por).await?;
            Ok(json!({
                "id": id,
                "nome": nome,
                "modulos": modulos.iter().map(|(m, n)| (m.clone(), nivel_api(n))).collect::<BTreeMap<_, _>>(),
                "token": confirmar.then_some(token),
                "aviso": confirmar.then_some("Guarde o token agora: ele não aparece de novo."),
            }))
        })
    })
    .await?;
    if confirmar {
        let r = &resposta.resultado;
        let id = r["id"].as_str().unwrap_or_default();
        let depois = json!({ "nome": r["nome"], "modulos": r["modulos"], "criadoPor": autor.display_name, "origem": autor.origem.as_str() });
        let (acao, resumo) = if por_agente {
            (ACAO_CRIAR_POR_AGENTE, "Agente de IA criado por outro agente")
        } else {
            ("criar_agente", "Agente de IA criado")
        };
        audit::record_domain(pool, Some(autor), MODULO_AUDITORIA, acao, "agente", id, resumo, None, Some(depois)).await;
    }
    Ok(resposta)
}

// ---------------------------------------------------------------- Agente cria agente

/// Ação gravada na auditoria quando um agente cria outro; a contagem do limite e a lista de criados partem dela.
const ACAO_CRIAR_POR_AGENTE: &str = "criar_agente_por_agente";
/// Máximo de agentes ativos criados por um mesmo agente.
pub const LIMITE_AGENTES_CRIADOS: usize = 10;
/// Módulos que um agente criado por agente nunca recebe: ele não cria outros agentes nem mexe em configuração.
const MODULOS_VEDADOS_AO_CRIADO: [&str; 2] = [MODULE_OPERADORES, MODULE_CONFIGURACOES];

/// Só agente de IA com Gestão de Operadores (`editar` para criar, `ver` para listar). Operador usa a rota de admin.
fn exigir_agente_com_gestao(ctx: &AuthContext, editar: bool) -> Result<(), ErroApi> {
    if !ctx.is_agente() {
        return Err(ErroApi::invalido(
            "Esta rota é só para agentes de IA. Operadores criam agentes pela tela de Agentes (Configurações) ou por /api/admin/agentes.",
        ));
    }
    let tem = if editar { ctx.can_edit_module(MODULE_OPERADORES) } else { ctx.has_module(MODULE_OPERADORES) };
    if tem {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao(format!(
            "Seu token precisa do módulo {MODULE_OPERADORES} (Gestão de Operadores) em nível {}.",
            if editar { "editar" } else { "ver" }
        )))
    }
}

/// Motivos para recusar os módulos pedidos: só os que o criador tem, em nível igual ou menor, e nunca os vedados.
pub fn recusas_de_modulos(criador: &AuthContext, pedidos: &BTreeMap<String, String>) -> Vec<String> {
    let mut recusas = Vec::new();
    for (modulo, nivel) in pedidos {
        if MODULOS_VEDADOS_AO_CRIADO.contains(&modulo.as_str()) {
            recusas.push(format!("{modulo}: agente criado por agente nunca recebe Gestão de Operadores nem Configurações."));
        } else if !criador.has_module(modulo) {
            recusas.push(format!("{modulo}: você não tem este módulo, então não pode dá-lo."));
        } else if nivel.trim() == "editar" && !criador.can_edit_module(modulo) {
            recusas.push(format!("{modulo}: você só tem 'ver' neste módulo, então não pode dar 'editar'."));
        }
    }
    recusas
}

/// Agentes criados por este agente e se ainda estão vivos (ativo e com algum token não revogado).
/// A autoria vem de dois registros que já existem, sem migração: o evento `criar_agente_por_agente` na auditoria
/// (por `actor_id`, estável mesmo se o agente for renomeado) ou o `criado_por` do token mais antigo do agente
/// (nome do criador; os nomes de operadores e agentes são únicos). Um basta; o `OR` cobre falha ao gravar a auditoria.
async fn criados_por(pool: &PgPool, criador: &AuthContext) -> Result<Vec<(String, bool)>, ErroApi> {
    audit::store::ensure_tables(pool).await.map_err(ErroApi::interno)?;
    Ok(sqlx::query_as(
        "SELECT o.id, (o.active = 1 AND EXISTS (SELECT 1 FROM hub_agent_tokens t WHERE t.operator_id = o.id AND t.revogado_em IS NULL)) \
         FROM hub_operators o WHERE o.kind = 'agente' AND ( \
             EXISTS (SELECT 1 FROM hub_audit_events e WHERE e.action = $3 AND e.actor_id = $1 AND e.entity_id = o.id) \
             OR (SELECT t0.criado_por FROM hub_agent_tokens t0 WHERE t0.operator_id = o.id ORDER BY t0.criado_em ASC LIMIT 1) = $2) \
         ORDER BY LOWER(o.display_name)",
    )
    .bind(&criador.operator_id)
    .bind(&criador.display_name)
    .bind(ACAO_CRIAR_POR_AGENTE)
    .fetch_all(pool)
    .await?)
}

/// Agente de IA cria agente de IA, com limites: só módulos que ele tem (nível igual ou menor), nunca Gestão de
/// Operadores nem Configurações, no máximo `LIMITE_AGENTES_CRIADOS` vivos. Mesmo 2 passos de `criar`: sem
/// `confirmar` devolve a prévia (ou as recusas, com motivo); com ele grava e devolve o token uma única vez.
pub async fn criar_por_agente(pool: &PgPool, autor: &AuthContext, entrada: NovoAgente) -> Result<RespostaAcao<Value>, ErroApi> {
    exigir_agente_com_gestao(autor, true)?;
    let mut recusas = recusas_de_modulos(autor, &entrada.modulos);
    let vivos = criados_por(pool, autor).await?.into_iter().filter(|(_, vivo)| *vivo).count();
    if vivos >= LIMITE_AGENTES_CRIADOS {
        recusas.push(format!("limite: você já criou {vivos} agentes ativos (máximo {LIMITE_AGENTES_CRIADOS}); peça ao supervisor para revogar algum."));
    }
    if !recusas.is_empty() {
        return Err(ErroApi::regra(format!("Criação recusada: {}", recusas.join(" | "))).com_detalhes(json!({ "recusas": recusas })));
    }
    criar_interno(pool, autor, entrada, true).await
}

/// Agentes criados por este agente (sem tokens: só o prefixo).
pub async fn listar_criados(pool: &PgPool, criador: &AuthContext) -> Result<Vec<Agente>, ErroApi> {
    exigir_agente_com_gestao(criador, false)?;
    let ids: Vec<String> = criados_por(pool, criador).await?.into_iter().map(|(id, _)| id).collect();
    Ok(listar(pool).await?.into_iter().filter(|a| ids.contains(&a.id)).collect())
}

/// Garante que `id` é de um agente criado por quem chama (nunca ele mesmo, nem de outro criador ou do supervisor).
/// Devolve se o agente está vivo (ativo e com token não revogado).
async fn exigir_dono(pool: &PgPool, autor: &AuthContext, id: &str) -> Result<bool, ErroApi> {
    exigir_agente_com_gestao(autor, true)?;
    criados_por(pool, autor)
        .await?
        .into_iter()
        .find(|(criado, _)| criado == id)
        .map(|(_, vivo)| vivo)
        .ok_or_else(|| ErroApi::sem_permissao("Este agente não foi criado por você."))
}

/// Troca o token de um agente criado por quem chama. Se ele estava sem token ativo, é reativação e respeita o limite.
pub async fn trocar_token_criado(pool: &PgPool, autor: &AuthContext, id: &str, confirmar: bool) -> Result<RespostaAcao<Value>, ErroApi> {
    let vivo = exigir_dono(pool, autor, id).await?;
    if !vivo {
        let vivos = criados_por(pool, autor).await?.into_iter().filter(|(_, v)| *v).count();
        if vivos >= LIMITE_AGENTES_CRIADOS {
            return Err(ErroApi::regra(format!(
                "Reativação recusada: você já tem {vivos} agentes ativos (máximo {LIMITE_AGENTES_CRIADOS}); revogue algum antes."
            ))
            .com_detalhes(json!({ "recusas": ["limite"] })));
        }
    }
    trocar_token_interno(pool, autor, id, confirmar, true).await
}

/// Revoga os tokens de um agente criado por quem chama.
pub async fn revogar_criado(pool: &PgPool, autor: &AuthContext, id: &str, confirmar: bool) -> Result<RespostaAcao<Value>, ErroApi> {
    exigir_dono(pool, autor, id).await?;
    revogar_interno(pool, autor, id, confirmar, true).await
}

#[derive(Debug, Deserialize)]
pub struct AjusteModulos {
    #[serde(default)]
    pub modulos: BTreeMap<String, String>,
    #[serde(default)]
    pub confirmar: bool,
}

/// Troca o conjunto inteiro de módulos de um agente criado por quem chama, com as mesmas regras da criação.
pub async fn ajustar_modulos_criado(pool: &PgPool, autor: &AuthContext, id: &str, entrada: AjusteModulos) -> Result<RespostaAcao<Value>, ErroApi> {
    exigir_dono(pool, autor, id).await?;
    if entrada.modulos.is_empty() {
        return Err(ErroApi::invalido("Informe ao menos um módulo; para tirar o acesso de tudo, revogue o agente (revogar_agente_criado)."));
    }
    let novos = validar_modulos(&entrada.modulos)?;
    let recusas = recusas_de_modulos(autor, &entrada.modulos);
    if !recusas.is_empty() {
        return Err(ErroApi::regra(format!("Ajuste recusado: {}", recusas.join(" | "))).com_detalhes(json!({ "recusas": recusas })));
    }
    let (id_tx, confirmar) = (id.to_string(), entrada.confirmar);
    let resposta = executar_em_2_passos(pool, "ajustar_modulos_agente", confirmar, move |tx| {
        Box::pin(async move {
            let nome = nome_do_agente(tx, &id_tx).await?;
            let antes: Vec<(String, String)> =
                sqlx::query_as("SELECT module_key, access_level FROM hub_operator_modules WHERE operator_id = $1")
                    .bind(&id_tx)
                    .fetch_all(&mut **tx)
                    .await?;
            sqlx::query("DELETE FROM hub_operator_modules WHERE operator_id = $1").bind(&id_tx).execute(&mut **tx).await?;
            for (modulo, nivel) in &novos {
                sqlx::query("INSERT INTO hub_operator_modules (operator_id, module_key, access_level) VALUES ($1, $2, $3)")
                    .bind(&id_tx)
                    .bind(modulo)
                    .bind(nivel)
                    .execute(&mut **tx)
                    .await?;
            }
            Ok(json!({
                "agente": nome,
                "antes": antes.iter().map(|(m, n)| (m.clone(), nivel_api(n))).collect::<BTreeMap<_, _>>(),
                "depois": novos.iter().map(|(m, n)| (m.clone(), nivel_api(n))).collect::<BTreeMap<_, _>>(),
            }))
        })
    })
    .await?;
    if confirmar {
        let r = &resposta.resultado;
        let antes = json!({ "modulos": r["antes"] });
        let depois = json!({ "modulos": r["depois"], "origem": autor.origem.as_str(), "criadoPor": autor.display_name });
        audit::record_domain(pool, Some(autor), MODULO_AUDITORIA, "ajustar_modulos_agente", "agente", id, "Módulos de agente ajustados por agente", Some(antes), Some(depois)).await;
    }
    Ok(resposta)
}

async fn gravar_token(
    tx: &mut sqlx::Transaction<'static, sqlx::Postgres>,
    operator_id: &str,
    token: &str,
    criado_por: &str,
) -> Result<(), ErroApi> {
    sqlx::query(
        "INSERT INTO hub_agent_tokens (id, operator_id, token_hash, prefixo, criado_por) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(operator_id)
    .bind(hash_token(token))
    .bind(prefixo_visivel(token))
    .bind(criado_por)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn nome_do_agente(tx: &mut sqlx::Transaction<'static, sqlx::Postgres>, id: &str) -> Result<String, ErroApi> {
    sqlx::query_scalar("SELECT display_name FROM hub_operators WHERE id = $1 AND kind = 'agente'")
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| ErroApi::nao_encontrado("Agente não encontrado."))
}

async fn revogar_tokens(tx: &mut sqlx::Transaction<'static, sqlx::Postgres>, id: &str) -> Result<u64, ErroApi> {
    Ok(sqlx::query("UPDATE hub_agent_tokens SET revogado_em = NOW() WHERE operator_id = $1 AND revogado_em IS NULL")
        .bind(id)
        .execute(&mut **tx)
        .await?
        .rows_affected())
}

/// Corpo da auditoria de troca/revogação de token; quando é agente, registra a origem e o criador (nunca o token).
fn depois_de_token(autor: &AuthContext, resultado: &Value, por_agente: bool) -> Value {
    let mut depois = json!({ "tokensRevogados": resultado["tokensRevogados"] });
    if por_agente {
        depois["origem"] = json!(autor.origem.as_str());
        depois["criadoPor"] = json!(autor.display_name);
    }
    depois
}

/// Troca o token: revoga os ativos e gera um novo (que só aparece com `confirmar`).
pub async fn novo_token(pool: &PgPool, autor: &AuthContext, id: &str, confirmar: bool) -> Result<RespostaAcao<Value>, ErroApi> {
    trocar_token_interno(pool, autor, id, confirmar, false).await
}

async fn trocar_token_interno(pool: &PgPool, autor: &AuthContext, id: &str, confirmar: bool, por_agente: bool) -> Result<RespostaAcao<Value>, ErroApi> {
    let (id_tx, criado_por) = (id.to_string(), autor.display_name.clone());
    let resposta = executar_em_2_passos(pool, "trocar_token_agente", confirmar, move |tx| {
        Box::pin(async move {
            let nome = nome_do_agente(tx, &id_tx).await?;
            let revogados = revogar_tokens(tx, &id_tx).await?;
            let token = gerar_token();
            gravar_token(tx, &id_tx, &token, &criado_por).await?;
            Ok(json!({
                "agente": nome,
                "tokensRevogados": revogados,
                "token": confirmar.then_some(token),
                "aviso": confirmar.then_some("Guarde o token agora: ele não aparece de novo."),
            }))
        })
    })
    .await?;
    if confirmar {
        let depois = depois_de_token(autor, &resposta.resultado, por_agente);
        audit::record_domain(pool, Some(autor), MODULO_AUDITORIA, "trocar_token_agente", "agente", id, "Token de agente trocado", None, Some(depois)).await;
    }
    Ok(resposta)
}

/// Revoga todos os tokens ativos: o agente para de entrar até ganhar um token novo.
pub async fn revogar(pool: &PgPool, autor: &AuthContext, id: &str, confirmar: bool) -> Result<RespostaAcao<Value>, ErroApi> {
    revogar_interno(pool, autor, id, confirmar, false).await
}

async fn revogar_interno(pool: &PgPool, autor: &AuthContext, id: &str, confirmar: bool, por_agente: bool) -> Result<RespostaAcao<Value>, ErroApi> {
    let id_tx = id.to_string();
    let resposta = executar_em_2_passos(pool, "revogar_agente", confirmar, move |tx| {
        Box::pin(async move {
            let nome = nome_do_agente(tx, &id_tx).await?;
            let revogados = revogar_tokens(tx, &id_tx).await?;
            Ok(json!({ "agente": nome, "tokensRevogados": revogados }))
        })
    })
    .await?;
    if confirmar {
        let depois = depois_de_token(autor, &resposta.resultado, por_agente);
        audit::record_domain(pool, Some(autor), MODULO_AUDITORIA, "revogar_agente", "agente", id, "Tokens de agente revogados", None, Some(depois)).await;
    }
    Ok(resposta)
}

fn responder<T: Serialize>(r: Result<T, ErroApi>) -> Response {
    match r {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

/// O middleware já barra quem não é supervisor; repetido aqui para a regra não depender só da lista de caminhos.
fn exigir_supervisor(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() && !ctx.is_agente() {
        Ok(())
    } else {
        Err(ErroApi::novo(axum::http::StatusCode::FORBIDDEN, "apenas_supervisor", "Apenas o supervisor gerencia agentes."))
    }
}

async fn eu_rota(Extension(ctx): Extension<AuthContext>) -> Response {
    Json(eu(&ctx)).into_response()
}

async fn acoes_rota(Extension(ctx): Extension<AuthContext>, Query(q): Query<AcoesQuery>) -> Response {
    Json(json!({ "acoes": acoes_para(&ctx, q.modulo.as_deref()) })).into_response()
}

async fn listar_rota(State(state): State<Arc<AppState>>, Extension(ctx): Extension<AuthContext>) -> Response {
    if let Err(e) = exigir_supervisor(&ctx) {
        return e.into_response();
    }
    responder(listar(state.db.pool()).await)
}

async fn criar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(entrada): Json<NovoAgente>,
) -> Response {
    if let Err(e) = exigir_supervisor(&ctx) {
        return e.into_response();
    }
    responder(criar(state.db.pool(), &ctx, entrada).await)
}

async fn criar_por_agente_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<Confirmar>,
    Json(mut entrada): Json<NovoAgente>,
) -> Response {
    entrada.confirmar = entrada.confirmar || q.confirmar;
    responder(criar_por_agente(state.db.pool(), &ctx, entrada).await)
}

async fn criados_rota(State(state): State<Arc<AppState>>, Extension(ctx): Extension<AuthContext>) -> Response {
    responder(listar_criados(state.db.pool(), &ctx).await.map(|agentes| json!({ "agentes": agentes })))
}

async fn criado_token_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<Confirmar>,
) -> Response {
    responder(trocar_token_criado(state.db.pool(), &ctx, &id, q.confirmar).await)
}

async fn criado_modulos_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<Confirmar>,
    Json(mut entrada): Json<AjusteModulos>,
) -> Response {
    entrada.confirmar = entrada.confirmar || q.confirmar;
    responder(ajustar_modulos_criado(state.db.pool(), &ctx, &id, entrada).await)
}

async fn criado_revogar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<Confirmar>,
) -> Response {
    responder(revogar_criado(state.db.pool(), &ctx, &id, q.confirmar).await)
}

async fn novo_token_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<Confirmar>,
) -> Response {
    if let Err(e) = exigir_supervisor(&ctx) {
        return e.into_response();
    }
    responder(novo_token(state.db.pool(), &ctx, &id, q.confirmar).await)
}

async fn revogar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<Confirmar>,
) -> Response {
    if let Err(e) = exigir_supervisor(&ctx) {
        return e.into_response();
    }
    responder(revogar(state.db.pool(), &ctx, &id, q.confirmar).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn token_tem_prefixo_e_hash_estavel() {
        let t = gerar_token();
        assert!(t.starts_with(PREFIXO_TOKEN));
        assert_eq!(t.len(), PREFIXO_TOKEN.len() + 64);
        assert_ne!(t, gerar_token());
        assert_eq!(hash_token(&t), hash_token(&t));
        assert_ne!(hash_token(&t), t);
        assert_eq!(prefixo_visivel(&t).len(), PREFIXO_TOKEN.len() + 6);
    }

    #[test]
    fn modulos_aceitam_so_chave_conhecida_e_ver_ou_editar() {
        let chave = all_module_keys_vec().into_iter().next().unwrap();
        let ok = BTreeMap::from([(chave.clone(), "ver".to_string())]);
        assert_eq!(validar_modulos(&ok).unwrap(), vec![(chave.clone(), "view")]);
        let nivel_ruim = BTreeMap::from([(chave, "admin".to_string())]);
        assert_eq!(validar_modulos(&nivel_ruim).unwrap_err().codigo, "invalido");
        let modulo_ruim = BTreeMap::from([("nao_existe".to_string(), "ver".to_string())]);
        assert_eq!(validar_modulos(&modulo_ruim).unwrap_err().codigo, "invalido");
    }

    fn ctx_teste(origem: Origem, nivel: &str) -> AuthContext {
        AuthContext {
            operator_id: "a1".into(),
            display_name: "Agente PCP".into(),
            role: OperatorRole::Operador,
            modules: vec!["planejamento_producao".into()],
            permissions: HashMap::from([("planejamento_producao".into(), nivel.into())]),
            origem,
        }
    }

    fn permitida(v: &[AcaoVisivel], nome: &str) -> Option<bool> {
        v.iter().find(|a| a.acao.nome == nome).map(|a| a.permitida)
    }

    #[test]
    fn acoes_do_agente_respeitam_modulos_e_nivel() {
        let ver = acoes_para(&ctx_teste(Origem::Agente, "view"), None);
        assert_eq!(permitida(&ver, "listar_planejamento_semana"), Some(true));
        assert_eq!(permitida(&ver, "excluir_ordem_planejamento"), Some(false), "escrita aparece, mas não permitida");
        assert_eq!(permitida(&ver, "listar_kits"), None, "módulo que o agente não tem não aparece");

        let editar = acoes_para(&ctx_teste(Origem::Agente, "edit"), None);
        assert_eq!(permitida(&editar, "excluir_ordem_planejamento"), Some(false), "agente não exclui, nem com editar");
        assert_eq!(permitida(&editar, "aprovar_ordem_planejamento"), Some(true));

        let filtrado = acoes_para(&ctx_teste(Origem::Agente, "edit"), Some("planejamento_producao"));
        assert!(!filtrado.is_empty() && filtrado.iter().all(|a| a.acao.modulo == "planejamento_producao"));
    }

    #[test]
    fn acao_traz_liberada_por_com_modulo_que_o_agente_tem() {
        // Agente só com `producao`: ações cujo `modulo` é outro (ex.: planejamento_producao, producao_lotes)
        // aparecem liberadas por um módulo que ele tem.
        let ctx = agente_com(&[("producao", "view")]);
        let v = acoes_para(&ctx, None);
        let fora: Vec<_> = v.iter().filter(|a| a.acao.modulo != "producao").collect();
        assert!(!fora.is_empty());
        for a in fora {
            assert!(a.liberada_por.iter().any(|l| l.tem && l.modulo == "producao"), "{}", a.acao.nome);
            assert!(a.liberada_por.iter().all(|l| l.tem == (l.modulo == "producao")), "{}", a.acao.nome);
        }
        assert!(eu(&ctx).como_ler.contains("liberadaPor"));
    }

    #[test]
    fn agente_com_editar_nao_exclui_e_operador_sim() {
        use crate::core::catalogo::e_exclusao;
        // agente com "editar" no módulo: pode gravar no planejamento, mas excluir não
        let agente = ctx_teste(Origem::Agente, "edit");
        let v = acoes_para(&agente, None);
        assert_eq!(permitida(&v, "enviar_para_fila"), Some(true));
        for nome in ["excluir_da_fila", "limpar_fila_demandas", "excluir_ordem_planejamento", "limpar_semana_planejamento"] {
            assert_eq!(permitida(&v, nome), Some(false), "{nome}");
            let a = v.iter().find(|a| a.acao.nome == nome).unwrap();
            assert_eq!(a.negada_por, Some(catalogo::AGENTE_NAO_EXCLUI));
        }
        // o middleware recusa por esta regra (rota+método), antes de olhar módulo
        assert!(agente.is_agente() && e_exclusao("DELETE", "/api/producao/fila-demandas/x"));
        assert!(agente.is_agente() && e_exclusao("POST", "/api/producao/fila-demandas/limpar"));
        // operador: tudo permitido, sem motivo de recusa
        let op = acoes_para(&ctx_teste(Origem::Tela, "edit"), None);
        assert_eq!(permitida(&op, "excluir_da_fila"), Some(true));
        assert!(op.iter().all(|a| a.negada_por.is_none()));
    }

    #[test]
    fn operador_ve_todas_as_acoes_permitidas() {
        let todas = acoes_para(&ctx_teste(Origem::Tela, "view"), None);
        assert_eq!(todas.len(), catalogo::todas().len());
        assert!(todas.iter().all(|a| a.permitida));
    }

    #[test]
    fn eu_mostra_nivel_por_modulo_e_origem() {
        let ctx = AuthContext {
            operator_id: "a1".into(),
            display_name: "Agente PCP".into(),
            role: OperatorRole::Operador,
            modules: vec!["producao".into(), "compras".into()],
            permissions: HashMap::from([("producao".into(), "view".into()), ("compras".into(), "edit".into())]),
            origem: Origem::Agente,
        };
        let e = eu(&ctx);
        assert_eq!(e.origem, "agente");
        assert!(!e.supervisor);
        assert_eq!(e.modulos["producao"], "ver");
        assert_eq!(e.modulos["compras"], "editar");
        assert!(exigir_supervisor(&ctx).is_err());
    }

    #[test]
    fn agente_nao_escreve_em_caminho_sem_modulo_mapeado() {
        use crate::modules::geral::auth::store::has_write_access;
        let mut ctx = AuthContext {
            operator_id: "a1".into(),
            display_name: "Agente".into(),
            role: OperatorRole::Operador,
            modules: vec!["vendas".into()],
            permissions: HashMap::from([("vendas".into(), "view".into())]),
            origem: Origem::Agente,
        };
        assert!(!has_write_access(&ctx, "/api/caminho-sem-modulo", "POST"));
        assert!(!has_write_access(&ctx, "/api/vendas/pedidos", "POST"), "só 'ver' em vendas");
        assert!(has_write_access(&ctx, "/api/vendas/pedidos", "GET"));
        ctx.origem = Origem::Tela;
        assert!(has_write_access(&ctx, "/api/caminho-sem-modulo", "POST"), "operador segue como antes");
    }

    fn agente_com(modulos: &[(&str, &str)]) -> AuthContext {
        AuthContext {
            operator_id: "a1".into(),
            display_name: "Agente".into(),
            role: OperatorRole::Operador,
            modules: modulos.iter().map(|(m, _)| m.to_string()).collect(),
            permissions: modulos.iter().map(|(m, n)| (m.to_string(), n.to_string())).collect(),
            origem: Origem::Agente,
        }
    }

    #[test]
    fn agente_so_le_rotas_dos_seus_modulos() {
        use crate::modules::geral::auth::store::has_read_access;
        let ctx = agente_com(&[("vendas", "view")]);
        assert!(has_read_access(&ctx, "/api/vendas/pedidos", "GET"));
        assert!(has_read_access(&ctx, "/api/produtos/2.13.012/detalhes", "GET"), "cadastro de produtos serve a vendas");
        assert!(has_read_access(&ctx, "/api/agentes/eu", "GET"));
        assert!(has_read_access(&ctx, "/api/health", "GET"));
        assert!(!has_read_access(&ctx, "/api/producao/auditoria", "GET"));
        assert!(!has_read_access(&ctx, "/api/hub/compras/demands", "GET"));
        assert!(!has_read_access(&ctx, "/api/notifications", "GET"), "rota sem módulo mapeado");
        assert!(!has_read_access(&ctx, "/api/vendasx", "GET"), "prefixo casa por segmento");
        let mut operador = ctx.clone();
        operador.origem = Origem::Tela;
        assert!(has_read_access(&operador, "/api/producao/auditoria", "GET"), "operador segue sem restrição de leitura");
    }

    #[test]
    fn agente_com_editar_grava_em_rota_mapeada_sem_regra_propria() {
        use crate::modules::geral::auth::store::has_write_access;
        let pcp = agente_com(&[("planejamento_producao", "edit")]);
        assert!(has_write_access(&pcp, "/api/producao/fila-demandas/1/retirar", "POST"));
        assert!(!has_write_access(&pcp, "/api/kits/1", "POST"));
        let leitor = agente_com(&[("planejamento_producao", "view")]);
        assert!(!has_write_access(&leitor, "/api/producao/fila-demandas/1/retirar", "POST"));
    }

    #[test]
    fn modulo_categorias_so_libera_a_rota_de_categorias() {
        let bot = agente_com(&[("compras_categorias", "edit")]);
        assert!(has_write_access(&bot, "/api/hub/compras/categorias", "POST"));
        assert!(has_read_access(&bot, "/api/hub/compras/categories", "GET"));
        assert!(has_read_access(&bot, "/api/hub/compras/items", "GET"));
        assert!(!has_write_access(&bot, "/api/hub/compras/items/1.30.001/categoria", "POST"));
        assert!(!has_read_access(&bot, "/api/compras/pedidos", "GET"));
        let leitor = agente_com(&[("compras_categorias", "view")]);
        assert!(!has_write_access(&leitor, "/api/hub/compras/categorias", "POST"));
        let apoio = agente_com(&[("compras_apoio", "edit")]);
        assert!(!has_write_access(&apoio, "/api/hub/compras/categorias", "POST"));
        // o gerente repassa só o que tem, pela regra geral de módulos
        let gerente = agente_com(&[("hub_operadores", "edit"), ("compras_categorias", "edit")]);
        let pedido = BTreeMap::from([("compras_categorias".to_string(), "editar".to_string())]);
        assert!(recusas_de_modulos(&gerente, &pedido).is_empty());
        assert!(!recusas_de_modulos(&apoio, &pedido).is_empty());
    }

    #[test]
    fn todo_modulo_do_mapa_existe_no_registro() {
        use crate::modules::geral::auth::store::modulos_da_rota;
        let validos = all_module_keys_vec();
        for rota in ["/api/vendas", "/api/hub/compras", "/api/qualidade/pops", "/api/almox", "/api/estoque", "/api/producao", "/api/kits", "/api/administrativo", "/api/ferramentas/balanca", "/api/settings", "/api/expedicao", "/api/financeiro"] {
            for m in modulos_da_rota(rota).unwrap() {
                assert!(validos.iter().any(|v| v == m), "{rota}: módulo {m} fora do registro");
            }
        }
    }

    #[test]
    fn rotas_do_planejamento_caem_em_planejamento_e_nao_em_producao_geral() {
        use crate::modules::geral::auth::store::modulos_da_rota;
        let esperado = ["planejamento_producao", "producao"];
        for rota in [
            "/api/producao/planejamento/roteiro",
            "/api/producao/planejamento/sugerir-sequencia",
            "/api/producao/regras",
            "/api/producao/regras/1",
            "/api/producao/produtos/123/contexto",
        ] {
            assert_eq!(modulos_da_rota(rota).unwrap(), esperado, "{rota}");
        }
        // Não confunde com prefixo parecido: segue a regra geral de produção.
        assert!(modulos_da_rota("/api/producao/planejamentos").unwrap().len() > esperado.len());
        // Agente só de planejamento lê e grava nelas; sem o módulo, não.
        let pcp = AuthContext {
            operator_id: "a1".into(),
            display_name: "Agente PCP".into(),
            role: OperatorRole::Operador,
            modules: vec!["planejamento_producao".into()],
            permissions: HashMap::from([("planejamento_producao".into(), "edit".into())]),
            origem: Origem::Agente,
        };
        assert!(has_write_access(&pcp, "/api/producao/regras", "POST"));
        assert!(has_read_access(&pcp, "/api/producao/planejamento/roteiro", "GET"));
        let sem = AuthContext { modules: vec![], permissions: HashMap::new(), ..pcp };
        assert!(!has_read_access(&sem, "/api/producao/regras", "GET"));
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn ciclo_do_agente_criar_trocar_e_revogar_token() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let nome = format!("teste-agente-{}", Uuid::new_v4());
        let mut autor = agente_com(&[]);
        autor.role = OperatorRole::Supervisor;
        autor.origem = Origem::Tela;
        autor.display_name = "teste-supervisor".into();
        let entrada = |confirmar| NovoAgente {
            nome: nome.clone(),
            modulos: BTreeMap::from([("vendas".to_string(), "ver".to_string()), ("producao".to_string(), "editar".to_string())]),
            confirmar,
        };
        let contar = |pool: PgPool, nome: String| async move {
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM hub_operators WHERE display_name = $1")
                .bind(nome)
                .fetch_one(&pool)
                .await
                .unwrap()
        };

        // prévia não grava
        let previa = criar(&pool, &autor, entrada(false)).await.unwrap();
        assert!(previa.previa);
        assert_eq!(contar(pool.clone(), nome.clone()).await, 0);

        // confirmar grava e devolve o token
        let criado = criar(&pool, &autor, entrada(true)).await.unwrap();
        let id = criado.resultado["id"].as_str().unwrap().to_string();
        let token = criado.resultado["token"].as_str().unwrap().to_string();
        assert!(token.starts_with("nxa_"));
        assert_eq!(contar(pool.clone(), nome.clone()).await, 1);

        let resultado = async {
            let ctx = resolver_token(&pool, &token).await.unwrap().expect("token deve resolver");
            assert_eq!(ctx.origem, Origem::Agente);
            assert_ne!(ctx.role, OperatorRole::Supervisor);
            let mut mods = ctx.modules.clone();
            mods.sort();
            assert_eq!(mods, vec!["producao".to_string(), "vendas".to_string()]);

            // trocar o token revoga o antigo
            let novo = novo_token(&pool, &autor, &id, true).await.unwrap();
            let token2 = novo.resultado["token"].as_str().unwrap().to_string();
            assert!(resolver_token(&pool, &token).await.unwrap().is_none(), "token antigo revogado");
            assert!(resolver_token(&pool, &token2).await.unwrap().is_some(), "token novo funciona");

            // revogar derruba o token
            revogar(&pool, &autor, &id, true).await.unwrap();
            assert!(resolver_token(&pool, &token2).await.unwrap().is_none(), "token revogado");
        }
        .await;

        for sql in [
            "DELETE FROM hub_agent_tokens WHERE operator_id = $1",
            "DELETE FROM hub_operator_modules WHERE operator_id = $1",
            "DELETE FROM hub_operators WHERE id = $1",
        ] {
            sqlx::query(sql).bind(&id).execute(&pool).await.unwrap();
        }
        resultado
    }

    fn criador(modulos: &[(&str, &str)]) -> AuthContext {
        let mut c = agente_com(modulos);
        c.operator_id = "criador-1".into();
        c.display_name = "Agente Criador".into();
        c
    }

    fn pedido(itens: &[(&str, &str)]) -> BTreeMap<String, String> {
        itens.iter().map(|(m, n)| (m.to_string(), n.to_string())).collect()
    }

    #[test]
    fn so_agente_com_gestao_de_operadores_cria() {
        use crate::modules::geral::auth::store::{has_read_access, has_write_access};
        // sem o módulo: o middleware já recusa (403) e o serviço também
        let sem = criador(&[("vendas", "edit")]);
        assert!(!has_write_access(&sem, "/api/agentes/criar", "POST"));
        assert_eq!(exigir_agente_com_gestao(&sem, true).unwrap_err().status, axum::http::StatusCode::FORBIDDEN);
        // só ver: lista, mas não cria
        let ver = criador(&[("hub_operadores", "view")]);
        assert!(!has_write_access(&ver, "/api/agentes/criar", "POST"));
        assert!(has_read_access(&ver, "/api/agentes/criados", "GET"));
        assert!(exigir_agente_com_gestao(&ver, true).is_err());
        assert!(exigir_agente_com_gestao(&ver, false).is_ok());
        // com editar: passa
        let ok = criador(&[("hub_operadores", "edit")]);
        assert!(has_write_access(&ok, "/api/agentes/criar", "POST"));
        assert!(exigir_agente_com_gestao(&ok, true).is_ok());
        // operador (tela) recebe 400 claro: usa a rota de admin
        let mut op = ok.clone();
        op.origem = Origem::Tela;
        let e = exigir_agente_com_gestao(&op, true).unwrap_err();
        assert_eq!(e.status, axum::http::StatusCode::BAD_REQUEST);
        assert!(e.mensagem.contains("/api/admin/agentes"));
    }

    #[test]
    fn recusa_modulo_que_nao_tem_nivel_maior_e_vedados() {
        let c = criador(&[("hub_operadores", "edit"), ("vendas", "edit"), ("producao", "view")]);
        assert!(recusas_de_modulos(&c, &pedido(&[("vendas", "ver"), ("vendas", "editar"), ("producao", "ver")])).is_empty());
        let r = recusas_de_modulos(&c, &pedido(&[("compras_mp", "ver")]));
        assert!(r.len() == 1 && r[0].contains("não tem"), "{r:?}");
        let r = recusas_de_modulos(&c, &pedido(&[("producao", "editar")]));
        assert!(r.len() == 1 && r[0].contains("só tem 'ver'"), "{r:?}");
        // os vedados saem mesmo que o criador os tenha
        let r = recusas_de_modulos(&c, &pedido(&[("hub_operadores", "ver"), ("hub_settings", "ver")]));
        assert_eq!(r.len(), 2);
        assert!(r.iter().all(|x| x.contains("nunca recebe")));
    }

    #[test]
    fn catalogo_traz_as_acoes_de_criacao() {
        let a = acoes();
        let criar = a.iter().find(|x| x.nome == "criar_agente_ia").unwrap();
        assert!(criar.escrita && criar.dois_passos && !criar.exclui);
        assert!(criar.descricao.contains("UMA ÚNICA VEZ") && criar.descricao.contains("10"));
        assert!(a.iter().any(|x| x.nome == "listar_agentes_criados" && !x.escrita));
        assert!(eu(&criador(&[])).como_ler.contains("criar_agente_ia"));
    }

    /// Fluxo completo com banco: prévia, recusas, token só com confirmar, auditoria, limite de 10 e lista.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn agente_cria_agente_com_limites() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let marca = Uuid::new_v4().to_string()[..8].to_string();
        let mut sup = agente_com(&[]);
        sup.role = OperatorRole::Supervisor;
        sup.origem = Origem::Tela;
        sup.display_name = format!("sup-{marca}");

        // o agente criador é criado pelo supervisor, com Gestão de Operadores e dois módulos
        let nome_criador = format!("criador-{marca}");
        let c = criar(
            &pool,
            &sup,
            NovoAgente {
                nome: nome_criador.clone(),
                modulos: pedido(&[("hub_operadores", "editar"), ("vendas", "editar"), ("producao", "ver")]),
                confirmar: true,
            },
        )
        .await
        .unwrap();
        let id_criador = c.resultado["id"].as_str().unwrap().to_string();
        let token_criador = c.resultado["token"].as_str().unwrap().to_string();
        let ctx = resolver_token(&pool, &token_criador).await.unwrap().unwrap();
        assert_eq!(ctx.origem, Origem::Agente);

        let novo = |nome: &str, mods: &[(&str, &str)], confirmar| NovoAgente { nome: nome.into(), modulos: pedido(mods), confirmar };
        let nome1 = format!("filho-{marca}-1");

        // prévia: sem token e sem gravar
        let p = criar_por_agente(&pool, &ctx, novo(&nome1, &[("vendas", "ver")], false)).await.unwrap();
        assert!(p.previa && p.resultado["token"].is_null());
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hub_operators WHERE display_name = $1").bind(&nome1).fetch_one(&pool).await.unwrap();
        assert_eq!(n, 0);

        // recusas: módulo que não tem, nível maior, vedados
        for ruim in [&[("compras_mp", "ver")][..], &[("producao", "editar")], &[("hub_operadores", "ver")], &[("hub_settings", "ver")]] {
            let e = criar_por_agente(&pool, &ctx, novo(&format!("ruim-{marca}"), ruim, true)).await.unwrap_err();
            assert_eq!(e.status, axum::http::StatusCode::UNPROCESSABLE_ENTITY, "{ruim:?}");
        }
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hub_operators WHERE display_name = $1").bind(format!("ruim-{marca}")).fetch_one(&pool).await.unwrap();
        assert_eq!(n, 0);

        // confirmar: grava, devolve o token e audita o criador
        let f = criar_por_agente(&pool, &ctx, novo(&nome1, &[("vendas", "ver"), ("producao", "ver")], true)).await.unwrap();
        let token_filho = f.resultado["token"].as_str().unwrap().to_string();
        let id_filho = f.resultado["id"].as_str().unwrap().to_string();
        let filho = resolver_token(&pool, &token_filho).await.unwrap().unwrap();
        assert_eq!(filho.origem, Origem::Agente);
        assert!(!filho.has_module("hub_operadores") && !filho.has_module("hub_settings"));
        let (actor, depois): (String, Value) = sqlx::query_as(
            "SELECT actor_id, after_json FROM hub_audit_events WHERE action = 'criar_agente_por_agente' AND entity_id = $1",
        )
        .bind(&id_filho)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(actor, id_criador);
        assert_eq!(depois["criadoPor"], nome_criador.as_str());
        assert_eq!(depois["origem"], "agente");
        assert_eq!(depois["modulos"]["vendas"], "ver");

        // lista: só o prefixo do token
        let lista = listar_criados(&pool, &ctx).await.unwrap();
        assert_eq!(lista.len(), 1);
        assert_eq!(lista[0].nome, nome1);
        assert!(lista[0].tokens[0].prefixo.len() < token_filho.len());

        // limite: 10 ativos
        for i in 2..=10 {
            criar_por_agente(&pool, &ctx, novo(&format!("filho-{marca}-{i}"), &[("vendas", "ver")], true)).await.unwrap();
        }
        let e = criar_por_agente(&pool, &ctx, novo(&format!("filho-{marca}-11"), &[("vendas", "ver")], true)).await.unwrap_err();
        assert!(e.mensagem.contains("limite"), "{}", e.mensagem);
        // revogar um libera uma vaga (o limite conta só os ativos)
        revogar(&pool, &sup, &id_filho, true).await.unwrap();
        criar_por_agente(&pool, &ctx, novo(&format!("filho-{marca}-11"), &[("vendas", "ver")], true)).await.unwrap();
        assert_eq!(listar_criados(&pool, &ctx).await.unwrap().len(), 11, "a lista mostra também os revogados");

        // limpeza
        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM hub_operators WHERE display_name LIKE $1 OR id = $2")
            .bind(format!("filho-{marca}-%"))
            .bind(&id_criador)
            .fetch_all(&pool)
            .await
            .unwrap();
        for id in &ids {
            for sql in [
                "DELETE FROM hub_agent_tokens WHERE operator_id = $1",
                "DELETE FROM hub_operator_modules WHERE operator_id = $1",
                "DELETE FROM hub_audit_events WHERE entity_id = $1",
                "DELETE FROM hub_operators WHERE id = $1",
            ] {
                sqlx::query(sql).bind(id).execute(&pool).await.unwrap();
            }
        }
    }

    #[test]
    fn catalogo_traz_as_acoes_de_gestao_dos_criados() {
        use crate::modules::geral::auth::store::{has_read_access, has_write_access};
        let a = acoes();
        for nome in ["trocar_token_agente_criado", "ajustar_modulos_agente_criado", "revogar_agente_criado"] {
            let x = a.iter().find(|x| x.nome == nome).unwrap_or_else(|| panic!("{nome}"));
            assert!(x.escrita && x.dois_passos && !x.exclui && x.descricao.len() >= 90, "{nome}");
            assert!(!crate::core::catalogo::e_exclusao(x.metodo, &x.caminho.replace(":id", "abc")), "{nome} não é exclusão");
        }
        let ok = criador(&[("hub_operadores", "edit")]);
        let ver = criador(&[("hub_operadores", "view")]);
        for rota in ["token", "modulos", "revogar"] {
            let caminho = format!("/api/agentes/criados/abc/{rota}");
            assert!(has_write_access(&ok, &caminho, "POST"), "{rota}");
            assert!(!has_write_access(&ver, &caminho, "POST"), "{rota}");
        }
        assert!(has_read_access(&ver, "/api/agentes/criados", "GET"));
    }

    /// Gestão dos criados com banco: dono, token, módulos, revogação, limite e auditoria.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn agente_gerencia_so_os_agentes_que_criou() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let marca = Uuid::new_v4().to_string()[..8].to_string();
        let mut sup = agente_com(&[]);
        sup.role = OperatorRole::Supervisor;
        sup.origem = Origem::Tela;
        sup.display_name = format!("sup-{marca}");
        let novo = |nome: String, mods: &[(&str, &str)]| NovoAgente { nome, modulos: pedido(mods), confirmar: true };

        let ger = criar(&pool, &sup, novo(format!("ger-{marca}"), &[("hub_operadores", "editar"), ("vendas", "editar"), ("producao", "ver")])).await.unwrap();
        let id_ger = ger.resultado["id"].as_str().unwrap().to_string();
        let ctx = resolver_token(&pool, ger.resultado["token"].as_str().unwrap()).await.unwrap().unwrap();
        // outro agente (criado pelo supervisor) e um agente só com ver em Gestão
        let outro = criar(&pool, &sup, novo(format!("outro-{marca}"), &[("vendas", "ver")])).await.unwrap();
        let id_outro = outro.resultado["id"].as_str().unwrap().to_string();
        let leitor = criar(&pool, &sup, novo(format!("leitor-{marca}"), &[("hub_operadores", "ver")])).await.unwrap();
        let id_leitor = leitor.resultado["id"].as_str().unwrap().to_string();
        let ctx_leitor = resolver_token(&pool, leitor.resultado["token"].as_str().unwrap()).await.unwrap().unwrap();

        let filho = criar_por_agente(&pool, &ctx, novo(format!("filho-{marca}"), &[("vendas", "ver"), ("producao", "ver")])).await.unwrap();
        let id_filho = filho.resultado["id"].as_str().unwrap().to_string();
        let token0 = filho.resultado["token"].as_str().unwrap().to_string();

        // sem Gestão em editar: 403; operador: 400
        assert_eq!(trocar_token_criado(&pool, &ctx_leitor, &id_filho, true).await.unwrap_err().status, axum::http::StatusCode::FORBIDDEN);
        assert_eq!(revogar_criado(&pool, &ctx_leitor, &id_filho, true).await.unwrap_err().status, axum::http::StatusCode::FORBIDDEN);
        assert_eq!(trocar_token_criado(&pool, &sup, &id_filho, true).await.unwrap_err().status, axum::http::StatusCode::BAD_REQUEST);
        // não é dele: o do supervisor, ele mesmo
        for alvo in [&id_outro, &id_ger] {
            assert_eq!(trocar_token_criado(&pool, &ctx, alvo, true).await.unwrap_err().status, axum::http::StatusCode::FORBIDDEN);
            assert_eq!(revogar_criado(&pool, &ctx, alvo, true).await.unwrap_err().status, axum::http::StatusCode::FORBIDDEN);
            let e = ajustar_modulos_criado(&pool, &ctx, alvo, AjusteModulos { modulos: pedido(&[("vendas", "ver")]), confirmar: true }).await.unwrap_err();
            assert_eq!(e.status, axum::http::StatusCode::FORBIDDEN);
        }

        // troca de token: prévia não mexe; confirmar revoga o velho e o novo funciona
        let p = trocar_token_criado(&pool, &ctx, &id_filho, false).await.unwrap();
        assert!(p.previa && p.resultado["token"].is_null());
        assert!(resolver_token(&pool, &token0).await.unwrap().is_some());
        let t = trocar_token_criado(&pool, &ctx, &id_filho, true).await.unwrap();
        let token1 = t.resultado["token"].as_str().unwrap().to_string();
        assert!(resolver_token(&pool, &token0).await.unwrap().is_none());
        assert!(resolver_token(&pool, &token1).await.unwrap().is_some());
        // a autoria continua certa depois da troca
        assert_eq!(listar_criados(&pool, &ctx).await.unwrap().len(), 1);

        // módulos: recusas não gravam
        let mods_do_filho = || async {
            sqlx::query_as::<_, (String, String)>("SELECT module_key, access_level FROM hub_operator_modules WHERE operator_id = $1 ORDER BY module_key")
                .bind(&id_filho)
                .fetch_all(&pool)
                .await
                .unwrap()
        };
        let antes = mods_do_filho().await;
        for ruim in [&[("compras_mp", "ver")][..], &[("producao", "editar")], &[("hub_operadores", "ver")], &[("hub_settings", "ver")], &[]] {
            let e = ajustar_modulos_criado(&pool, &ctx, &id_filho, AjusteModulos { modulos: pedido(ruim), confirmar: true }).await.unwrap_err();
            assert!(e.status == axum::http::StatusCode::UNPROCESSABLE_ENTITY || e.status == axum::http::StatusCode::BAD_REQUEST, "{ruim:?}");
        }
        assert_eq!(mods_do_filho().await, antes);
        // prévia mostra antes e depois sem gravar; confirmar grava o subconjunto
        let p = ajustar_modulos_criado(&pool, &ctx, &id_filho, AjusteModulos { modulos: pedido(&[("vendas", "editar")]), confirmar: false }).await.unwrap();
        assert!(p.previa && p.resultado["antes"]["producao"] == "ver" && p.resultado["depois"]["vendas"] == "editar");
        assert_eq!(mods_do_filho().await, antes);
        ajustar_modulos_criado(&pool, &ctx, &id_filho, AjusteModulos { modulos: pedido(&[("vendas", "editar")]), confirmar: true }).await.unwrap();
        assert_eq!(mods_do_filho().await, vec![("vendas".to_string(), "edit".to_string())]);

        // revogar: derruba o token; reativar respeita o limite
        revogar_criado(&pool, &ctx, &id_filho, true).await.unwrap();
        assert!(resolver_token(&pool, &token1).await.unwrap().is_none());
        for i in 1..=10 {
            criar_por_agente(&pool, &ctx, novo(format!("enche-{marca}-{i}"), &[("vendas", "ver")])).await.unwrap();
        }
        let e = trocar_token_criado(&pool, &ctx, &id_filho, true).await.unwrap_err();
        assert!(e.mensagem.contains("máximo"), "{}", e.mensagem);

        // auditoria com o criador e sem token
        for acao in ["trocar_token_agente", "ajustar_modulos_agente", "revogar_agente"] {
            let (actor, depois): (String, String) =
                sqlx::query_as("SELECT actor_id, after_json::text FROM hub_audit_events WHERE action = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT 1")
                    .bind(acao)
                    .bind(&id_filho)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(actor, id_ger, "{acao}");
            assert!(depois.contains(&format!("ger-{marca}")) && depois.contains("agente") && !depois.contains("nxa_"), "{acao}: {depois}");
        }

        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM hub_operators WHERE display_name LIKE $1 OR display_name LIKE $2 OR id = ANY($3)")
            .bind(format!("enche-{marca}-%"))
            .bind(format!("filho-{marca}"))
            .bind(vec![id_ger.clone(), id_outro, id_leitor])
            .fetch_all(&pool)
            .await
            .unwrap();
        for id in &ids {
            for sql in [
                "DELETE FROM hub_agent_tokens WHERE operator_id = $1",
                "DELETE FROM hub_operator_modules WHERE operator_id = $1",
                "DELETE FROM hub_audit_events WHERE entity_id = $1",
                "DELETE FROM hub_operators WHERE id = $1",
            ] {
                sqlx::query(sql).bind(id).execute(&pool).await.unwrap();
            }
        }
    }
}
