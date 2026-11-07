//! Limite de tentativas do login: 5 falhas por nome em 5 minutos bloqueiam novas tentativas
//! daquele nome até a falha mais antiga sair da janela (decisão do Edson, 2026-11-07).
//!
//! Em memória: reiniciar o servidor zera a contagem (aceitável: o objetivo é frear tentativa
//! repetida de adivinhar senha). Nome inexistente conta igual, para não revelar quais nomes existem.
//! Não há limite por IP: o servidor não expõe o IP real do cliente (só o que o cliente declara).

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

pub const MAX_FALHAS: usize = 5;
pub const JANELA: Duration = Duration::from_secs(5 * 60);
/// Teto de nomes distintos guardados (tentar milhares de nomes inventados não pode encher a memória).
const MAX_NOMES: usize = 5000;

#[derive(Default)]
pub struct LimitadorLogin {
    falhas: Mutex<HashMap<String, Vec<Instant>>>,
}

impl LimitadorLogin {
    fn chave(nome: &str) -> String {
        nome.trim().to_lowercase()
    }

    fn podar(mapa: &mut HashMap<String, Vec<Instant>>, agora: Instant) {
        mapa.retain(|_, v| {
            v.retain(|t| agora.duration_since(*t) < JANELA);
            !v.is_empty()
        });
    }

    /// `Some(espera)` se o nome está bloqueado agora; `None` se pode tentar.
    pub fn bloqueado(&self, nome: &str, agora: Instant) -> Option<Duration> {
        let mut mapa = self.falhas.lock().unwrap_or_else(|e| e.into_inner());
        let v = mapa.get_mut(&Self::chave(nome))?;
        v.retain(|t| agora.duration_since(*t) < JANELA);
        if v.len() >= MAX_FALHAS {
            let mais_antiga = v[0];
            Some(JANELA.saturating_sub(agora.duration_since(mais_antiga)))
        } else {
            None
        }
    }

    pub fn registrar_falha(&self, nome: &str, agora: Instant) {
        let mut mapa = self.falhas.lock().unwrap_or_else(|e| e.into_inner());
        if mapa.len() >= MAX_NOMES {
            Self::podar(&mut mapa, agora);
            if mapa.len() >= MAX_NOMES {
                mapa.clear();
            }
        }
        mapa.entry(Self::chave(nome)).or_default().push(agora);
    }

    pub fn limpar(&self, nome: &str) {
        let mut mapa = self.falhas.lock().unwrap_or_else(|e| e.into_inner());
        mapa.remove(&Self::chave(nome));
    }
}

pub fn global() -> &'static LimitadorLogin {
    static L: OnceLock<LimitadorLogin> = OnceLock::new();
    L.get_or_init(LimitadorLogin::default)
}

/// Texto da resposta 429 (minutos arredondados para cima).
pub fn mensagem_bloqueio(espera: Duration) -> String {
    let min = (espera.as_secs() + 59) / 60;
    format!(
        "Muitas tentativas de login. Tente novamente em {} min.",
        min.max(1)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bloqueia_na_quinta_falha_e_libera_depois_da_janela() {
        let l = LimitadorLogin::default();
        let t0 = Instant::now();
        for i in 0..4 {
            l.registrar_falha("Edson", t0 + Duration::from_secs(i));
            assert!(l.bloqueado("Edson", t0 + Duration::from_secs(i)).is_none());
        }
        l.registrar_falha("Edson", t0 + Duration::from_secs(4));
        let espera = l.bloqueado("edson ", t0 + Duration::from_secs(10)).expect("bloqueado");
        assert!(espera <= JANELA && espera > Duration::from_secs(280));
        // a falha mais antiga sai da janela: volta a poder tentar
        assert!(l.bloqueado("Edson", t0 + JANELA + Duration::from_secs(1)).is_none());
    }

    #[test]
    fn sucesso_zera_e_nomes_sao_independentes() {
        let l = LimitadorLogin::default();
        let t0 = Instant::now();
        for _ in 0..5 {
            l.registrar_falha("ana", t0);
        }
        assert!(l.bloqueado("ana", t0).is_some());
        assert!(l.bloqueado("bia", t0).is_none());
        l.limpar("ANA");
        assert!(l.bloqueado("ana", t0).is_none());
    }

    #[test]
    fn mensagem_arredonda_minutos_para_cima() {
        assert!(mensagem_bloqueio(Duration::from_secs(61)).contains("2 min"));
        assert!(mensagem_bloqueio(Duration::from_secs(1)).contains("1 min"));
    }
}
