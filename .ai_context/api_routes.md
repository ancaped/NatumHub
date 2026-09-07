# Rotas da API REST do Servidor Axum (Porta 3001)

O backend em Rust do NatumHub inicia um servidor HTTP Axum na porta **`3001`**. Bind padrão: `0.0.0.0:3001` (Tailscale). Override: `NATUM_BIND`.

**Auth:** em bind não-loopback, todas as rotas `/api/*` exigem `Authorization: Bearer <hub_token>` (`NATUM_HUB_TOKEN` ou arquivo gitignored `.natum_hub_token`). Exceção: `GET /api/google/callback`. Ver [security.md](security.md).

---

## 1. Cadastro de Produtos e Kits Comerciais

### `GET /api/products`
Retorna a lista completa de produtos cadastrados com seus limiares de estoque e status.
- **Função Rust**: `handlers::list_products`

### `GET /api/kits`
Retorna a lista de produtos que possuem componentes vinculados (são kits).
- **Função Rust**: `handlers::list_kits`

### `GET /api/kits/composicao`
Retorna o mapeamento completo de composição de kits comerciais.
- **Função Rust**: `handlers::list_kit_composicao`

### `POST /api/kits/composicao`
Associa manualmente um produto componente a um produto kit.
- **Função Rust**: `handlers::add_kit_composicao_handler`
- **Corpo JSON**: `{ "kit_codigo": "X", "componente_codigo": "Y" }`

### `DELETE /api/kits/composicao/:kit/:comp`
Remove o vínculo de um componente de um kit comercial.
- **Função Rust**: `handlers::delete_kit_composicao_handler`

### `POST /api/kits/composicao/upload`
Importa composições de kits em lote via upload de planilha Excel.
- **Função Rust**: `handlers::upload_kit_composicao` (multipart form)

---

## 2. Configurações por Linha e Limiares

### `GET /api/configs`
Lista multiplicadores de estoque mínimo, ideal e fator de segurança Z de cada linha.
- **Função Rust**: `handlers::get_configs`

### `PUT /api/configs`
Insere ou altera as configurações de prazos e visibilidade de uma linha.
- **Função Rust**: `handlers::update_config`

### `DELETE /api/configs/:prefix`
Exclui uma configuração de linha personalizada, retornando os itens dela para a linha padrão (`DEFAULT`).
- **Função Rust**: `handlers::delete_config`

---

## 3. Overrides de Alertas (Ajustes de Estoque)

### `POST /api/overrides`
Salva as configurações manuais de um produto (média de vendas manual, visibilidade, etc.).
- **Função Rust**: `handlers::save_override`

### `POST /api/overrides/bulk`
Salva configurações em lote para múltiplos produtos ao mesmo tempo.
- **Função Rust**: `handlers::save_override_bulk`

---

## 4. Importação de Planilhas e Sincronização

### `POST /api/import/faturamento`
Importa arquivo Excel com dados de faturamento mensal.
- **Função Rust**: `handlers::import_faturamento` (multipart form)

### `POST /api/import/levantamento`
Importa arquivo Excel com dados de posição física do estoque da fábrica.
- **Função Rust**: `handlers::import_levantamento` (multipart form)

### `POST /api/import/kits`
Importa arquivo Excel com relações de kits e componentes.
- **Função Rust**: `handlers::import_kits` (multipart form)

### `GET /api/import/history`
Retorna a lista das últimas planilhas carregadas com estatísticas.
- **Função Rust**: `handlers::get_import_history`

### `GET /api/import/status`
Retorna o status atualizado do watcher de arquivos e o tempo decorrido desde o último levantamento/faturamento.
- **Função Rust**: `handlers::get_import_status`

---

## 5. Pasta Monitorada (File Watcher)

### `GET /api/import/watch-config`
Retorna a pasta monitorada ativa (padrão: `Producao/PlanilhasBase/`) e os intervalos de alertas críticos de importação.
- **Função Rust**: `handlers::get_watch_config_handler`

### `POST /api/import/watch-config`
Atualiza as configurações do diretório monitorado.
- **Função Rust**: `handlers::save_watch_config_handler`

---

## 6. Histórico de Lançamentos de Produção

### `GET /api/historico`
Busca todas as ordens de fabricação passadas registradas no sistema.
- **Função Rust**: `handlers::list_producao`

### `POST /api/historico`
Registra uma nova fabricação e salva o snapshot estatístico de decisão do item.
- **Função Rust**: `handlers::add_producao`

### `DELETE /api/historico/:id`
Exclui um registro do histórico de fabricação.
- **Função Rust**: `handlers::delete_producao`

---

## 7. Integração e Backup com Google Drive

### `GET /api/google/status`
Verifica se existe credencial do Google Drive salva e qual foi o horário da última sincronização do banco `data.db`.
- **Função Rust**: `google_drive::get_google_status`

### `POST /api/google/config`
Salva credenciais e tokens do cliente Google Drive.
- **Função Rust**: `google_drive::save_google_config`

### `GET /api/google/auth-url`
Retorna o link OAuth2 para login na conta do Google Drive da Nátum.
- **Função Rust**: `google_drive::google_auth_url`

### `GET /api/google/callback`
Trata a rota de redirecionamento OAuth2 para receber o token de acesso.
- **Função Rust**: `google_drive::google_callback`

### `POST /api/google/sync`
Força a sincronização imediata de upload do banco `data.db` local para o Drive.
- **Função Rust**: `google_drive::trigger_sync`

`GET /api/google/status` **não** devolve `client_id` (apenas flags `configured` / `client_id_configured` / `authenticated`).

---

## 8. Settings (`/api/settings/:key`)

- **GET** `handlers::get_setting_handler` — chaves sensíveis (`sql_password`, `firebase_config`, `google_client_secret`, tokens Google, `hub_token`) retornam `{ value: null, is_set, masked: true }`.
- **POST** `handlers::save_setting_handler` — escrita; placeholder vazio/`********` não sobrescreve o segredo. `hub_token` não é configurável por esta rota.
