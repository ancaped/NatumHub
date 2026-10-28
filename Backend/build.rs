//! Gera o "mapa do código" (rotas, tabelas, telas e chamadas tela → rota) varrendo o código-fonte deste build.
//! O resultado é embutido no binário (`mapa::gerado`), então a ficha da central Desenvolvimento nunca fica velha.

#[path = "src/modules/geral/mapa/extracao.rs"]
mod extracao;

use std::path::PathBuf;

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let raiz = manifest.parent().expect("raiz do repositório").to_path_buf();
    for d in ["Backend/src", "Backend/supabase", "Frontend/src"] {
        println!("cargo:rerun-if-changed={}", raiz.join(d).display());
    }
    println!("cargo:rerun-if-changed=build.rs");

    let codigo = extracao::varrer(&raiz);
    let json = serde_json::to_string(&codigo).expect("serializar mapa_codigo.json");
    let out = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR")).join("mapa_codigo.json");
    std::fs::write(out, json).expect("gravar mapa_codigo.json");
}
