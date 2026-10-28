//! Escritas do Almoxarifado, Equipamentos e Manutenções como serviços reutilizáveis (tela e agentes de IA).
//!
//! Regra fixa do AGENTS.md: toda escrita é em 2 passos (sem `confirmar` roda a gravação numa transação e desfaz,
//! devolvendo a prévia; com `confirmar` grava) e toda gravação confirmada fica na auditoria com o autor.
//! O handler só valida permissão e chama estas funções; a regra de negócio continua em `store`.

use futures_util::future::BoxFuture;
use serde_json::{json, Value};
use sqlx::{PgConnection, PgPool};

use crate::core::acao::ErroApi;
use crate::modules::estoque::escrita::{gravar_auditado, Resp};

use super::models::*;
use super::store;

/// Garante as tabelas (DDL fora da transação do 2 passos) e roda `f` com prévia e auditoria. Os erros do `store`
/// (texto) viram 400, como as rotas já devolviam.
async fn gravar<F>(
    pool: &PgPool,
    acao: &'static str,
    autor: &str,
    alvo: &str,
    entrada: Value,
    confirmar: bool,
    f: F,
) -> Resp
where
    F: for<'c> FnOnce(&'c mut PgConnection) -> BoxFuture<'c, Result<Value, String>> + Send + 'static,
{
    store::ensure_tables(pool).await.map_err(ErroApi::interno)?;
    gravar_auditado(pool, acao, autor, alvo, entrada, confirmar, move |c| {
        Box::pin(async move { f(c).await.map_err(ErroApi::invalido) })
    })
    .await
}

// ---------------------------------------------------------------- Itens e famílias

pub async fn criar_item_local(pool: &PgPool, req: CreateLocalItemRequest, autor: &str, confirmar: bool) -> Resp {
    let alvo = req.description.trim().to_string();
    let entrada = json!({ "section": req.section, "description": req.description });
    gravar(pool, "criar_item_local_almox", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let item = store::create_local_item(c, &req).await?;
            Ok(json!({ "item": item }))
        })
    })
    .await
}

pub async fn salvar_config_item(
    pool: &PgPool,
    code: String,
    req: UpsertItemConfigRequest,
    autor: &str,
    confirmar: bool,
) -> Resp {
    let entrada = json!({ "section": req.section });
    let alvo = code.clone();
    gravar(pool, "salvar_config_item_almox", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let item = store::upsert_item_config(c, &code, &req).await?;
            Ok(json!({ "item": item }))
        })
    })
    .await
}

/// Apaga o item do almoxarifado (mesmo comportamento de antes), agora com prévia e auditoria.
pub async fn excluir_item(pool: &PgPool, code: String, autor: &str, confirmar: bool) -> Resp {
    let alvo = code.clone();
    gravar(pool, "excluir_item_almox", autor, &alvo, json!({ "code": code }), confirmar, move |c| {
        Box::pin(async move {
            store::delete_item(c, &code).await?;
            Ok(json!({ "excluido": code }))
        })
    })
    .await
}

pub async fn salvar_familia(pool: &PgPool, fam: AlmoxFamilia, autor: &str, confirmar: bool) -> Resp {
    let alvo = fam.id.clone();
    let entrada = json!({ "id": fam.id, "label": fam.label });
    gravar(pool, "salvar_familia_almox", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let familia = store::upsert_familia(c, &fam).await?;
            Ok(json!({ "familia": familia }))
        })
    })
    .await
}

pub async fn excluir_familia(pool: &PgPool, id: String, autor: &str, confirmar: bool) -> Resp {
    let alvo = id.clone();
    gravar(pool, "excluir_familia_almox", autor, &alvo, json!({ "id": id }), confirmar, move |c| {
        Box::pin(async move {
            store::delete_familia(c, &id).await?;
            Ok(json!({ "excluida": id, "itensMovidosPara": "outros" }))
        })
    })
    .await
}

// ---------------------------------------------------------------- Movimentos e contagem

/// Entrada, saída ou ajuste de saldo. `permitir_negativo` já vem decidido pelo handler (só supervisor).
pub async fn lancar_movimento(
    pool: &PgPool,
    req: CreateMovementRequest,
    permitir_negativo: bool,
    operador: String,
    autor: &str,
    confirmar: bool,
) -> Resp {
    let alvo = req.item_code.trim().to_string();
    let entrada = json!({
        "itemCode": req.item_code,
        "movementType": req.movement_type,
        "quantity": req.quantity,
        "reason": req.reason,
    });
    gravar(pool, "lancar_movimento_almox", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let mv = store::create_movement(c, Some(&operador), &req, permitir_negativo, None).await?;
            Ok(json!({ "movement": mv }))
        })
    })
    .await
}

/// Contagem de estoque: ajusta o saldo dos itens contados. A prévia mostra quantas entradas/saídas sairiam.
pub async fn aplicar_contagem(pool: &PgPool, req: StockCountRequest, operador: String, autor: &str, confirmar: bool) -> Resp {
    let entrada = json!({ "itens": req.lines.len() });
    gravar(pool, "aplicar_contagem_almox", autor, "contagem", entrada, confirmar, move |c| {
        Box::pin(async move {
            let r = store::apply_stock_count(c, Some(&operador), &req).await?;
            Ok(serde_json::to_value(&r).unwrap_or(Value::Null))
        })
    })
    .await
}

// ---------------------------------------------------------------- Demandas de compra

pub async fn criar_demanda(pool: &PgPool, req: CreateDemandRequest, operador: String, autor: &str, confirmar: bool) -> Resp {
    let alvo = req.title.clone().unwrap_or_default();
    let entrada = json!({ "title": req.title, "itens": req.items.len() });
    gravar(pool, "criar_demanda_almox", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let d = store::create_demand(c, Some(&operador), &req).await?;
            Ok(json!({ "demand": d }))
        })
    })
    .await
}

pub async fn criar_demanda_do_minimo(pool: &PgPool, operador: String, autor: &str, confirmar: bool) -> Resp {
    gravar(pool, "criar_demanda_do_minimo_almox", autor, "reposicao", json!({}), confirmar, move |c| {
        Box::pin(async move {
            let d = store::create_demands_from_replenishment(c, Some(&operador)).await?;
            Ok(json!({ "demand": d }))
        })
    })
    .await
}

// ---------------------------------------------------------------- Equipamentos, manutenções e fotos

pub async fn salvar_equipamento(
    pool: &PgPool,
    acao: &'static str,
    id: Option<String>,
    req: UpsertEquipmentRequest,
    autor: &str,
    confirmar: bool,
) -> Resp {
    let alvo = id.clone().unwrap_or_else(|| req.code.clone());
    let entrada = json!({ "code": req.code, "name": req.name });
    gravar(pool, acao, autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let e = store::upsert_equipment(c, id.as_deref(), &req).await?;
            Ok(json!({ "equipment": e }))
        })
    })
    .await
}

pub async fn criar_manutencao(pool: &PgPool, req: CreateMaintenanceRequest, operador: String, autor: &str, confirmar: bool) -> Resp {
    let alvo = req.equipment_id.clone().unwrap_or_default();
    let entrada = json!({ "equipmentId": req.equipment_id, "kind": req.kind });
    gravar(pool, "criar_manutencao_almox", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let m = store::create_maintenance(c, Some(&operador), &req).await?;
            Ok(json!({ "maintenance": m }))
        })
    })
    .await
}

pub async fn atualizar_manutencao(pool: &PgPool, id: String, req: UpdateMaintenanceRequest, autor: &str, confirmar: bool) -> Resp {
    let alvo = id.clone();
    gravar(pool, "atualizar_manutencao_almox", autor, &alvo, json!({ "id": id, "status": req.status }), confirmar, move |c| {
        Box::pin(async move {
            let m = store::update_maintenance(c, &id, &req).await?;
            Ok(json!({ "maintenance": m }))
        })
    })
    .await
}

pub async fn adicionar_foto(
    pool: &PgPool,
    tipo: String,
    entidade: String,
    req: AddFotoRequest,
    autor: &str,
    confirmar: bool,
) -> Resp {
    let alvo = format!("{tipo}/{entidade}");
    let entrada = json!({ "entityType": tipo, "entityId": entidade, "bytes": req.photo_data.len() });
    gravar(pool, "adicionar_foto_almox", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let foto = store::add_foto(c, &tipo, &entidade, &req.photo_data, req.notes.as_deref()).await?;
            Ok(json!({ "foto": foto }))
        })
    })
    .await
}

pub async fn excluir_foto(pool: &PgPool, id: String, autor: &str, confirmar: bool) -> Resp {
    let alvo = id.clone();
    gravar(pool, "excluir_foto_almox", autor, &alvo, json!({ "id": id }), confirmar, move |c| {
        Box::pin(async move {
            store::delete_foto(c, &id).await?;
            Ok(json!({ "excluida": id }))
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn movimento_almox_so_grava_com_confirmar_e_audita() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let code = "ZZ-R4B-ALMOX";
        store::ensure_tables(&pool).await.unwrap();
        let limpar = || async {
            for t in ["almox_movements", "almox_balances", "almox_item_config"] {
                sqlx::query(&format!("DELETE FROM {t} WHERE item_code = $1")).bind(code).execute(&pool).await.unwrap();
            }
            sqlx::query("DELETE FROM items WHERE code = $1").bind(code).execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM producao_auditoria WHERE usuario = 'Teste R4b'").execute(&pool).await.unwrap();
        };
        limpar().await;
        sqlx::query("INSERT INTO items (code, description, unit) VALUES ($1, 'Item de teste R4b', 'UN')")
            .bind(code)
            .execute(&pool)
            .await
            .unwrap();
        let movimentos = || async {
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM almox_movements WHERE item_code = $1").bind(code).fetch_one(&pool).await.unwrap()
        };
        let auditorias = || async {
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM producao_auditoria WHERE usuario = 'Teste R4b' AND acao = 'lancar_movimento_almox'")
                .fetch_one(&pool)
                .await
                .unwrap()
        };
        let pedido = || CreateMovementRequest {
            item_code: code.into(),
            movement_type: "entrada".into(),
            quantity: 5.0,
            unit_cost: None,
            reason: Some("teste".into()),
            document_ref: None,
            occurred_at: None,
            allow_negative: None,
            sector: None,
            variant_label: None,
            pack_label: None,
            pack_count: None,
            content_per_pack: None,
            total_paid: None,
        };

        let r = lancar_movimento(&pool, pedido(), false, "op-teste".into(), "Teste R4b", false).await.unwrap();
        assert!(r.previa);
        assert_eq!(r.resultado["movement"]["quantity"], 5.0);
        assert_eq!(movimentos().await, 0, "a prévia não grava o movimento");
        let saldo: Option<f64> = sqlx::query_scalar("SELECT qty_on_hand FROM almox_balances WHERE item_code = $1")
            .bind(code)
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert_eq!(saldo, None, "a prévia não cria nem altera o saldo");
        assert_eq!(auditorias().await, 0);

        let r = lancar_movimento(&pool, pedido(), false, "op-teste".into(), "Teste R4b", true).await.unwrap();
        assert!(!r.previa);
        assert_eq!(movimentos().await, 1);
        assert_eq!(auditorias().await, 1);
        let saldo: f64 = sqlx::query_scalar("SELECT qty_on_hand FROM almox_balances WHERE item_code = $1").bind(code).fetch_one(&pool).await.unwrap();
        assert_eq!(saldo, 5.0);

        // saída maior que o saldo: regra violada, nada gravado
        let mut saida = pedido();
        saida.movement_type = "saida".into();
        saida.quantity = 50.0;
        let e = lancar_movimento(&pool, saida, false, "op-teste".into(), "Teste R4b", true).await.unwrap_err();
        assert_eq!(e.codigo, "invalido");
        assert_eq!(movimentos().await, 1);
        limpar().await;
    }
}
