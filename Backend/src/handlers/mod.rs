pub mod configs;
pub mod imports;
pub mod producao;
pub mod kits;
pub mod estoque;
pub mod vendas;

pub use configs::*;
pub use imports::*;
pub use producao::*;
pub use kits::*;
pub use estoque::*;
pub use vendas::*;

use crate::core::db::Db;

pub struct AppState {
    pub db: Db,
}
