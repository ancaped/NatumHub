//! Decodificação tolerante INT4/INT8 e FLOAT8→i64 para sqlx + Postgres.
use sqlx::postgres::PgRow;
use sqlx::Row;

pub fn pg_i64(row: &PgRow, idx: usize) -> i64 {
    if let Ok(v) = row.try_get::<i64, _>(idx) {
        return v;
    }
    if let Ok(v) = row.try_get::<i32, _>(idx) {
        return v as i64;
    }
    if let Ok(v) = row.try_get::<f64, _>(idx) {
        return v.round() as i64;
    }
    0
}

pub fn pg_opt_i64(row: &PgRow, idx: usize) -> Option<i64> {
    if let Ok(Some(v)) = row.try_get::<Option<i64>, _>(idx) {
        return Some(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<i32>, _>(idx) {
        return Some(v as i64);
    }
    if let Ok(Some(v)) = row.try_get::<Option<f64>, _>(idx) {
        return Some(v.round() as i64);
    }
    if let Ok(None) = row.try_get::<Option<i32>, _>(idx) {
        return None;
    }
    if let Ok(None) = row.try_get::<Option<i64>, _>(idx) {
        return None;
    }
    None
}

pub fn pg_f64(row: &PgRow, idx: usize) -> f64 {
    if let Ok(v) = row.try_get::<f64, _>(idx) {
        return v;
    }
    if let Ok(v) = row.try_get::<i32, _>(idx) {
        return v as f64;
    }
    if let Ok(v) = row.try_get::<i64, _>(idx) {
        return v as f64;
    }
    0.0
}

pub fn pg_i32(row: &PgRow, idx: usize) -> i32 {
    pg_i64(row, idx) as i32
}

pub fn pg_opt_i32(row: &PgRow, idx: usize) -> Option<i32> {
    pg_opt_i64(row, idx).map(|v| v as i32)
}

pub fn pg_opt_f64(row: &PgRow, idx: usize) -> Option<f64> {
    if let Ok(Some(v)) = row.try_get::<Option<f64>, _>(idx) {
        return Some(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<i32>, _>(idx) {
        return Some(v as f64);
    }
    if let Ok(Some(v)) = row.try_get::<Option<i64>, _>(idx) {
        return Some(v as f64);
    }
    if let Ok(None) = row.try_get::<Option<f64>, _>(idx) {
        return None;
    }
    None
}
