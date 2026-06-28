use rusqlite::{params, Connection, Result};
use std::path::Path;
use std::collections::HashMap;
use crate::models::{LineConfig, ProductOverride, BulkOverrideRequest};

pub struct Db {
    // We will open connection per request or use a pool.
    // For a local single-user SQLite app, keeping a connection or opening/closing it is perfectly fine.
    // We will define a helper function to establish connection.
    db_path: String,
}

impl Db {
    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        Self {
            db_path: path.as_ref().to_string_lossy().to_string(),
        }
    }

    pub fn db_path(&self) -> &str {
        &self.db_path
    }

    pub fn connect(&self) -> Result<Connection> {
        Connection::open(&self.db_path)
    }

    pub fn init(&self) -> Result<()> {
        let conn = self.connect()?;
        
        // Ensure index exists on stock_movements(document_number) for performance
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_movements_doc ON stock_movements(document_number)", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_movements_saida_insumo_date ON stock_movements(movement_type, item_type, date, item_code, quantity)", []);
        
        // Run config_linhas migration BEFORE execute_batch to ensure schema.sql inserts succeed
        let _ = conn.execute("ALTER TABLE config_linhas ADD COLUMN visivel INTEGER NOT NULL DEFAULT 1", []);

        // Migration: Drop old tables to apply new constraints (run once)
        let _ = conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)", []);
        if conn.query_row("SELECT 1 FROM settings WHERE key = 'migration_sync_fixes_v2'", [], |_| Ok(())).is_err() {
            let _ = conn.execute("DROP TABLE IF EXISTS purchase_order_items", []);
            let _ = conn.execute("DROP TABLE IF EXISTS purchase_orders", []);
            let _ = conn.execute("DROP TABLE IF EXISTS invoices", []);
            let _ = conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_sync_fixes_v2', 'done')", []);
        }

        if conn.query_row("SELECT 1 FROM settings WHERE key = 'migration_sync_fixes_v3'", [], |_| Ok(())).is_err() {
            let _ = conn.execute("DROP TABLE IF EXISTS purchase_order_items", []);
            let _ = conn.execute("DROP TABLE IF EXISTS purchase_orders", []);
            let _ = conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_sync_fixes_v3', 'done')", []);
        }

        if conn.query_row("SELECT 1 FROM settings WHERE key = 'migration_sync_fixes_v4'", [], |_| Ok(())).is_err() {
            let _ = conn.execute("DROP TABLE IF EXISTS purchase_order_items", []);
            let _ = conn.execute("DROP TABLE IF EXISTS purchase_orders", []);
            let _ = conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_sync_fixes_v4', 'done')", []);
        }

        if conn.query_row("SELECT 1 FROM settings WHERE key = 'migration_sync_fixes_v5'", [], |_| Ok(())).is_err() {
            let _ = conn.execute(
                "UPDATE stock_snapshots 
                 SET snapshot_date = strftime('%Y-%m-%d %H:%M:%S', snapshot_date) 
                 WHERE snapshot_date LIKE '%T%'", 
                []
            );
            let _ = conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_stock_item_date ON stock_snapshots(item_code, snapshot_date DESC, id DESC)", 
                []
            );
            let _ = conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_sync_fixes_v5', 'done')", 
                []
            );
        }

        // Migration: formulations table schema update to support multiple entries of the same ingredient (e.g. water split in phases)
        let has_id_col = conn.query_row(
            "SELECT 1 FROM pragma_table_info('formulations') WHERE name = 'id'",
            [],
            |_| Ok(true)
        ).unwrap_or(false);

        if !has_id_col {
            let _ = conn.execute("DROP TABLE IF EXISTS formulations", []);
        }

        let schema = include_str!("../schema.sql");
        conn.execute_batch(schema)?;

        // Run migrations for the new columns in overrides_produtos table if they do not exist
        let _ = conn.execute("ALTER TABLE overrides_produtos ADD COLUMN is_lancamento_manual INTEGER", []);
        let _ = conn.execute("ALTER TABLE overrides_produtos ADD COLUMN visivel INTEGER DEFAULT 1", []);
        let _ = conn.execute("ALTER TABLE overrides_produtos ADD COLUMN observacao TEXT", []);
        let _ = conn.execute("ALTER TABLE overrides_produtos ADD COLUMN linha_prefix_manual TEXT", []);
        let _ = conn.execute("ALTER TABLE overrides_produtos ADD COLUMN status_produto TEXT DEFAULT 'ativo'", []);
        let _ = conn.execute("ALTER TABLE overrides_produtos ADD COLUMN categoria_produto TEXT", []);
        let _ = conn.execute("ALTER TABLE overrides_produtos ADD COLUMN produzir_apenas_kit INTEGER DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE overrides_produtos ADD COLUMN lancamento_meta_meses INTEGER DEFAULT 6", []);
        let _ = conn.execute("ALTER TABLE overrides_produtos ADD COLUMN lancamento_data_inicio TEXT", []);

        // Migration: Move coloracao/apoio from status_produto to categoria_produto
        if conn.query_row("SELECT 1 FROM settings WHERE key = 'migration_status_to_category_v2'", [], |_| Ok(())).is_err() {
            let _ = conn.execute(
                "UPDATE overrides_produtos SET categoria_produto = 'cat_coloracao' WHERE status_produto = 'coloracao' AND (categoria_produto IS NULL OR categoria_produto = '')",
                [],
            );
            let _ = conn.execute(
                "UPDATE overrides_produtos SET categoria_produto = 'cat_apoio' WHERE status_produto = 'apoio' AND (categoria_produto IS NULL OR categoria_produto = '')",
                [],
            );
            let _ = conn.execute(
                "UPDATE overrides_produtos SET status_produto = 'ativo' WHERE status_produto = 'coloracao' OR status_produto = 'apoio'",
                [],
            );

            // Clean up settings: remove 'coloracao' and 'apoio' from ignored_product_statuses JSON list
            if let Ok(val_opt) = conn.query_row(
                "SELECT value FROM settings WHERE key = 'ignored_product_statuses'",
                [],
                |row| row.get::<_, String>(0),
            ) {
                if let Ok(mut list) = serde_json::from_str::<Vec<String>>(&val_opt) {
                    let orig_len = list.len();
                    list.retain(|s| s != "coloracao" && s != "apoio");
                    if list.len() != orig_len {
                        if let Ok(new_val) = serde_json::to_string(&list) {
                            let _ = conn.execute(
                                "UPDATE settings SET value = ?1 WHERE key = 'ignored_product_statuses'",
                                [new_val],
                            );
                        }
                    }
                }
            }

            let _ = conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_status_to_category_v2', 'done')",
                [],
            );
        }

        let _ = conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('lancamento_meta_meses_global', '6')",
            [],
        );

        // Migrations: snapshot columns in historico_producao
        let snap_cols = [
            "snap_estoque INTEGER", "snap_producao INTEGER", "snap_pedidos INTEGER",
            "snap_efp INTEGER", "snap_media_vendas REAL", "snap_duracao_meses REAL",
            "snap_status TEXT", "snap_status_label TEXT", "snap_producao_recomendada INTEGER",
            "snap_estoque_ideal_qtd REAL", "snap_demanda_ajustada REAL",
        ];
        for col in &snap_cols {
            let _ = conn.execute(&format!("ALTER TABLE historico_producao ADD COLUMN {}", col), []);
        }

        // Migrations: base control columns in historico_producao
        let _ = conn.execute("ALTER TABLE historico_producao ADD COLUMN consume_base INTEGER DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE historico_producao ADD COLUMN base_code TEXT", []);

        // Initialize watch config defaults if not set
        let _ = conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('watch_pasta', 'c:\\Users\\Edson\\antigravity\\Natum\\PlanilhasBase')",
            [],
        );
        let _ = conn.execute(
            "UPDATE settings SET value = 'c:\\Users\\Edson\\antigravity\\Natum\\PlanilhasBase' WHERE key = 'watch_pasta' AND value = 'PlanilhasBase'",
            [],
        );
        let _ = conn.execute(
            "UPDATE settings SET value = 'c:\\Users\\Edson\\antigravity\\Natum\\PlanilhasBase' WHERE key = 'watch_pasta' AND value = 'c:\\Users\\Edson\\antigravity\\Natum\\Producao\\PlanilhasBase'",
            [],
        );
        let _ = conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('watch_threshold_levantamento', '7')",
            [],
        );
        let _ = conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('watch_threshold_faturamento', '30')",
            [],
        );
        let _ = conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('watch_ativo', '1')",
            [],
        );


        println!("Database initialized successfully at: {}", self.db_path);
        Ok(())
    }

    pub fn get_line_configs(&self) -> Result<Vec<LineConfig>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT linha_prefix, nome_linha, estoque_ideal_mult, abrir_ordem_mult, abrir_prod_mult, fator_seguranca_z, visivel FROM config_linhas"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(LineConfig {
                linha_prefix: row.get(0)?,
                nome_linha: row.get(1)?,
                estoque_ideal_mult: row.get(2)?,
                abrir_ordem_mult: row.get(3)?,
                abrir_prod_mult: row.get(4)?,
                fator_seguranca_z: row.get(5)?,
                visivel: row.get(6)?,
            })
        })?;

        let mut configs = Vec::new();
        for r in rows {
            configs.push(r?);
        }
        Ok(configs)
    }

    pub fn update_line_config(&self, config: &LineConfig) -> Result<()> {
        let conn = self.connect()?;
        let vis = config.visivel.unwrap_or(1);
        conn.execute(
            "INSERT INTO config_linhas (linha_prefix, nome_linha, estoque_ideal_mult, abrir_ordem_mult, abrir_prod_mult, fator_seguranca_z, visivel)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(linha_prefix) DO UPDATE SET
                nome_linha = excluded.nome_linha,
                estoque_ideal_mult = excluded.estoque_ideal_mult,
                abrir_ordem_mult = excluded.abrir_ordem_mult,
                abrir_prod_mult = excluded.abrir_prod_mult,
                fator_seguranca_z = excluded.fator_seguranca_z,
                visivel = excluded.visivel",
            params![
                config.linha_prefix,
                config.nome_linha,
                config.estoque_ideal_mult,
                config.abrir_ordem_mult,
                config.abrir_prod_mult,
                config.fator_seguranca_z,
                vis
            ],
        )?;
        Ok(())
    }

    pub fn delete_line_config(&self, prefix: &str) -> Result<()> {
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        tx.execute(
            "UPDATE produtos SET linha_prefix = 'DEFAULT' WHERE linha_prefix = ?1",
            params![prefix],
        )?;
        tx.execute(
            "UPDATE overrides_produtos SET linha_prefix_manual = 'DEFAULT' WHERE linha_prefix_manual = ?1",
            params![prefix],
        )?;
        tx.execute(
            "DELETE FROM config_linhas WHERE linha_prefix = ?1",
            params![prefix],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn get_override(&self, codigo: &str) -> Result<Option<ProductOverride>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT codigo, estoque_ideal_manual, pedidos_manual, media_manual, is_lancamento_manual, visivel, observacao, linha_prefix_manual, status_produto, categoria_produto, produzir_apenas_kit, lancamento_meta_meses, lancamento_data_inicio 
             FROM overrides_produtos WHERE codigo = ?1"
        )?;
        let mut rows = stmt.query_map(params![codigo], |row| {
            Ok(ProductOverride {
                codigo: row.get(0)?,
                estoque_ideal_manual: row.get(1)?,
                pedidos_manual: row.get(2)?,
                media_manual: row.get(3)?,
                is_lancamento_manual: row.get(4)?,
                visivel: row.get(5)?,
                observacao: row.get(6)?,
                linha_prefix_manual: row.get(7)?,
                status_produto: row.get(8)?,
                categoria_produto: row.get(9)?,
                produzir_apenas_kit: row.get(10)?,
                lancamento_meta_meses: row.get(11)?,
                lancamento_data_inicio: row.get(12)?,
            })
        })?;

        if let Some(r) = rows.next() {
            Ok(Some(r?))
        } else {
            Ok(None)
        }
    }

    pub fn get_all_overrides(&self) -> Result<Vec<ProductOverride>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT codigo, estoque_ideal_manual, pedidos_manual, media_manual, is_lancamento_manual, visivel, observacao, linha_prefix_manual, status_produto, categoria_produto, produzir_apenas_kit, lancamento_meta_meses, lancamento_data_inicio 
             FROM overrides_produtos"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ProductOverride {
                codigo: row.get(0)?,
                estoque_ideal_manual: row.get(1)?,
                pedidos_manual: row.get(2)?,
                media_manual: row.get(3)?,
                is_lancamento_manual: row.get(4)?,
                visivel: row.get(5)?,
                observacao: row.get(6)?,
                linha_prefix_manual: row.get(7)?,
                status_produto: row.get(8)?,
                categoria_produto: row.get(9)?,
                produzir_apenas_kit: row.get(10)?,
                lancamento_meta_meses: row.get(11)?,
                lancamento_data_inicio: row.get(12)?,
            })
        })?;

        let mut overrides = Vec::new();
        for r in rows {
            overrides.push(r?);
        }
        Ok(overrides)
    }

    pub fn save_override(&self, ovr: &ProductOverride) -> Result<()> {
        let conn = self.connect()?;
        // If all overrides are null/None, delete the entry so it doesn't clutter DB
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
        {
            conn.execute("DELETE FROM overrides_produtos WHERE codigo = ?1", params![ovr.codigo])?;
        } else {
            conn.execute(
                "INSERT INTO overrides_produtos (codigo, estoque_ideal_manual, pedidos_manual, media_manual, is_lancamento_manual, visivel, observacao, linha_prefix_manual, status_produto, categoria_produto, produzir_apenas_kit, lancamento_meta_meses, lancamento_data_inicio)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(codigo) DO UPDATE SET
                    estoque_ideal_manual = excluded.estoque_ideal_manual,
                    pedidos_manual = excluded.pedidos_manual,
                    media_manual = excluded.media_manual,
                    is_lancamento_manual = excluded.is_lancamento_manual,
                    visivel = excluded.visivel,
                    observacao = excluded.observacao,
                    linha_prefix_manual = excluded.linha_prefix_manual,
                    status_produto = excluded.status_produto,
                    categoria_produto = excluded.categoria_produto,
                    produzir_apenas_kit = excluded.produzir_apenas_kit,
                    lancamento_meta_meses = excluded.lancamento_meta_meses,
                    lancamento_data_inicio = excluded.lancamento_data_inicio",
                params![
                    ovr.codigo, 
                    ovr.estoque_ideal_manual, 
                    ovr.pedidos_manual, 
                    ovr.media_manual,
                    ovr.is_lancamento_manual,
                    ovr.visivel,
                    ovr.observacao,
                    ovr.linha_prefix_manual,
                    ovr.status_produto,
                    ovr.categoria_produto,
                    ovr.produzir_apenas_kit,
                    ovr.lancamento_meta_meses,
                    ovr.lancamento_data_inicio
                ],
            )?;
        }
        Ok(())
    }

    pub fn save_override_bulk(&self, req: &BulkOverrideRequest) -> Result<()> {
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;

        for codigo in &req.codigos {
            // First, make sure the product exists in overrides_produtos table
            tx.execute(
                "INSERT OR IGNORE INTO overrides_produtos (codigo) VALUES (?1)",
                params![codigo],
            )?;

            // Apply specific action
            match req.action.as_str() {
                "hide" => {
                    tx.execute(
                        "UPDATE overrides_produtos SET visivel = 0 WHERE codigo = ?1",
                        params![codigo],
                    )?;
                }
                "show" => {
                    tx.execute(
                        "UPDATE overrides_produtos SET visivel = 1 WHERE codigo = ?1",
                        params![codigo],
                    )?;
                }
                "set_launch_auto" => {
                    tx.execute(
                        "UPDATE overrides_produtos SET is_lancamento_manual = NULL WHERE codigo = ?1",
                        params![codigo],
                    )?;
                }
                "set_launch_yes" => {
                    tx.execute(
                        "UPDATE overrides_produtos SET is_lancamento_manual = 1 WHERE codigo = ?1",
                        params![codigo],
                    )?;
                }
                "set_launch_no" => {
                    tx.execute(
                        "UPDATE overrides_produtos SET is_lancamento_manual = 0 WHERE codigo = ?1",
                        params![codigo],
                    )?;
                }
                "set_obs" => {
                    let obs = req.value_str.as_ref().filter(|s| !s.trim().is_empty());
                    tx.execute(
                        "UPDATE overrides_produtos SET observacao = ?2 WHERE codigo = ?1",
                        params![codigo, obs],
                    )?;
                }
                "set_line" => {
                    let line = req.value_str.as_ref().filter(|s| s.as_str() != "AUTO");
                    tx.execute(
                        "UPDATE overrides_produtos SET linha_prefix_manual = ?2 WHERE codigo = ?1",
                        params![codigo, line],
                    )?;
                }
                "set_status" => {
                    let status = req.value_str.as_ref().filter(|s| !s.trim().is_empty());
                    tx.execute(
                        "UPDATE overrides_produtos SET status_produto = ?2 WHERE codigo = ?1",
                        params![codigo, status],
                    )?;
                }
                "set_category" => {
                    let cat = req.value_str.as_ref().filter(|s| !s.trim().is_empty() && s.as_str() != "AUTO");
                    tx.execute(
                        "UPDATE overrides_produtos SET categoria_produto = ?2 WHERE codigo = ?1",
                        params![codigo, cat],
                    )?;
                }
                "clear" => {
                    tx.execute(
                        "DELETE FROM overrides_produtos WHERE codigo = ?1",
                        params![codigo],
                    )?;
                }
                _ => {}
            }

            // Cleanup: if all override fields are NULL
            tx.execute(
                "DELETE FROM overrides_produtos 
                 WHERE codigo = ?1 
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
                params![codigo],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
        if let Some(r) = rows.next() {
            Ok(Some(r?))
        } else {
            Ok(None)
        }
    }

    pub fn save_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_kit_composition(&self) -> Result<HashMap<String, Vec<String>>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare("SELECT kit_codigo, componente_codigo FROM kit_composicao")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut map: HashMap<String, Vec<String>> = HashMap::new();
        for r in rows {
            let (kit, comp) = r?;
            map.entry(kit).or_default().push(comp);
        }
        Ok(map)
    }

    pub fn add_producao_entry(&self, entry: &crate::models::NewProducaoEntry) -> Result<i64> {
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;

        // 1. Inserir no histórico de produção com snapshot
        tx.execute(
            "INSERT INTO historico_producao (data_producao, codigo, quantidade, observacoes,
             snap_estoque, snap_producao, snap_pedidos, snap_efp, snap_media_vendas,
             snap_duracao_meses, snap_status, snap_status_label, snap_producao_recomendada,
             snap_estoque_ideal_qtd, snap_demanda_ajustada, consume_base, base_code)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                entry.data_producao,
                entry.codigo,
                entry.quantidade,
                entry.observacoes,
                entry.snap_estoque,
                entry.snap_producao,
                entry.snap_pedidos,
                entry.snap_efp,
                entry.snap_media_vendas,
                entry.snap_duracao_meses,
                entry.snap_status,
                entry.snap_status_label,
                entry.snap_producao_recomendada,
                entry.snap_estoque_ideal_qtd,
                entry.snap_demanda_ajustada,
                if entry.consume_base.unwrap_or(false) { 1 } else { 0 },
                entry.base_code
            ],
        )?;
        let insert_id = tx.last_insert_rowid();

        // 2. Garantir que o produto existe em estoque_atual
        tx.execute(
            "INSERT OR IGNORE INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
             VALUES (?1, 0, 0, 0, NULL)",
            params![entry.codigo],
        )?;

        // 3. Incrementar a quantidade de produção ativa em estoque_atual
        tx.execute(
            "UPDATE estoque_atual SET producao = producao + ?1 WHERE codigo = ?2",
            params![entry.quantidade, entry.codigo],
        )?;

        // 4. Se consumir a base, dar baixa no estoque da base
        if entry.consume_base.unwrap_or(false) {
            if let Some(ref b_code) = entry.base_code {
                tx.execute(
                    "INSERT OR IGNORE INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
                     VALUES (?1, 0, 0, 0, NULL)",
                    params![b_code],
                )?;
                tx.execute(
                    "UPDATE estoque_atual SET estoque = MAX(0, estoque - ?1) WHERE codigo = ?2",
                    params![entry.quantidade, b_code],
                )?;
            }
        }

        tx.commit()?;
        Ok(insert_id)
    }

    pub fn delete_producao_entry(&self, id: i64) -> Result<()> {
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;

        // Obter os detalhes da entrada antes de deletar
        let record_opt = {
            let mut stmt = tx.prepare("SELECT codigo, quantidade, consume_base, base_code FROM historico_producao WHERE id = ?1")?;
            stmt.query_row(params![id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Option<i32>>(2)?,
                    row.get::<_, Option<String>>(3)?
                ))
            })
        };

        if let Ok((codigo, qty, consume_base, base_code)) = record_opt {
            // Remover da tabela historico_producao
            tx.execute("DELETE FROM historico_producao WHERE id = ?1", params![id])?;

            // Decrementar a quantidade de produção ativa em estoque_atual (com mínimo 0)
            tx.execute(
                "UPDATE estoque_atual SET producao = MAX(0, producao - ?1) WHERE codigo = ?2",
                params![qty, codigo],
            )?;

            // Se consumiu a base, devolver a quantidade ao estoque da base
            if consume_base.unwrap_or(0) == 1 {
                if let Some(ref b_code) = base_code {
                    tx.execute(
                        "INSERT OR IGNORE INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
                         VALUES (?1, 0, 0, 0, NULL)",
                        params![b_code],
                    )?;
                    tx.execute(
                        "UPDATE estoque_atual SET estoque = estoque + ?1 WHERE codigo = ?2",
                        params![qty, b_code],
                    )?;
                }
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn list_producao_history(&self, params: &crate::models::HistoryQueryParams) -> Result<Vec<crate::models::ProducaoHistoryRecord>> {
        let conn = self.connect()?;
        
        let mut query = String::from(
            "SELECT h.id, h.data_producao, h.codigo, p.descricao, 
                    COALESCE(o.linha_prefix_manual, p.linha_prefix) as resolved_linha_prefix,
                    cl.nome_linha, h.quantidade, h.observacoes, h.criado_em,
                    h.snap_estoque, h.snap_producao, h.snap_pedidos, h.snap_efp,
                    h.snap_media_vendas, h.snap_duracao_meses, h.snap_status,
                    h.snap_status_label, h.snap_producao_recomendada, h.snap_estoque_ideal_qtd,
                    h.snap_demanda_ajustada, h.consume_base, h.base_code
             FROM historico_producao h
             LEFT JOIN produtos p ON h.codigo = p.codigo
             LEFT JOIN overrides_produtos o ON h.codigo = o.codigo
             LEFT JOIN config_linhas cl ON COALESCE(o.linha_prefix_manual, p.linha_prefix) = cl.linha_prefix
             WHERE 1=1"
        );
        
        let mut sql_params: Vec<String> = Vec::new();
        
        if let Some(ref search) = params.search {
            if !search.trim().is_empty() {
                query.push_str(" AND (h.codigo LIKE ? OR p.descricao LIKE ?)");
                let term = format!("%{}%", search.trim());
                sql_params.push(term.clone());
                sql_params.push(term);
            }
        }
        
        if let Some(ref linha) = params.linha {
            if !linha.trim().is_empty() && linha != "ALL" {
                query.push_str(" AND COALESCE(o.linha_prefix_manual, p.linha_prefix) = ?");
                sql_params.push(linha.trim().to_string());
            }
        }
        
        if let Some(ref data) = params.data {
            if !data.trim().is_empty() {
                query.push_str(" AND h.data_producao = ?");
                sql_params.push(data.trim().to_string());
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
        query.push_str(&format!(" ORDER BY {} {}, h.criado_em DESC", sort_col, sort_dir));
        
        let mut stmt = conn.prepare(&query)?;
        
        let param_refs: Vec<&dyn rusqlite::ToSql> = sql_params.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        
        let rows = stmt.query_map(&param_refs[..], |row| {
            Ok(crate::models::ProducaoHistoryRecord {
                id: row.get(0)?,
                data_producao: row.get(1)?,
                codigo: row.get(2)?,
                descricao: row.get(3)?,
                linha_prefix: row.get(4)?,
                nome_linha: row.get(5)?,
                quantidade: row.get(6)?,
                observacoes: row.get(7)?,
                criado_em: row.get(8)?,
                snap_estoque: row.get(9)?,
                snap_producao: row.get(10)?,
                snap_pedidos: row.get(11)?,
                snap_efp: row.get(12)?,
                snap_media_vendas: row.get(13)?,
                snap_duracao_meses: row.get(14)?,
                snap_status: row.get(15)?,
                snap_status_label: row.get(16)?,
                snap_producao_recomendada: row.get(17)?,
                snap_estoque_ideal_qtd: row.get(18)?,
                snap_demanda_ajustada: row.get(19)?,
                consume_base: Some(row.get::<_, Option<i32>>(20)?.unwrap_or(0) == 1),
                base_code: row.get(21)?,
            })
        })?;
        
        let mut records = Vec::new();
        for r in rows {
            records.push(r?);
        }
        Ok(records)
    }

    // ===== KIT COMPOSICAO CRUD =====

    pub fn get_kit_composition_full(&self) -> Result<Vec<crate::models::KitComposicaoRow>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT kc.kit_codigo, pk.descricao as kit_desc, kc.componente_codigo, pc.descricao as comp_desc
             FROM kit_composicao kc
             JOIN produtos pk ON kc.kit_codigo = pk.codigo
             JOIN produtos pc ON kc.componente_codigo = pc.codigo
             ORDER BY pk.descricao, pc.descricao"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(crate::models::KitComposicaoRow {
                kit_codigo: row.get(0)?,
                kit_descricao: row.get(1)?,
                componente_codigo: row.get(2)?,
                componente_descricao: row.get(3)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn add_kit_composicao(&self, kit_codigo: &str, componente_codigo: &str) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT OR IGNORE INTO kit_composicao (kit_codigo, componente_codigo) VALUES (?1, ?2)",
            params![kit_codigo, componente_codigo],
        )?;
        Ok(())
    }

    pub fn delete_kit_composicao(&self, kit_codigo: &str, componente_codigo: &str) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            "DELETE FROM kit_composicao WHERE kit_codigo = ?1 AND componente_codigo = ?2",
            params![kit_codigo, componente_codigo],
        )?;
        Ok(())
    }

    pub fn delete_all_kit_composicao(&self) -> Result<()> {
        let conn = self.connect()?;
        conn.execute("DELETE FROM kit_composicao", [])?;
        Ok(())
    }

    // ===== IMPORT HISTORY =====

    pub fn record_import(&self, tipo: &str, nome_arquivo: &str, registros: i64, status: &str, mensagem: Option<&str>) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO historico_importacoes (tipo, nome_arquivo, registros, status, mensagem) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![tipo, nome_arquivo, registros, status, mensagem],
        )?;
        Ok(())
    }

    pub fn get_import_history(&self) -> Result<Vec<crate::models::ImportRecord>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, tipo, nome_arquivo, importado_em, registros, status, mensagem
             FROM historico_importacoes ORDER BY importado_em DESC LIMIT 100"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(crate::models::ImportRecord {
                id: row.get(0)?,
                tipo: row.get(1)?,
                nome_arquivo: row.get(2)?,
                importado_em: row.get(3)?,
                registros: row.get(4)?,
                status: row.get(5)?,
                mensagem: row.get(6)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    pub fn get_import_status(&self) -> Result<Vec<crate::models::ImportStatus>> {
        let conn = self.connect()?;
        let tipos = ["levantamento", "faturamento", "kits"];
        let mut result = Vec::new();
        for tipo in &tipos {
            let row = conn.query_row(
                "SELECT nome_arquivo, importado_em, 
                 CAST(julianday('now') - julianday(importado_em) AS INTEGER) as dias
                 FROM historico_importacoes WHERE tipo = ?1 AND status = 'success'
                 ORDER BY importado_em DESC LIMIT 1",
                params![tipo],
                |row| Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                )),
            );
            match row {
                Ok((arquivo, quando, dias)) => result.push(crate::models::ImportStatus {
                    tipo: tipo.to_string(),
                    ultimo_arquivo: Some(arquivo),
                    importado_em: Some(quando),
                    dias_sem_importar: Some(dias),
                }),
                Err(_) => result.push(crate::models::ImportStatus {
                    tipo: tipo.to_string(),
                    ultimo_arquivo: None,
                    importado_em: None,
                    dias_sem_importar: None,
                }),
            }
        }
        Ok(result)
    }

    // ===== WATCH CONFIG (settings table) =====

    pub fn get_watch_config(&self) -> Result<crate::models::WatchConfig> {
        Ok(crate::models::WatchConfig {
            pasta: self.get_setting("watch_pasta")?.unwrap_or_else(|| "PlanilhasBase".to_string()),
            threshold_levantamento_dias: self.get_setting("watch_threshold_levantamento")?
                .and_then(|v| v.parse().ok()).unwrap_or(7),
            threshold_faturamento_dias: self.get_setting("watch_threshold_faturamento")?
                .and_then(|v| v.parse().ok()).unwrap_or(30),
            ativo: self.get_setting("watch_ativo")?
                .map(|v| v == "1").unwrap_or(true),
        })
    }

    pub fn save_watch_config(&self, cfg: &crate::models::WatchConfig) -> Result<()> {
        self.save_setting("watch_pasta", &cfg.pasta)?;
        self.save_setting("watch_threshold_levantamento", &cfg.threshold_levantamento_dias.to_string())?;
        self.save_setting("watch_threshold_faturamento", &cfg.threshold_faturamento_dias.to_string())?;
        self.save_setting("watch_ativo", if cfg.ativo { "1" } else { "0" })?;
        Ok(())
    }

    pub fn get_already_imported_files(&self, tipo: &str) -> Result<std::collections::HashSet<String>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT nome_arquivo FROM historico_importacoes WHERE tipo = ?1 AND status = 'success'"
        )?;
        let rows = stmt.query_map(params![tipo], |row| row.get::<_, String>(0))?;
        let mut set = std::collections::HashSet::new();
        for r in rows { set.insert(r?); }
        Ok(set)
    }
}

