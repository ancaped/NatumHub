//! Avisos de erro no sino do Nexus: quando algo importante quebra em silêncio, o supervisor é avisado.
//! Um aviso por tipo a cada 6 horas (em memória; reiniciar o servidor zera o limite).

use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::modules::geral::auth::modules_registry::MODULE_CONFIGURACOES;
use crate::modules::geral::notifications::store;

const INTERVALO_MINIMO: Duration = Duration::from_secs(6 * 3600);
const JANELA_500: Duration = Duration::from_secs(10 * 60);
const LIMITE_500: u32 = 20;

/// Decide se um novo aviso do tipo pode sair, dado o último envio.
pub fn deve_alertar(ultimo: Option<Instant>, agora: Instant) -> bool {
    match ultimo {
        None => true,
        Some(t) => agora.saturating_duration_since(t) >= INTERVALO_MINIMO,
    }
}

fn ultimos() -> &'static Mutex<HashMap<&'static str, Instant>> {
    static M: OnceLock<Mutex<HashMap<&'static str, Instant>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Grava o aviso no sino (kind `error`) se o tipo não foi avisado nas últimas 6 horas.
/// Não grava auditoria: pode ser chamado de dentro da própria auditoria sem recursão.
pub async fn alertar(pool: &PgPool, tipo: &'static str, titulo: &str, mensagem: &str) {
    let agora = Instant::now();
    {
        let mut mapa = match ultimos().lock() {
            Ok(m) => m,
            Err(p) => p.into_inner(),
        };
        if !deve_alertar(mapa.get(tipo).copied(), agora) {
            return;
        }
        mapa.insert(tipo, agora);
    }
    if let Err(e) = store::create_notification(pool, MODULE_CONFIGURACOES, "error", titulo, mensagem, None).await {
        eprintln!("[alertas] não foi possível gravar o aviso '{tipo}': {e}");
    }
}

/// Janela deslizante simples dos erros 500: devolve o total quando passa do limite.
pub struct Janela500 {
    inicio: Option<Instant>,
    total: u32,
}

impl Janela500 {
    pub const fn nova() -> Self {
        Self { inicio: None, total: 0 }
    }

    pub fn registrar(&mut self, agora: Instant) -> Option<u32> {
        match self.inicio {
            Some(i) if agora.saturating_duration_since(i) < JANELA_500 => self.total += 1,
            _ => {
                self.inicio = Some(agora);
                self.total = 1;
            }
        }
        (self.total > LIMITE_500).then_some(self.total)
    }
}

/// Conta uma resposta 500 e avisa se passou de 20 em 10 minutos. Só a rota entra na mensagem.
pub async fn registrar_500(pool: &PgPool, rota: &str) {
    static J: Mutex<Janela500> = Mutex::new(Janela500::nova());
    let total = {
        let mut j = match J.lock() {
            Ok(j) => j,
            Err(p) => p.into_inner(),
        };
        j.registrar(Instant::now())
    };
    if let Some(n) = total {
        alertar(
            pool,
            "erros_500",
            "Muitos erros no servidor",
            &format!("{n} respostas com erro 500 nos últimos 10 minutos; a última em {rota}"),
        )
        .await;
    }
}

/// Checagem periódica (30 min): avisa se o último sync do ERP bem-sucedido tem mais de 8 horas.
pub async fn vigiar_sync_erp(pool: PgPool) {
    let mut tick = tokio::time::interval(Duration::from_secs(30 * 60));
    loop {
        tick.tick().await;
        let r: Result<(Option<bool>, Option<String>), sqlx::Error> = sqlx::query_as(
            "SELECT (NOW() - MAX(imported_at::timestamptz)) > INTERVAL '8 hours',
                    to_char(MAX(imported_at::timestamptz) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
             FROM stock_imports WHERE source = 'ERP'",
        )
        .fetch_one(&pool)
        .await;
        if let Ok((Some(true), Some(quando))) = r {
            alertar(
                &pool,
                "sync_atrasado",
                "Sync do ERP atrasado",
                &format!("Último sync bem-sucedido em {quando}; a ponte pode ter caído."),
            )
            .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limitador_de_6_horas() {
        let t0 = Instant::now();
        assert!(deve_alertar(None, t0));
        assert!(!deve_alertar(Some(t0), t0 + Duration::from_secs(3600)));
        assert!(deve_alertar(Some(t0), t0 + Duration::from_secs(6 * 3600)));
    }

    #[test]
    fn janela_500_passa_de_20() {
        let t0 = Instant::now();
        let mut j = Janela500::nova();
        for _ in 0..20 {
            assert_eq!(j.registrar(t0), None);
        }
        assert_eq!(j.registrar(t0), Some(21));
        // janela vencida recomeça
        assert_eq!(j.registrar(t0 + Duration::from_secs(11 * 60)), None);
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn alertar_grava_notificacao_uma_vez() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let titulo = "Teste alerta M1";
        alertar(&pool, "teste_m1", titulo, "mensagem de teste").await;
        alertar(&pool, "teste_m1", titulo, "segunda, deve ser ignorada").await;
        let (n, kind): (i64, Option<String>) = sqlx::query_as(
            "SELECT COUNT(*), MAX(kind) FROM hub_notifications WHERE title = $1",
        )
        .bind(titulo)
        .fetch_one(&pool)
        .await
        .unwrap();
        sqlx::query("DELETE FROM hub_notifications WHERE title = $1")
            .bind(titulo)
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(n, 1);
        assert_eq!(kind.as_deref(), Some("error"));
    }
}
