use sqlx::postgres::PgPool;
use sqlx::Row;
use std::collections::{HashMap, HashSet};

use crate::core::pg_row::{pg_i64, pg_opt_i32, pg_opt_i64};
use crate::models::{BulkOverrideRequest, LineConfig, ProductOverride};

pub struct Db {
    pool: PgPool,
}

impl Db {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub async fn get_line_configs(&self) -> Result<Vec<LineConfig>, String> {
        let rows = sqlx::query(
            "SELECT linha_prefix, nome_linha, estoque_ideal_mult, abrir_ordem_mult, abrir_prod_mult, fator_seguranca_z, visivel FROM config_linhas",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows
            .into_iter()
            .map(|row| LineConfig {
                linha_prefix: row.get(0),
                nome_linha: row.get(1),
                estoque_ideal_mult: row.get(2),
                abrir_ordem_mult: row.get(3),
                abrir_prod_mult: row.get(4),
                fator_seguranca_z: row.get(5),
                visivel: pg_opt_i32(&row, 6),
            })
            .collect())
    }

    pub async fn update_line_config(&self, config: &LineConfig) -> Result<(), String> {
        let vis = config.visivel.unwrap_or(1);
        sqlx::query(
            "INSERT INTO config_linhas (linha_prefix, nome_linha, estoque_ideal_mult, abrir_ordem_mult, abrir_prod_mult, fator_seguranca_z, visivel)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT(linha_prefix) DO UPDATE SET
                nome_linha = EXCLUDED.nome_linha,
                estoque_ideal_mult = EXCLUDED.estoque_ideal_mult,
                abrir_ordem_mult = EXCLUDED.abrir_ordem_mult,
                abrir_prod_mult = EXCLUDED.abrir_prod_mult,
                fator_seguranca_z = EXCLUDED.fator_seguranca_z,
                visivel = EXCLUDED.visivel",
        )
        .bind(&config.linha_prefix)
        .bind(&config.nome_linha)
        .bind(config.estoque_ideal_mult)
        .bind(config.abrir_ordem_mult)
        .bind(config.abrir_prod_mult)
        .bind(config.fator_seguranca_z)
        .bind(vis)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn delete_line_config(&self, prefix: &str) -> Result<(), String> {
        let mut tx = self.pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::query("UPDATE produtos SET linha_prefix = 'DEFAULT' WHERE linha_prefix = $1")
            .bind(prefix)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("UPDATE overrides_produtos SET linha_prefix_manual = 'DEFAULT' WHERE linha_prefix_manual = $1")
            .bind(prefix)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM config_linhas WHERE linha_prefix = $1")
            .bind(prefix)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    fn map_product_override(row: &sqlx::postgres::PgRow) -> ProductOverride {
        ProductOverride {
            codigo: row.get(0),
            estoque_ideal_manual: pg_opt_i64(row, 1),
            pedidos_manual: pg_opt_i64(row, 2),
            media_manual: row.get(3),
            is_lancamento_manual: pg_opt_i32(row, 4),
            visivel: pg_opt_i32(row, 5),
            observacao: row.get(6),
            linha_prefix_manual: row.get(7),
            status_produto: row.get(8),
            categoria_produto: row.get(9),
            produzir_apenas_kit: pg_opt_i32(row, 10),
            lancamento_meta_meses: pg_opt_i64(row, 11),
            lancamento_data_inicio: row.get(12),
            base_codigo: None,
            terceirizado_modo: row.get(13),
        }
    }

    pub async fn get_override(&self, codigo: &str) -> Result<Option<ProductOverride>, String> {
        let row = sqlx::query(
            "SELECT codigo, estoque_ideal_manual, pedidos_manual, media_manual, is_lancamento_manual, visivel, observacao, linha_prefix_manual, status_produto, categoria_produto, produzir_apenas_kit, lancamento_meta_meses, lancamento_data_inicio, terceirizado_modo
             FROM overrides_produtos WHERE codigo = $1",
        )
        .bind(codigo)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(row.map(|r| Self::map_product_override(&r)))
    }

    pub async fn get_all_overrides(&self) -> Result<Vec<ProductOverride>, String> {
        let rows = sqlx::query(
            "SELECT codigo, estoque_ideal_manual, pedidos_manual, media_manual, is_lancamento_manual, visivel, observacao, linha_prefix_manual, status_produto, categoria_produto, produzir_apenas_kit, lancamento_meta_meses, lancamento_data_inicio, terceirizado_modo
             FROM overrides_produtos",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(Self::map_product_override).collect())
    }

    pub async fn save_override(&self, ovr: &ProductOverride) -> Result<(), String> {
        if ovr.estoque_ideal_manual.is_none()
            && ovr.pedidos_manual.is_none()
            && ovr.media_manual.is_none()
            && ovr.is_lancamento_manual.is_none()
            && ovr.visivel.is_none()
            && ovr.observacao.is_none()
            && ovr.linha_prefix_manual.is_none()
            && (ovr.status_produto.is_none() || ovr.status_produto.as_deref() == Some("ativo"))
            && ovr.categoria_produto.is_none()
            && (ovr.produzir_apenas_kit.is_none() || ovr.produzir_apenas_kit == Some(0))
            && (ovr.lancamento_meta_meses.is_none() || ovr.lancamento_meta_meses == Some(6))
            && ovr.lancamento_data_inicio.is_none()
            && ovr.terceirizado_modo.is_none()
            && ovr.base_codigo.is_none()
        {
            sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1")
                .bind(&ovr.codigo)
                .execute(&self.pool)
                .await
                .map_err(|e| e.to_string())?;
        } else {
            sqlx::query(
                "INSERT INTO overrides_produtos (codigo, estoque_ideal_manual, pedidos_manual, media_manual, is_lancamento_manual, visivel, observacao, linha_prefix_manual, status_produto, categoria_produto, produzir_apenas_kit, lancamento_meta_meses, lancamento_data_inicio, terceirizado_modo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                 ON CONFLICT(codigo) DO UPDATE SET
                    estoque_ideal_manual = EXCLUDED.estoque_ideal_manual,
                    pedidos_manual = EXCLUDED.pedidos_manual,
                    media_manual = EXCLUDED.media_manual,
                    is_lancamento_manual = EXCLUDED.is_lancamento_manual,
                    visivel = EXCLUDED.visivel,
                    observacao = EXCLUDED.observacao,
                    linha_prefix_manual = EXCLUDED.linha_prefix_manual,
                    status_produto = EXCLUDED.status_produto,
                    categoria_produto = EXCLUDED.categoria_produto,
                    produzir_apenas_kit = EXCLUDED.produzir_apenas_kit,
                    lancamento_meta_meses = EXCLUDED.lancamento_meta_meses,
                    lancamento_data_inicio = EXCLUDED.lancamento_data_inicio,
                    terceirizado_modo = EXCLUDED.terceirizado_modo",
            )
            .bind(&ovr.codigo)
            .bind(ovr.estoque_ideal_manual)
            .bind(ovr.pedidos_manual)
            .bind(ovr.media_manual)
            .bind(ovr.is_lancamento_manual)
            .bind(ovr.visivel)
            .bind(&ovr.observacao)
            .bind(&ovr.linha_prefix_manual)
            .bind(&ovr.status_produto)
            .bind(&ovr.categoria_produto)
            .bind(ovr.produzir_apenas_kit)
            .bind(ovr.lancamento_meta_meses)
            .bind(&ovr.lancamento_data_inicio)
            .bind(&ovr.terceirizado_modo)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        }

        if let Some(ref bc) = ovr.base_codigo {
            let trimmed = bc.trim();
            if trimmed.is_empty() {
                sqlx::query("UPDATE produtos SET base_codigo = NULL WHERE codigo = $1")
                    .bind(&ovr.codigo)
                    .execute(&self.pool)
                    .await
                    .map_err(|e| e.to_string())?;
            } else {
                sqlx::query("UPDATE produtos SET base_codigo = $2 WHERE codigo = $1")
                    .bind(&ovr.codigo)
                    .bind(trimmed)
                    .execute(&self.pool)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    pub async fn save_override_bulk(&self, req: &BulkOverrideRequest) -> Result<(), String> {
        let mut tx = self.pool.begin().await.map_err(|e| e.to_string())?;

        for codigo in &req.codigos {
            sqlx::query(
                "INSERT INTO overrides_produtos (codigo) VALUES ($1) ON CONFLICT (codigo) DO NOTHING",
            )
            .bind(codigo)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            match req.action.as_str() {
                "hide" => {
                    sqlx::query("UPDATE overrides_produtos SET visivel = 0 WHERE codigo = $1")
                        .bind(codigo)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "show" => {
                    sqlx::query("UPDATE overrides_produtos SET visivel = 1 WHERE codigo = $1")
                        .bind(codigo)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "set_launch_auto" => {
                    sqlx::query("UPDATE overrides_produtos SET is_lancamento_manual = NULL WHERE codigo = $1")
                        .bind(codigo)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "set_launch_yes" => {
                    sqlx::query("UPDATE overrides_produtos SET is_lancamento_manual = 1 WHERE codigo = $1")
                        .bind(codigo)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "set_launch_no" => {
                    sqlx::query("UPDATE overrides_produtos SET is_lancamento_manual = 0 WHERE codigo = $1")
                        .bind(codigo)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "set_obs" => {
                    let obs = req.value_str.as_ref().filter(|s| !s.trim().is_empty());
                    sqlx::query("UPDATE overrides_produtos SET observacao = $2 WHERE codigo = $1")
                        .bind(codigo)
                        .bind(obs)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "set_line" => {
                    let line = req.value_str.as_ref().filter(|s| s.as_str() != "AUTO");
                    sqlx::query("UPDATE overrides_produtos SET linha_prefix_manual = $2 WHERE codigo = $1")
                        .bind(codigo)
                        .bind(line)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "set_status" => {
                    let status = req.value_str.as_ref().filter(|s| !s.trim().is_empty());
                    sqlx::query("UPDATE overrides_produtos SET status_produto = $2 WHERE codigo = $1")
                        .bind(codigo)
                        .bind(status)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "set_category" => {
                    let cat = req
                        .value_str
                        .as_ref()
                        .filter(|s| !s.trim().is_empty() && s.as_str() != "AUTO");
                    sqlx::query("UPDATE overrides_produtos SET categoria_produto = $2 WHERE codigo = $1")
                        .bind(codigo)
                        .bind(cat)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "clear" => {
                    sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1")
                        .bind(codigo)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                _ => {}
            }

            sqlx::query(
                "DELETE FROM overrides_produtos
                 WHERE codigo = $1
                   AND estoque_ideal_manual IS NULL
                   AND pedidos_manual IS NULL
                   AND media_manual IS NULL
                   AND is_lancamento_manual IS NULL
                   AND (visivel IS NULL OR visivel = 1)
                   AND observacao IS NULL
                   AND linha_prefix_manual IS NULL
                   AND (status_produto IS NULL OR status_produto = 'ativo')
                   AND categoria_produto IS NULL
                   AND (produzir_apenas_kit IS NULL OR produzir_apenas_kit = 0)
                   AND (lancamento_meta_meses IS NULL OR lancamento_meta_meses = 6)
                   AND lancamento_data_inicio IS NULL",
            )
            .bind(codigo)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }

        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let row = sqlx::query("SELECT value FROM settings WHERE key = $1")
            .bind(key)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        Ok(row.map(|r| r.get(0)))
    }

    pub async fn save_setting(&self, key: &str, value: &str) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn get_kit_composition(&self) -> Result<HashMap<String, Vec<(String, i64)>>, String> {
        let rows = sqlx::query(
            "SELECT kit_codigo, componente_codigo, COALESCE(quantidade, 1) FROM kit_composicao",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut map: HashMap<String, Vec<(String, i64)>> = HashMap::new();
        for row in rows {
            let kit: String = row.get(0);
            let comp: String = row.get(1);
            let qty = pg_i64(&row, 2);
            map.entry(kit).or_default().push((comp, qty));
        }
        Ok(map)
    }

    pub async fn add_producao_entry(
        &self,
        entry: &crate::models::NewProducaoEntry,
    ) -> Result<i64, String> {
        let mut tx = self.pool.begin().await.map_err(|e| e.to_string())?;

        let insert_id_i32: i32 = sqlx::query_scalar(
            "INSERT INTO historico_producao (data_producao, codigo, quantidade, observacoes,
             snap_estoque, snap_producao, snap_pedidos, snap_efp, snap_media_vendas,
             snap_duracao_meses, snap_status, snap_status_label, snap_producao_recomendada,
             snap_estoque_ideal_qtd, snap_demanda_ajustada, consume_base, base_code, lote_erp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             RETURNING id",
        )
        .bind(&entry.data_producao)
        .bind(&entry.codigo)
        .bind(entry.quantidade)
        .bind(&entry.observacoes)
        .bind(entry.snap_estoque)
        .bind(entry.snap_producao)
        .bind(entry.snap_pedidos)
        .bind(entry.snap_efp)
        .bind(entry.snap_media_vendas)
        .bind(entry.snap_duracao_meses)
        .bind(&entry.snap_status)
        .bind(&entry.snap_status_label)
        .bind(entry.snap_producao_recomendada)
        .bind(entry.snap_estoque_ideal_qtd)
        .bind(entry.snap_demanda_ajustada)
        .bind(if entry.consume_base.unwrap_or(false) {
            1
        } else {
            0
        })
        .bind(&entry.base_code)
        .bind(&entry.lote_erp)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        let insert_id = insert_id_i32 as i64;

        sqlx::query(
            "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
             VALUES ($1, 0, 0, 0, NULL)
             ON CONFLICT (codigo) DO NOTHING",
        )
        .bind(&entry.codigo)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE estoque_atual SET producao = producao + $1 WHERE codigo = $2")
            .bind(entry.quantidade)
            .bind(&entry.codigo)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        if entry.consume_base.unwrap_or(false) {
            if let Some(ref b_code) = entry.base_code {
                sqlx::query(
                    "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
                     VALUES ($1, 0, 0, 0, NULL)
                     ON CONFLICT (codigo) DO NOTHING",
                )
                .bind(b_code)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
                sqlx::query(
                    "UPDATE estoque_atual SET estoque = MAX(0, estoque - $1) WHERE codigo = $2",
                )
                .bind(entry.quantidade)
                .bind(b_code)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            }
        }

        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(insert_id)
    }

    pub async fn delete_producao_entry(&self, id: i64) -> Result<(), String> {
        let mut tx = self.pool.begin().await.map_err(|e| e.to_string())?;

        let record = sqlx::query(
            "SELECT codigo, quantidade, consume_base, base_code FROM historico_producao WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(row) = record {
            let codigo: String = row.get(0);
            let qty = pg_i64(&row, 1);
            let consume_base: Option<i32> = row.get(2);
            let base_code: Option<String> = row.get(3);

            sqlx::query("DELETE FROM historico_producao WHERE id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

            sqlx::query(
                "UPDATE estoque_atual SET producao = MAX(0, producao - $1) WHERE codigo = $2",
            )
            .bind(qty)
            .bind(&codigo)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            if consume_base.unwrap_or(0) == 1 {
                if let Some(ref b_code) = base_code {
                    sqlx::query(
                        "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
                         VALUES ($1, 0, 0, 0, NULL)
                         ON CONFLICT (codigo) DO NOTHING",
                    )
                    .bind(b_code)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                    sqlx::query("UPDATE estoque_atual SET estoque = estoque + $1 WHERE codigo = $2")
                        .bind(qty)
                        .bind(b_code)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }
            }
        }

        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn update_producao_lote(
        &self,
        id: i64,
        lote_erp: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query("UPDATE historico_producao SET lote_erp = $1 WHERE id = $2")
            .bind(lote_erp)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn list_producao_history(
        &self,
        params: &crate::models::HistoryQueryParams,
    ) -> Result<Vec<crate::models::ProducaoHistoryRecord>, String> {
        let mut query = String::from(
            "SELECT h.id, h.data_producao, h.codigo, p.descricao,
                    COALESCE(o.linha_prefix_manual, p.linha_prefix) as resolved_linha_prefix,
                    cl.nome_linha, h.quantidade, h.observacoes, h.criado_em,
                    h.snap_estoque, h.snap_producao, h.snap_pedidos, h.snap_efp,
                    h.snap_media_vendas, h.snap_duracao_meses, h.snap_status,
                    h.snap_status_label, h.snap_producao_recomendada, h.snap_estoque_ideal_qtd,
                    h.snap_demanda_ajustada, h.consume_base, h.base_code, h.lote_erp
             FROM historico_producao h
             LEFT JOIN produtos p ON h.codigo = p.codigo
             LEFT JOIN overrides_produtos o ON h.codigo = o.codigo
             LEFT JOIN config_linhas cl ON COALESCE(o.linha_prefix_manual, p.linha_prefix) = cl.linha_prefix
             WHERE 1=1",
        );

        let mut binds: Vec<String> = Vec::new();
        let mut idx = 1;

        if let Some(ref search) = params.search {
            if !search.trim().is_empty() {
                query.push_str(&format!(
                    " AND (h.codigo LIKE ${} OR p.descricao LIKE ${})",
                    idx,
                    idx + 1
                ));
                let term = format!("%{}%", search.trim());
                binds.push(term.clone());
                binds.push(term);
                idx += 2;
            }
        }

        if let Some(ref linha) = params.linha {
            if !linha.trim().is_empty() && linha != "ALL" {
                query.push_str(&format!(
                    " AND COALESCE(o.linha_prefix_manual, p.linha_prefix) = ${}",
                    idx
                ));
                binds.push(linha.trim().to_string());
                idx += 1;
            }
        }

        if let Some(ref data) = params.data {
            if !data.trim().is_empty() {
                query.push_str(&format!(" AND h.data_producao = ${}", idx));
                binds.push(data.trim().to_string());
            }
        }

        let sort_col = match params.sort.as_deref() {
            Some("data_producao") => "h.data_producao",
            Some("codigo") => "h.codigo",
            Some("descricao") => "p.descricao",
            Some("quantidade") => "h.quantidade",
            Some("observacoes") => "h.observacoes",
            _ => "h.data_producao",
        };
        let sort_dir = match params.order.as_deref() {
            Some("desc") => "DESC",
            Some("asc") => "ASC",
            _ => "DESC",
        };
        query.push_str(&format!(
            " ORDER BY {} {}, h.criado_em DESC",
            sort_col, sort_dir
        ));

        let mut q = sqlx::query(&query);
        for b in &binds {
            q = q.bind(b);
        }

        let rows = q.fetch_all(&self.pool).await.map_err(|e| e.to_string())?;

        Ok(rows
            .into_iter()
            .map(|row| {
                let consume_raw: Option<i32> = row.get(20);
                crate::models::ProducaoHistoryRecord {
                    id: pg_i64(&row, 0),
                    data_producao: row.get(1),
                    codigo: row.get(2),
                    descricao: row.get::<Option<String>, _>(3).unwrap_or_default(),
                    linha_prefix: row.get::<Option<String>, _>(4).unwrap_or_default(),
                    nome_linha: row.get::<Option<String>, _>(5).unwrap_or_default(),
                    quantidade: pg_i64(&row, 6),
                    observacoes: row.get(7),
                    criado_em: row.get::<Option<String>, _>(8).unwrap_or_default(),
                    snap_estoque: pg_opt_i64(&row, 9),
                    snap_producao: pg_opt_i64(&row, 10),
                    snap_pedidos: pg_opt_i64(&row, 11),
                    snap_efp: pg_opt_i64(&row, 12),
                    snap_media_vendas: row.get(13),
                    snap_duracao_meses: row.get(14),
                    snap_status: row.get(15),
                    snap_status_label: row.get(16),
                    snap_producao_recomendada: pg_opt_i64(&row, 17),
                    snap_estoque_ideal_qtd: row.get(18),
                    snap_demanda_ajustada: row.get(19),
                    consume_base: Some(consume_raw.unwrap_or(0) == 1),
                    base_code: row.get(21),
                    lote_erp: row.get(22),
                }
            })
            .collect())
    }

    pub async fn get_kit_composition_full(
        &self,
    ) -> Result<Vec<crate::models::KitComposicaoRow>, String> {
        let rows = sqlx::query(
            "SELECT kc.kit_codigo, pk.descricao as kit_desc, kc.componente_codigo, pc.descricao as comp_desc, COALESCE(kc.quantidade, 1) as quantidade
             FROM kit_composicao kc
             JOIN produtos pk ON TRIM(REPLACE(kc.kit_codigo, '\"', '')) = TRIM(REPLACE(pk.codigo, '\"', ''))
             JOIN produtos pc ON TRIM(REPLACE(kc.componente_codigo, '\"', '')) = TRIM(REPLACE(pc.codigo, '\"', ''))
             ORDER BY pk.descricao, pc.descricao",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows
            .into_iter()
            .map(|row| crate::models::KitComposicaoRow {
                kit_codigo: row.get(0),
                kit_descricao: row.get(1),
                componente_codigo: row.get(2),
                componente_descricao: row.get(3),
                quantidade: pg_i64(&row, 4),
            })
            .collect())
    }

    pub async fn add_kit_composicao(
        &self,
        kit_codigo: &str,
        componente_codigo: &str,
        quantidade: i64,
    ) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO kit_composicao (kit_codigo, componente_codigo, quantidade) VALUES ($1, $2, $3)
             ON CONFLICT(kit_codigo, componente_codigo) DO UPDATE SET quantidade = EXCLUDED.quantidade",
        )
        .bind(kit_codigo)
        .bind(componente_codigo)
        .bind(quantidade)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn delete_kit_composicao(
        &self,
        kit_codigo: &str,
        componente_codigo: &str,
    ) -> Result<(), String> {
        sqlx::query(
            "DELETE FROM kit_composicao WHERE kit_codigo = $1 AND componente_codigo = $2",
        )
        .bind(kit_codigo)
        .bind(componente_codigo)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn delete_all_kit_composicao(&self) -> Result<(), String> {
        sqlx::query("DELETE FROM kit_composicao")
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn record_import(
        &self,
        tipo: &str,
        nome_arquivo: &str,
        registros: i64,
        status: &str,
        mensagem: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO historico_importacoes (tipo, nome_arquivo, registros, status, mensagem) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(tipo)
        .bind(nome_arquivo)
        .bind(registros)
        .bind(status)
        .bind(mensagem)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn get_import_history(&self) -> Result<Vec<crate::models::ImportRecord>, String> {
        let rows = sqlx::query(
            "SELECT id, tipo, nome_arquivo, importado_em, registros, status, mensagem
             FROM historico_importacoes ORDER BY importado_em DESC LIMIT 100",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows
            .into_iter()
            .map(|row| crate::models::ImportRecord {
                id: pg_i64(&row, 0),
                tipo: row.get(1),
                nome_arquivo: row.get(2),
                importado_em: row.get(3),
                registros: pg_i64(&row, 4),
                status: row.get(5),
                mensagem: row.get(6),
            })
            .collect())
    }

    pub async fn get_import_status(&self) -> Result<Vec<crate::models::ImportStatus>, String> {
        let tipos = ["levantamento", "faturamento", "kits"];
        let mut result = Vec::new();

        for tipo in &tipos {
            let row = sqlx::query(
                "SELECT nome_arquivo, importado_em,
                 (CURRENT_DATE - importado_em::date)::integer as dias
                 FROM historico_importacoes WHERE tipo = $1 AND status = 'success'
                 ORDER BY importado_em DESC LIMIT 1",
            )
            .bind(*tipo)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

            match row {
                Some(r) => result.push(crate::models::ImportStatus {
                    tipo: tipo.to_string(),
                    ultimo_arquivo: Some(r.get(0)),
                    importado_em: Some(r.get(1)),
                    dias_sem_importar: Some(pg_i64(&r, 2)),
                }),
                None => result.push(crate::models::ImportStatus {
                    tipo: tipo.to_string(),
                    ultimo_arquivo: None,
                    importado_em: None,
                    dias_sem_importar: None,
                }),
            }
        }
        Ok(result)
    }

    pub async fn get_watch_config(&self) -> Result<crate::models::WatchConfig, String> {
        Ok(crate::models::WatchConfig {
            pasta: self
                .get_setting("watch_pasta")
                .await?
                .unwrap_or_else(|| "PlanilhasBase".to_string()),
            threshold_levantamento_dias: self
                .get_setting("watch_threshold_levantamento")
                .await?
                .and_then(|v| v.parse().ok())
                .unwrap_or(7),
            threshold_faturamento_dias: self
                .get_setting("watch_threshold_faturamento")
                .await?
                .and_then(|v| v.parse().ok())
                .unwrap_or(30),
            ativo: self
                .get_setting("watch_ativo")
                .await?
                .map(|v| v == "1")
                .unwrap_or(true),
        })
    }

    pub async fn save_watch_config(
        &self,
        cfg: &crate::models::WatchConfig,
    ) -> Result<(), String> {
        self.save_setting("watch_pasta", &cfg.pasta).await?;
        self.save_setting(
            "watch_threshold_levantamento",
            &cfg.threshold_levantamento_dias.to_string(),
        )
        .await?;
        self.save_setting(
            "watch_threshold_faturamento",
            &cfg.threshold_faturamento_dias.to_string(),
        )
        .await?;
        self.save_setting("watch_ativo", if cfg.ativo { "1" } else { "0" })
            .await?;
        Ok(())
    }

    pub async fn get_erp_sync_schedule(
        &self,
    ) -> Result<crate::modules::geral::configuracoes::models::ErpSyncScheduleConfig, String> {
        let horarios_raw = self
            .get_setting("erp_sync_horarios")
            .await?
            .unwrap_or_else(|| r#"["06:00","12:00","18:00","22:00"]"#.to_string());
        let horarios: Vec<String> = serde_json::from_str(&horarios_raw).unwrap_or_else(|_| {
            vec![
                "06:00".to_string(),
                "12:00".to_string(),
                "18:00".to_string(),
                "22:00".to_string(),
            ]
        });
        Ok(
            crate::modules::geral::configuracoes::models::ErpSyncScheduleConfig {
                ativo: self
                    .get_setting("erp_sync_auto_ativo")
                    .await?
                    .map(|v| v == "1")
                    .unwrap_or(true),
                horarios,
            },
        )
    }

    pub async fn save_erp_sync_schedule(
        &self,
        cfg: &crate::modules::geral::configuracoes::models::ErpSyncScheduleConfig,
    ) -> Result<(), String> {
        let horarios_json =
            serde_json::to_string(&cfg.horarios).unwrap_or_else(|_| "[]".to_string());
        self.save_setting("erp_sync_auto_ativo", if cfg.ativo { "1" } else { "0" })
            .await?;
        self.save_setting("erp_sync_horarios", &horarios_json).await?;
        Ok(())
    }

    pub async fn get_erp_sync_last_auto_run(&self) -> Result<Option<String>, String> {
        self.get_setting("erp_sync_last_auto_run").await
    }

    pub async fn set_erp_sync_last_auto_run(&self, value: &str) -> Result<(), String> {
        self.save_setting("erp_sync_last_auto_run", value).await
    }

    pub async fn get_erp_sync_last_slot(&self) -> Result<Option<String>, String> {
        self.get_setting("erp_sync_last_slot").await
    }

    pub async fn set_erp_sync_last_slot(&self, value: &str) -> Result<(), String> {
        self.save_setting("erp_sync_last_slot", value).await
    }

    pub async fn get_already_imported_files(&self, tipo: &str) -> Result<HashSet<String>, String> {
        let rows = sqlx::query(
            "SELECT nome_arquivo FROM historico_importacoes WHERE tipo = $1 AND status = 'success'",
        )
        .bind(tipo)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows.into_iter().map(|r| r.get(0)).collect())
    }
}
