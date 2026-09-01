#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tokio::main]
async fn main() {
    app_lib::server_control_app::run_server_control().await;
}
