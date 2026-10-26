use sqlx::postgres::PgPool;
use sqlx::Row;
use std::collections::{HashMap, HashSet};

use crate::core::pg_row::{pg_f64, pg_i64, pg_opt_f64, pg_opt_i32, pg_opt_i64};
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
        Self::excluir_linha_na_tx(&mut tx, prefix).await?;
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Remapeia produtos e overrides da linha para DEFAULT e apaga a linha, numa transação de quem chama.
    /// Devolve (produtos remapeados, overrides remapeados).
    pub async fn excluir_linha_na_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        prefix: &str,
    ) -> Result<(u64, u64), String> {
        let produtos = sqlx::query("UPDATE produtos SET linha_prefix = 'DEFAULT' WHERE linha_prefix = $1")
            .bind(prefix)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?
            .rows_affected();
        let overrides = sqlx::query("UPDATE overrides_produtos SET linha_prefix_manual = 'DEFAULT' WHERE linha_prefix_manual = $1")
            .bind(prefix)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?
            .rows_affected();
        sqlx::query("DELETE FROM config_linhas WHERE linha_prefix = $1")
            .bind(prefix)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        Ok((produtos, overrides))
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
            is_producao_programada: pg_opt_i32(row, 14),
            producao_programada_disparo: pg_opt_i64(row, 15),
            producao_programada_objetivo: pg_opt_i64(row, 16),
            lancamento_gatilho: pg_opt_i64(row, 17),
            lancamento_estoque_maximo: pg_opt_i64(row, 18),
            familia_produto: row.get(19),
            processo_termico: row.get(20),
            exclusivo_no_dia: row.get(21),
            permite_bombona: row.get(22),
            dias_ate_envase: row.get(23),
            producao_minima_kg: row.get(24),
            campos_enviados: Default::default(),
        }
    }

    pub async fn get_override(&self, codigo: &str) -> Result<Option<ProductOverride>, String> {
        let row = sqlx::query(
            "SELECT codigo, estoque_ideal_manual, pedidos_manual, media_manual, is_lancamento_manual, visivel, observacao, linha_prefix_manual, status_produto, categoria_produto, produzir_apenas_kit, lancamento_meta_meses, lancamento_data_inicio, terceirizado_modo, is_producao_programada, producao_programada_disparo, producao_programada_objetivo, lancamento_gatilho, lancamento_estoque_maximo, familia_produto, processo_termico, exclusivo_no_dia, permite_bombona, dias_ate_envase, producao_minima_kg
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
            "SELECT codigo, estoque_ideal_manual, pedidos_manual, media_manual, is_lancamento_manual, visivel, observacao, linha_prefix_manual, status_produto, categoria_produto, produzir_apenas_kit, lancamento_meta_meses, lancamento_data_inicio, terceirizado_modo, is_producao_programada, producao_programada_disparo, producao_programada_objetivo, lancamento_gatilho, lancamento_estoque_maximo, familia_produto, processo_termico, exclusivo_no_dia, permite_bombona, dias_ate_envase, producao_minima_kg
             FROM overrides_produtos",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(Self::map_product_override).collect())
    }

    pub async fn save_override(&self, ovr: &ProductOverride) -> Result<(), String> {
        // Só as colunas cujas chaves vieram no corpo são gravadas (inclusive `null`, que limpa);
        // as demais mantêm o valor atual. Numa linha nova, o que não veio fica NULL/default.
        let campos: Vec<String> = ovr.campos_enviados.iter().cloned().collect();
        let sobrescreve = |col: &str| -> String {
            format!(
                "{col} = CASE WHEN '{col}' = ANY($27::text[]) THEN EXCLUDED.{col} ELSE overrides_produtos.{col} END"
            )
        };
        let sets = [
            "estoque_ideal_manual",
            "pedidos_manual",
            "media_manual",
            "is_lancamento_manual",
            "visivel",
            "observacao",
            "linha_prefix_manual",
            "status_produto",
            "categoria_produto",
            "produzir_apenas_kit",
            "lancamento_meta_meses",
            "terceirizado_modo",
            "is_producao_programada",
            "producao_programada_disparo",
            "producao_programada_objetivo",
            "lancamento_gatilho",
            "lancamento_estoque_maximo",
            "processo_termico",
            "exclusivo_no_dia",
            "permite_bombona",
            "dias_ate_envase",
            "producao_minima_kg",
        ]
        .iter()
        .map(|c| sobrescreve(c))
        .collect::<Vec<_>>()
        .join(",\n                    ");
        let sql = format!(
            "INSERT INTO overrides_produtos (codigo, estoque_ideal_manual, pedidos_manual, media_manual, is_lancamento_manual, visivel, observacao, linha_prefix_manual, status_produto, categoria_produto, produzir_apenas_kit, lancamento_meta_meses, lancamento_data_inicio, terceirizado_modo, is_producao_programada, producao_programada_disparo, producao_programada_objetivo, lancamento_gatilho, lancamento_estoque_maximo, familia_produto, processo_termico, exclusivo_no_dia, permite_bombona, dias_ate_envase, producao_minima_kg)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, CASE WHEN $21 THEN to_char(CURRENT_DATE, 'YYYY-MM-DD') ELSE NULL END), $14, $15, $16, $17, $18, $19, NULLIF($20, ''), $22, $23, $24, $25, $26)
                 ON CONFLICT(codigo) DO UPDATE SET
                    {sets},
                    lancamento_data_inicio = COALESCE(EXCLUDED.lancamento_data_inicio, overrides_produtos.lancamento_data_inicio, CASE WHEN $21 THEN to_char(CURRENT_DATE, 'YYYY-MM-DD') ELSE NULL END),
                    familia_produto = CASE
                        WHEN $20 = '-' THEN NULL
                        WHEN NULLIF($20, '') IS NULL THEN overrides_produtos.familia_produto
                        ELSE $20
                    END"
        );
        sqlx::query(&sql)
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
            .bind(ovr.is_producao_programada)
            .bind(ovr.producao_programada_disparo)
            .bind(ovr.producao_programada_objetivo)
            .bind(ovr.lancamento_gatilho)
            .bind(ovr.lancamento_estoque_maximo)
            .bind(ovr.familia_produto.clone().unwrap_or_default())
            .bind(
                ovr.is_lancamento_manual == Some(1)
                    || ovr.lancamento_gatilho.filter(|n| *n > 0).is_some()
                    || ovr.lancamento_estoque_maximo.filter(|n| *n > 0).is_some(),
            )
            .bind(&ovr.processo_termico)
            .bind(ovr.exclusivo_no_dia)
            .bind(ovr.permite_bombona)
            .bind(ovr.dias_ate_envase)
            .bind(ovr.producao_minima_kg)
            .bind(&campos)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        // Linha que ficou toda nula/default não tem razão de existir.
        let mut conn = self.pool.acquire().await.map_err(|e| e.to_string())?;
        Self::apagar_override_se_vazio(&mut conn, &ovr.codigo).await?;

        // base_codigo mora em produtos: chave presente com null ou "" limpa; ausente não mexe.
        if ovr.campos_enviados.contains("base_codigo") || ovr.base_codigo.is_some() {
            let trimmed = ovr.base_codigo.as_deref().map(str::trim).filter(|s| !s.is_empty());
            sqlx::query("UPDATE produtos SET base_codigo = $2 WHERE codigo = $1")
                .bind(&ovr.codigo)
                .bind(trimmed)
                .execute(&self.pool)
                .await
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Apaga a linha de `overrides_produtos` somente se todas as colunas estão nulas/default.
    async fn apagar_override_se_vazio(
        conn: &mut sqlx::PgConnection,
        codigo: &str,
    ) -> Result<(), String> {
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
               AND lancamento_data_inicio IS NULL
               AND terceirizado_modo IS NULL
               AND (is_producao_programada IS NULL OR is_producao_programada = 0)
               AND producao_programada_disparo IS NULL
               AND producao_programada_objetivo IS NULL
               AND lancamento_gatilho IS NULL
               AND lancamento_estoque_maximo IS NULL
               AND (familia_produto IS NULL OR TRIM(familia_produto) = '')
               AND processo_termico IS NULL
               AND exclusivo_no_dia IS NULL
               AND permite_bombona IS NULL
               AND dias_ate_envase IS NULL
               AND producao_minima_kg IS NULL",
        )
        .bind(codigo)
        .execute(conn)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Ações aceitas por `save_override_bulk`.
    pub const ACOES_BULK: [&'static str; 12] = [
        "hide",
        "show",
        "set_launch_auto",
        "set_launch_yes",
        "set_launch_no",
        "sair_producao_fixa",
        "graduar_lancamento",
        "set_obs",
        "set_line",
        "set_status",
        "set_category",
        "clear",
    ];

    pub async fn save_override_bulk(&self, req: &BulkOverrideRequest) -> Result<(), String> {
        let mut tx = self.pool.begin().await.map_err(|e| e.to_string())?;
        Self::bulk_na_tx(&mut tx, req).await?;
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Aplica a ação em lote dentro de uma transação aberta por quem chama (que decide commit ou rollback).
    pub async fn bulk_na_tx(
        tx_in: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        req: &BulkOverrideRequest,
    ) -> Result<(), String> {
        if !Self::ACOES_BULK.contains(&req.action.as_str()) {
            return Err(format!("Ação em lote desconhecida: {}", req.action));
        }
        let tx: &mut sqlx::PgConnection = &mut **tx_in;
        for codigo in &req.codigos {
            if req.action != "clear" {
                sqlx::query(
                    "INSERT INTO overrides_produtos (codigo) VALUES ($1) ON CONFLICT (codigo) DO NOTHING",
                )
                .bind(codigo)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            }

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
                "sair_producao_fixa" => {
                    sqlx::query(
                        "UPDATE overrides_produtos
                         SET is_lancamento_manual = 0,
                             lancamento_gatilho = NULL,
                             lancamento_estoque_maximo = NULL
                         WHERE codigo = $1",
                    )
                    .bind(codigo)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                }
                "graduar_lancamento" => {
                    // Graduar = status ativo e sem marca manual de lançamento.
                    sqlx::query(
                        "UPDATE overrides_produtos
                         SET status_produto = 'ativo', is_lancamento_manual = NULL
                         WHERE codigo = $1",
                    )
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
                    // Zera só os ajustes manuais que a aba Audit de Overrides mostra; regras PCP,
                    // produção programada, terceirizado, gatilhos e família ficam.
                    sqlx::query(
                        "UPDATE overrides_produtos
                         SET estoque_ideal_manual = NULL,
                             pedidos_manual = NULL,
                             media_manual = NULL,
                             is_lancamento_manual = NULL,
                             visivel = NULL,
                             observacao = NULL,
                             linha_prefix_manual = NULL,
                             status_produto = NULL,
                             categoria_produto = NULL
                         WHERE codigo = $1",
                    )
                    .bind(codigo)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                }
                outra => return Err(format!("Ação em lote desconhecida: {outra}")),
            }

            Self::apagar_override_se_vazio(tx, codigo).await?;
        }

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

    pub async fn get_kit_composition(
        &self,
    ) -> Result<HashMap<String, Vec<(String, f64, Option<f64>, Option<i32>)>>, String> {
        let rows = sqlx::query(
            "SELECT kit_codigo, componente_codigo, COALESCE(quantidade, 1)::float8, fator_proporcao_qtd::float8, fator_proporcao_kits FROM kit_composicao",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut map: HashMap<String, Vec<(String, f64, Option<f64>, Option<i32>)>> = HashMap::new();
        for row in rows {
            let kit: String = row.get(0);
            let comp: String = row.get(1);
            let qty = pg_f64(&row, 2);
            let fat_qtd = pg_opt_f64(&row, 3);
            let fat_kits = pg_opt_i32(&row, 4);
            map.entry(kit).or_default().push((comp, qty, fat_qtd, fat_kits));
        }
        Ok(map)
    }

    /// Lança a produção numa transação (ver `lancar_producao`).
    pub async fn add_producao_entry(
        &self,
        entry: &crate::models::NewProducaoEntry,
    ) -> Result<ResultadoLancamento, String> {
        let mut tx = self.pool.begin().await.map_err(|e| e.to_string())?;
        let r = lancar_producao(&mut tx, entry).await.map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(r)
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
                    {LINHA} as resolved_linha_prefix,
                    cl.nome_linha, h.quantidade, h.observacoes, h.criado_em,
                    h.snap_estoque, h.snap_producao, h.snap_pedidos, h.snap_efp,
                    h.snap_media_vendas, h.snap_duracao_meses, h.snap_status,
                    h.snap_status_label, h.snap_producao_recomendada, h.snap_estoque_ideal_qtd,
                    h.snap_demanda_ajustada, h.consume_base, h.base_code, h.lote_erp
             FROM historico_producao h
             LEFT JOIN produtos p ON h.codigo = p.codigo
             LEFT JOIN overrides_produtos o ON h.codigo = o.codigo
             LEFT JOIN config_linhas cl ON {LINHA} = cl.linha_prefix
             WHERE 1=1"
                .replace("{LINHA}", crate::core::regras_produto::LINHA_EFETIVA_SQL),
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
                if linha.trim().eq_ignore_ascii_case("KITS") {
                    query.push_str(" AND (p.descricao ILIKE '%kit%' OR h.codigo IN (SELECT DISTINCT kit_codigo FROM kit_composicao))");
                } else {
                    query.push_str(&format!(
                        " AND COALESCE(o.linha_prefix_manual, p.linha_prefix) = ${}",
                        idx
                    ));
                    binds.push(linha.trim().to_string());
                    idx += 1;
                }
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
        // Componente pode ser produto acabado (produtos) ou embalagem/insumo (items).
        let rows = sqlx::query(
            "SELECT kc.kit_codigo,
                    COALESCE(pk.descricao, kc.kit_codigo) as kit_desc,
                    kc.componente_codigo,
                    COALESCE(pc.descricao, i.description, kc.componente_codigo) as comp_desc,
                    COALESCE(kc.quantidade, 1)::float8 as quantidade,
                    kc.fator_proporcao_qtd::float8,
                    kc.fator_proporcao_kits,
                    COALESCE(NULLIF(TRIM(kc.origem), ''), 'manual') as origem,
                    ea.estoque
             FROM kit_composicao kc
             LEFT JOIN produtos pk
               ON TRIM(REPLACE(kc.kit_codigo, '\"', '')) = TRIM(REPLACE(pk.codigo, '\"', ''))
             LEFT JOIN produtos pc
               ON TRIM(REPLACE(kc.componente_codigo, '\"', '')) = TRIM(REPLACE(pc.codigo, '\"', ''))
             LEFT JOIN items i
               ON TRIM(REPLACE(kc.componente_codigo, '\"', '')) = TRIM(REPLACE(i.code, '\"', ''))
             LEFT JOIN estoque_atual ea
               ON TRIM(REPLACE(kc.componente_codigo, '\"', '')) = TRIM(REPLACE(ea.codigo, '\"', ''))
             ORDER BY COALESCE(pk.descricao, kc.kit_codigo), COALESCE(pc.descricao, i.description, kc.componente_codigo)",
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
                quantidade: pg_f64(&row, 4),
                fator_proporcao_qtd: pg_opt_f64(&row, 5),
                fator_proporcao_kits: pg_opt_i32(&row, 6),
                origem: row.get(7),
                estoque_componente: pg_opt_i64(&row, 8),
            })
            .collect())
    }

    /// Busca candidatos a componente de kit em produtos e items (embalagens/insumos).
    pub async fn search_kit_component_candidates(
        &self,
        q: &str,
        limit: i64,
    ) -> Result<Vec<(String, String, String)>, String> {
        let term = q.trim();
        if term.is_empty() {
            return Ok(Vec::new());
        }
        let like = format!("%{}%", term.replace('%', "\\%").replace('_', "\\_"));
        let lim = limit.clamp(1, 40);
        let rows = sqlx::query(
            "SELECT codigo, descricao, fonte FROM (
                SELECT TRIM(REPLACE(codigo, '\"', '')) AS codigo,
                       descricao,
                       'produto'::text AS fonte,
                       0 AS ord
                FROM produtos
                WHERE TRIM(REPLACE(codigo, '\"', '')) ILIKE $1 ESCAPE '\\'
                   OR descricao ILIKE $1 ESCAPE '\\'
                UNION ALL
                SELECT TRIM(REPLACE(code, '\"', '')) AS codigo,
                       description AS descricao,
                       'item'::text AS fonte,
                       1 AS ord
                FROM items
                WHERE TRIM(REPLACE(code, '\"', '')) ILIKE $1 ESCAPE '\\'
                   OR description ILIKE $1 ESCAPE '\\'
             ) t
             ORDER BY
               CASE WHEN LOWER(codigo) = LOWER($2) THEN 0
                    WHEN LOWER(codigo) LIKE LOWER($2) || '%' THEN 1
                    ELSE 2 END,
               ord,
               descricao
             LIMIT $3",
        )
        .bind(&like)
        .bind(term)
        .bind(lim)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows
            .into_iter()
            .map(|row| {
                let codigo: String = row.get(0);
                let descricao: String = row.get(1);
                let fonte: String = row.get(2);
                (codigo, descricao, fonte)
            })
            .collect())
    }

    pub async fn kit_component_exists(&self, codigo: &str) -> Result<bool, String> {
        let code = codigo.trim().replace('"', "");
        let ok: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = $1)
             OR EXISTS(SELECT 1 FROM items WHERE TRIM(REPLACE(code, '\"', '')) = $1)",
        )
        .bind(&code)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(ok)
    }

    pub async fn add_kit_composicao(
        &self,
        kit_codigo: &str,
        componente_codigo: &str,
        quantidade: f64,
        fator_proporcao_qtd: Option<f64>,
        fator_proporcao_kits: Option<i32>,
    ) -> Result<(), String> {
        if !self.kit_component_exists(componente_codigo).await? {
            return Err(format!(
                "Componente '{}' não encontrado em produtos nem em items (embalagens/insumos).",
                componente_codigo.trim()
            ));
        }
        sqlx::query(
            "INSERT INTO kit_composicao (kit_codigo, componente_codigo, quantidade, fator_proporcao_qtd, fator_proporcao_kits, origem)
             VALUES ($1, $2, $3::numeric, $4::numeric, $5::int4, 'manual')
             ON CONFLICT(kit_codigo, componente_codigo) DO UPDATE SET
                quantidade = EXCLUDED.quantidade,
                fator_proporcao_qtd = EXCLUDED.fator_proporcao_qtd,
                fator_proporcao_kits = EXCLUDED.fator_proporcao_kits,
                origem = 'manual'",
        )
        .bind(kit_codigo)
        .bind(componente_codigo)
        .bind(quantidade)
        .bind(fator_proporcao_qtd)
        .bind(fator_proporcao_kits)
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
        let deleted = sqlx::query(
            "DELETE FROM kit_composicao
             WHERE kit_codigo = $1 AND componente_codigo = $2 AND COALESCE(origem, 'manual') = 'manual'",
        )
        .bind(kit_codigo)
        .bind(componente_codigo)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        if deleted.rows_affected() == 0 {
            let is_erp: bool = sqlx::query_scalar(
                "SELECT EXISTS(
                    SELECT 1 FROM kit_composicao
                    WHERE kit_codigo = $1 AND componente_codigo = $2 AND origem = 'erp'
                 )",
            )
            .bind(kit_codigo)
            .bind(componente_codigo)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
            if is_erp {
                return Err(
                    "Relação vinda do ERP não pode ser excluída aqui. Altere no ERP e rode o sync.".into(),
                );
            }
            return Err("Relação não encontrada.".into());
        }
        Ok(())
    }

    /// Remove só linhas manuais (Excel/CRUD). Linhas `erp` são preservadas.
    pub async fn delete_manual_kit_composicao(&self) -> Result<(), String> {
        sqlx::query("DELETE FROM kit_composicao WHERE COALESCE(origem, 'manual') = 'manual'")
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
            .unwrap_or_else(|| r#"["06:00","08:30","10:30","12:30","14:30","16:30","18:30","22:00"]"#.to_string());
        let horarios: Vec<String> = serde_json::from_str(&horarios_raw).unwrap_or_else(|_| {
            vec![
                "06:00".to_string(),
                "08:30".to_string(),
                "10:30".to_string(),
                "12:30".to_string(),
                "14:30".to_string(),
                "16:30".to_string(),
                "18:30".to_string(),
                "22:00".to_string(),
            ]
        });
        let auto_audit_interval_minutes = self
            .get_setting("stock_auto_audit_interval_minutes")
            .await?
            .and_then(|v| v.parse().ok())
            .unwrap_or(15);
        Ok(
            crate::modules::geral::configuracoes::models::ErpSyncScheduleConfig {
                ativo: self
                    .get_setting("erp_sync_auto_ativo")
                    .await?
                    .map(|v| v == "1")
                    .unwrap_or(true),
                horarios,
                auto_audit_interval_minutes,
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
        self.save_setting(
            "stock_auto_audit_interval_minutes",
            &cfg.auto_audit_interval_minutes.to_string(),
        )
        .await?;
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

/// Resultado de um lançamento de produção.
#[derive(Debug)]
pub struct ResultadoLancamento {
    pub id: i64,
    /// kg descontados da base (só com `consume_base` e medida conhecida); `None` = a base não foi mexida.
    pub base_descontada_kg: Option<f64>,
    /// Por que a base não foi descontada, quando era para ser.
    pub aviso: Option<String>,
}

/// Quantidade de produto acabado (unidades) em kg de base: peso unitário lido da descrição ("500ML" = 0,5 kg).
/// `None` quando a descrição não traz uma medida válida; nesse caso a base não deve ser mexida.
pub fn unidades_para_kg(descricao: &str, unidades: i64) -> Option<f64> {
    crate::modules::producao::fila::medida_kg(descricao).map(|peso| unidades as f64 * peso)
}

async fn kg_da_base(conn: &mut sqlx::PgConnection, codigo: &str, unidades: i64) -> Result<Option<f64>, sqlx::Error> {
    let descricao: Option<String> = sqlx::query_scalar("SELECT descricao FROM produtos WHERE codigo = $1")
        .bind(codigo)
        .fetch_optional(&mut *conn)
        .await?;
    Ok(descricao.and_then(|d| unidades_para_kg(&d, unidades)))
}

/// Grava o lançamento de produção em `historico_producao` e soma em `estoque_atual.producao`. Com `consume_base`,
/// desconta da base o equivalente em kg (a base é em kg, o lançamento em unidades); sem medida conhecida no produto
/// a base não é mexida e o motivo vai em `aviso`.
pub async fn lancar_producao(
    conn: &mut sqlx::PgConnection,
    entry: &crate::models::NewProducaoEntry,
) -> Result<ResultadoLancamento, sqlx::Error> {
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
    .bind(if entry.consume_base.unwrap_or(false) { 1 } else { 0 })
    .bind(&entry.base_code)
    .bind(&entry.lote_erp)
    .fetch_one(&mut *conn)
    .await?;

    sqlx::query(
        "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
         VALUES ($1, 0, 0, 0, NULL)
         ON CONFLICT (codigo) DO NOTHING",
    )
    .bind(&entry.codigo)
    .execute(&mut *conn)
    .await?;

    sqlx::query("UPDATE estoque_atual SET producao = producao + $1 WHERE codigo = $2")
        .bind(entry.quantidade)
        .bind(&entry.codigo)
        .execute(&mut *conn)
        .await?;

    let mut base_descontada_kg = None;
    let mut aviso = None;
    let mut descontado_kg = 0.0_f64;
    if entry.consume_base.unwrap_or(false) {
        if let Some(ref b_code) = entry.base_code {
            match kg_da_base(&mut *conn, &entry.codigo, entry.quantidade).await? {
                Some(kg) => {
                    sqlx::query(
                        "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
                         VALUES ($1, 0, 0, 0, NULL)
                         ON CONFLICT (codigo) DO NOTHING",
                    )
                    .bind(b_code)
                    .execute(&mut *conn)
                    .await?;
                    sqlx::query("UPDATE estoque_atual SET estoque = GREATEST(0.0, estoque - $1) WHERE codigo = $2")
                        .bind(kg)
                        .bind(b_code)
                        .execute(&mut *conn)
                        .await?;
                    base_descontada_kg = Some(kg);
                    descontado_kg = kg;
                }
                None => {
                    let msg = format!(
                        "Base {b_code} não descontada: o produto {} não traz a medida (ML, L, G, KG) na descrição.",
                        entry.codigo
                    );
                    eprintln!("[historico] {msg}");
                    aviso = Some(msg);
                }
            }
        }
    }
    sqlx::query("UPDATE historico_producao SET base_consumida_kg = $1 WHERE id = $2")
        .bind(descontado_kg)
        .bind(insert_id_i32)
        .execute(&mut *conn)
        .await?;
    Ok(ResultadoLancamento { id: insert_id_i32 as i64, base_descontada_kg, aviso })
}

/// Estorna um lançamento de produção: apaga de `historico_producao`, tira da produção em `estoque_atual` e, se
/// o lançamento consumiu base, devolve à base o mesmo equivalente em kg. Roda na transação de quem chama.
/// `None` = o lançamento não existe. Devolve o que foi estornado.
pub async fn estornar_producao(
    conn: &mut sqlx::PgConnection,
    id: i64,
) -> Result<Option<serde_json::Value>, sqlx::Error> {
    let record = sqlx::query(
        "SELECT codigo, quantidade, consume_base, base_code, data_producao, lote_erp, base_consumida_kg
         FROM historico_producao WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;
    let Some(row) = record else { return Ok(None) };
    let codigo: String = row.get(0);
    let qty = pg_i64(&row, 1);
    let consume_base: Option<i32> = row.get(2);
    let base_code: Option<String> = row.get(3);
    let data_producao: String = row.get(4);
    let lote_erp: Option<String> = row.get(5);
    let base_consumida_kg: Option<f64> = row.get(6);

    sqlx::query("DELETE FROM historico_producao WHERE id = $1")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    sqlx::query("UPDATE estoque_atual SET producao = GREATEST(0.0, producao - $1) WHERE codigo = $2")
        .bind(qty)
        .bind(&codigo)
        .execute(&mut *conn)
        .await?;

    let mut base_devolvida_kg = None;
    let mut aviso = None;
    if consume_base.unwrap_or(0) == 1 {
        if let Some(ref b_code) = base_code {
            // Devolve exatamente o que o lançamento descontou. Sem o registro (lançamento antigo), o código
            // antigo descontou a quantidade em unidades, então é isso que volta.
            let kg = base_consumida_kg.unwrap_or(qty as f64);
            if kg > 0.0 {
                sqlx::query(
                    "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
                     VALUES ($1, 0, 0, 0, NULL)
                     ON CONFLICT (codigo) DO NOTHING",
                )
                .bind(b_code)
                .execute(&mut *conn)
                .await?;
                sqlx::query("UPDATE estoque_atual SET estoque = estoque + $1 WHERE codigo = $2")
                    .bind(kg)
                    .bind(b_code)
                    .execute(&mut *conn)
                    .await?;
                base_devolvida_kg = Some(kg);
            } else {
                aviso = Some(format!("Base {b_code} não devolvida: o lançamento não descontou a base."));
            }
        }
    }
    Ok(Some(serde_json::json!({
        "id": id,
        "codigo": codigo,
        "quantidade": qty,
        "dataProducao": data_producao,
        "loteErp": lote_erp,
        "baseCode": base_code,
        "baseDevolvidaKg": base_devolvida_kg,
        "aviso": aviso,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unidades_viram_kg_pelo_peso_da_descricao() {
        assert_eq!(unidades_para_kg("SHAMPOO 500ML", 200), Some(100.0));
        assert_eq!(unidades_para_kg("CREME 1,5KG", 10), Some(15.0));
        assert_eq!(unidades_para_kg("GEL 250 G", 4), Some(1.0));
        assert_eq!(unidades_para_kg("SEM MEDIDA", 10), None, "sem medida, a base não é mexida");
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn lancar_desconta_a_base_em_kg_e_estornar_devolve() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('ZZHIST', 'teste') ON CONFLICT DO NOTHING").execute(&pool).await.unwrap();
        for (cod, desc) in [("TESTE.HIST.P", "TESTE SHAMPOO 500ML"), ("TESTE.HIST.S", "TESTE SEM MEDIDA"), ("TESTE.HIST.B", "TESTE BASE")] {
            sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix) VALUES ($1, $2, 'ZZHIST') ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao")
                .bind(cod).bind(desc).execute(&pool).await.unwrap();
        }
        sqlx::query("INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase) VALUES ('TESTE.HIST.B', 100, 0, 0, NULL) ON CONFLICT (codigo) DO UPDATE SET estoque = 100")
            .execute(&pool).await.unwrap();
        let entry = |codigo: &str| crate::models::NewProducaoEntry {
            data_producao: "2026-10-24".into(), codigo: codigo.into(), quantidade: 40, observacoes: None,
            snap_estoque: None, snap_producao: None, snap_pedidos: None, snap_efp: None, snap_media_vendas: None,
            snap_duracao_meses: None, snap_status: None, snap_status_label: None, snap_producao_recomendada: None,
            snap_estoque_ideal_qtd: None, snap_demanda_ajustada: None,
            consume_base: Some(true), base_code: Some("TESTE.HIST.B".into()), lote_erp: None,
        };
        let base = |pool: PgPool| async move {
            sqlx::query_scalar::<_, f64>("SELECT estoque::float8 FROM estoque_atual WHERE codigo = 'TESTE.HIST.B'").fetch_one(&pool).await.unwrap()
        };
        let db = Db::new(pool.clone());

        // 40 un de 500 ML = 20 kg da base (e não 40)
        let r = db.add_producao_entry(&entry("TESTE.HIST.P")).await.unwrap();
        assert_eq!(r.base_descontada_kg, Some(20.0));
        assert_eq!(base(pool.clone()).await, 80.0);

        // estornar devolve os mesmos 20 kg
        let mut tx = pool.begin().await.unwrap();
        let est = estornar_producao(&mut tx, r.id).await.unwrap().unwrap();
        tx.commit().await.unwrap();
        assert_eq!(est["baseDevolvidaKg"], 20.0);
        assert_eq!(base(pool.clone()).await, 100.0);

        // lançamento antigo (sem base_consumida_kg): devolve a quantidade original, como o código antigo descontou
        let r3 = db.add_producao_entry(&entry("TESTE.HIST.P")).await.unwrap();
        assert_eq!(base(pool.clone()).await, 80.0);
        sqlx::query("UPDATE historico_producao SET base_consumida_kg = NULL WHERE id = $1")
            .bind(r3.id as i32).execute(&pool).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        let est = estornar_producao(&mut tx, r3.id).await.unwrap().unwrap();
        tx.commit().await.unwrap();
        assert_eq!(est["baseDevolvidaKg"], 40.0);
        assert_eq!(base(pool.clone()).await, 120.0);
        sqlx::query("UPDATE estoque_atual SET estoque = 100 WHERE codigo = 'TESTE.HIST.B'").execute(&pool).await.unwrap();

        // sem medida: lança, mas não mexe na base
        let r2 = db.add_producao_entry(&entry("TESTE.HIST.S")).await.unwrap();
        assert_eq!(r2.base_descontada_kg, None);
        assert!(r2.aviso.is_some());
        assert_eq!(base(pool.clone()).await, 100.0);
        let mut tx = pool.begin().await.unwrap();
        estornar_producao(&mut tx, r2.id).await.unwrap().unwrap();
        tx.commit().await.unwrap();

        sqlx::query("DELETE FROM estoque_atual WHERE codigo LIKE 'TESTE.HIST.%'").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo LIKE 'TESTE.HIST.%'").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM config_linhas WHERE linha_prefix = 'ZZHIST'").execute(&pool).await.ok();
    }
}
