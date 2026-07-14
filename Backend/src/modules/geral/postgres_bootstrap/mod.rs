//! Bootstrap de PostgreSQL portável para builds Dev (sem instalador EDB/UI).
//! Baixa binários oficiais, initdb, cria role/banco, aplica schema e grava postgres.env.

pub mod commands;

pub use commands::{
    bootstrap_local_postgres, ensure_embedded_running, BootstrapPostgresResult, EMBEDDED_PG_PORT,
};
