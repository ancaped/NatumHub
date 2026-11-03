//! Feriados nacionais do Brasil e dia útil, para o planejamento no servidor.
//!
//! Porta fiel de `Frontend/src/modules/geral/lib/brazilHolidays.ts` (a tela usa a mesma lista):
//! feriados fixos + os que andam com a Páscoa (Carnaval, Quarta-feira de Cinzas, Sexta-feira Santa, Corpus Christi).

use chrono::{Datelike, Duration, NaiveDate, Weekday};

/// Domingo de Páscoa (algoritmo de Butcher / Meeus).
pub fn domingo_de_pascoa(ano: i32) -> NaiveDate {
    let a = ano % 19;
    let b = ano / 100;
    let c = ano % 100;
    let d = b / 4;
    let e = b % 4;
    let f = (b + 8) / 25;
    let g = (b - f + 1) / 3;
    let h = (19 * a + b - d - g + 15) % 30;
    let i = c / 4;
    let k = c % 4;
    let l = (32 + 2 * e + 2 * i - h - k) % 7;
    let m = (a + 11 * h + 22 * l) / 451;
    let mes = (h + l - 7 * m + 114) / 31;
    let dia = ((h + l - 7 * m + 114) % 31) + 1;
    NaiveDate::from_ymd_opt(ano, mes as u32, dia as u32).expect("data da Páscoa")
}

const FIXOS: [(u32, u32, &str); 9] = [
    (1, 1, "Confraternização Universal (Ano Novo)"),
    (4, 21, "Tiradentes"),
    (5, 1, "Dia do Trabalhador"),
    (9, 7, "Independência do Brasil"),
    (10, 12, "Nossa Senhora Aparecida"),
    (11, 2, "Finados"),
    (11, 15, "Proclamação da República"),
    (11, 20, "Dia da Consciência Negra"),
    (12, 25, "Natal"),
];

/// Nome do feriado da data, se houver (mesma lista da tela, inclusive Quarta-feira de Cinzas e a Páscoa).
pub fn feriado(data: NaiveDate) -> Option<&'static str> {
    if let Some((_, _, nome)) = FIXOS.iter().find(|(m, d, _)| data.month() == *m && data.day() == *d) {
        return Some(nome);
    }
    let pascoa = domingo_de_pascoa(data.year());
    let moveis: [(i64, &str); 6] = [
        (-48, "Carnaval (Segunda-feira)"),
        (-47, "Carnaval (Terça-feira)"),
        (-46, "Quarta-feira de Cinzas"),
        (-2, "Sexta-feira Santa (Paixão de Cristo)"),
        (0, "Páscoa"),
        (60, "Corpus Christi"),
    ];
    moveis.iter().find(|(dias, _)| pascoa + Duration::days(*dias) == data).map(|(_, nome)| *nome)
}

/// Segunda a sexta.
pub fn dia_de_semana(data: NaiveDate) -> bool {
    !matches!(data.weekday(), Weekday::Sat | Weekday::Sun)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn pascoa_de_varios_anos() {
        assert_eq!(domingo_de_pascoa(2024), d("2024-03-31"));
        assert_eq!(domingo_de_pascoa(2025), d("2025-04-20"));
        assert_eq!(domingo_de_pascoa(2026), d("2026-04-05"));
    }

    #[test]
    fn feriados_fixos_e_moveis_de_2026() {
        assert_eq!(feriado(d("2026-11-02")), Some("Finados"));
        assert_eq!(feriado(d("2026-11-20")), Some("Dia da Consciência Negra"));
        assert_eq!(feriado(d("2026-02-16")), Some("Carnaval (Segunda-feira)"));
        assert_eq!(feriado(d("2026-02-18")), Some("Quarta-feira de Cinzas"));
        assert_eq!(feriado(d("2026-04-03")), Some("Sexta-feira Santa (Paixão de Cristo)"));
        assert_eq!(feriado(d("2026-06-04")), Some("Corpus Christi"));
        assert_eq!(feriado(d("2026-11-03")), None);
    }

    #[test]
    fn fim_de_semana_nao_e_dia_de_semana() {
        assert!(dia_de_semana(d("2026-11-03")));
        assert!(!dia_de_semana(d("2026-11-07")));
        assert!(!dia_de_semana(d("2026-11-08")));
    }
}
