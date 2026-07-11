use rusqlite::{params, Connection};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open("../Saves/data.db")?;
    
    let ids_to_resolve = vec![
        "78c8fae6-e40b-49b3-b817-e216c6445044", // Erros de Pesagem, Envase e Conferência
        "101be5be-3dd3-49d3-bc7c-e088f9ddcdf7", // Módulos separados do Compras
        "98ba755a-5ce9-4d72-a5e5-95278d51aedb", // Bug de itens nos Pedidos
        "18c7c54f-d269-40d8-8f03-351b0ac0c6ac", // Usado em produtos com nomes corretos
        "9d7dcd89-eba0-485e-8756-1ff1d2e53424", // Navegação/sidebar do estoque
        "255f5e8b-c7f8-4823-a7de-c6996b6fabd6", // Lotes com multi-produtos e unidade kg
        "86c40000-a4ed-46e2-a693-a583f66bdaaa", // Lotes agrupados por lote_number e pesagem consolidada
        "fbeb91e7-5d8c-4428-b794-41bf08a77094", // Embalagens fictícias quando sem cadastro
        "a8861c49-95d8-4a6d-9e7b-d12d30c9c506", // Itens não sincronizados no envase
        "d17d7411-d009-4178-94fc-83bfca9f6735", // Lotes não-EA não mostrar lançamento conferência
        "4247d0c4-419e-4393-8d03-2c057a80f81c", // Erro ao abrir detalhes do produto
        "6e75e45c-f9e9-4dfc-a7b4-4894e6b375d8", // Novo módulo de vendas, correção de estoque e histórico vendas
    ];

    println!("Resolving feedbacks in SQLite...");
    for id in &ids_to_resolve {
        let count = conn.execute(
            "UPDATE feedbacks SET status = 'resolved', resolvedAt = datetime('now', 'localtime') WHERE id = ?1",
            params![id],
        )?;
        println!("  Feedback ID {}: {} row(s) updated.", id, count);
    }

    println!("\nRegenerating feedback.md...");
    sync_feedback_md(&conn)?;
    println!("feedback.md successfully regenerated.");

    Ok(())
}

fn get_root_feedback_md_path() -> std::path::PathBuf {
    if let Ok(mut path) = std::env::current_exe() {
        while path.pop() {
            if path.join("Backend").is_dir() && path.join("Frontend").is_dir() {
                return path.join("feedback.md");
            }
        }
    }
    std::path::PathBuf::from("../../feedback.md")
}

fn sync_feedback_md(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    let mut stmt = conn.prepare(
        "SELECT id, type, description, page, logs, status, createdAt, resolvedAt FROM feedbacks ORDER BY createdAt DESC"
    )?;
    
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, Option<String>>(7)?,
        ))
    })?;

    let mut bugs_pending = Vec::new();
    let mut feed_pending = Vec::new();
    let mut resolved = Vec::new();
    let mut logs_section = String::new();

    for r in rows {
        let (id, fb_type, desc, page, logs, status, created, resolved_at) = r?;
        
        let desc_clean = desc.replace('\n', " ").replace('|', "\\|");
        let page_clean = page.replace('\n', " ").replace('|', "\\|");
        let date_clean = created.split('T').next().unwrap_or("-").split(' ').next().unwrap_or("-").to_string();
        let short_id = id.get(0..8).unwrap_or(&id);

        if status == "resolved" {
            let res_date = resolved_at.as_deref().unwrap_or("-").split('T').next().unwrap_or("-").split(' ').next().unwrap_or("-").to_string();
            resolved.push(format!(
                "| `{}` | {} | {} | `{}` | {} | {} |",
                short_id,
                date_clean,
                if fb_type == "bug" { "🔴 Bug" } else { "🔵 Sugestão" },
                page_clean,
                desc_clean,
                res_date
            ));
        } else if fb_type == "bug" {
            let log_ref = if !logs.trim().is_empty() {
                format!("[Ver Logs](#bug-log-{})", short_id)
            } else {
                "-".to_string()
            };
            bugs_pending.push(format!(
                "| `{}` | {} | `{}` | {} | {} |",
                short_id,
                date_clean,
                page_clean,
                desc_clean,
                log_ref
            ));
            
            if !logs.trim().is_empty() {
                logs_section.push_str(&format!(
                    "### bug-log-{}\n\n**Página:** `{}`  \n**Descrição:** {}  \n\n```json\n{}\n```\n\n",
                    short_id, page_clean, desc_clean, logs
                ));
            }
        } else {
            feed_pending.push(format!(
                "| `{}` | {} | `{}` | {} |",
                short_id,
                date_clean,
                page_clean,
                desc_clean
            ));
        }
    }

    let mut md = String::new();
    md.push_str("# Feedback e Relatórios de Bugs - NatumHub\n\n");
    md.push_str("Este arquivo é gerado automaticamente pelo aplicativo NatumHub a partir dos feedbacks enviados pelo painel flutuante. Ele serve para que desenvolvedores e IAs possam analisar e corrigir problemas rapidamente.\n\n");

    md.push_str("## 🔴 Bugs Pendentes\n\n");
    if bugs_pending.is_empty() {
        md.push_str("Nenhum bug pendente! 🎉\n\n");
    } else {
        md.push_str("| ID | Data | Página | Descrição | Logs |\n");
        md.push_str("| --- | --- | --- | --- | --- |\n");
        for b in bugs_pending {
            md.push_str(&b);
            md.push_str("\n");
        }
        md.push_str("\n");
    }

    md.push_str("## 🔵 Sugestões / Feedbacks Pendentes\n\n");
    if feed_pending.is_empty() {
        md.push_str("Nenhuma sugestão pendente.\n\n");
    } else {
        md.push_str("| ID | Data | Página | Descrição |\n");
        md.push_str("| --- | --- | --- | --- |\n");
        for f in feed_pending {
            md.push_str(&f);
            md.push_str("\n");
        }
        md.push_str("\n");
    }

    md.push_str("## 🟢 Resolvidos\n\n");
    if resolved.is_empty() {
        md.push_str("Nenhum item resolvido ainda.\n\n");
    } else {
        md.push_str("| ID | Data | Tipo | Página | Descrição | Resolvido Em |\n");
        md.push_str("| --- | --- | --- | --- | --- | --- |\n");
        for r in resolved {
            md.push_str(&r);
            md.push_str("\n");
        }
        md.push_str("\n");
    }

    if !logs_section.is_empty() {
        md.push_str("## 📋 Logs de Erros\n\n");
        md.push_str(&logs_section);
    }

    let path = get_root_feedback_md_path();
    std::fs::write(&path, &md)?;

    Ok(())
}
