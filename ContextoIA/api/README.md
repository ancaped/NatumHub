# API e integração

| Arquivo | Uso |
|---------|-----|
| [`routes.md`](routes.md) | Rotas REST Axum (`:3001`) — referência compacta |
| [`tauri_commands.md`](tauri_commands.md) | Comandos `invoke` legados — preferir REST |

Cliente HTTP frontend: `Frontend/src/modules/geral/lib/http.ts` — sempre `apiFetch` / `apiJson` / `hubJson`.

Auth e rotas admin: [`../arquitetura/multi_usuario.md`](../arquitetura/multi_usuario.md)
