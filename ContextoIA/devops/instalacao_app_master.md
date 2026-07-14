# Instalar NatumHub — PC Principal

Pré-requisito: [PostgreSQL configurado](instalacao_postgres_master.md) + `Saves/postgres.env`.

No **NatumHub Dev**, o wizard **PC Principal** pode instalar Postgres 17, criar `natumhub` e gravar o `.env` com um clique (opção A no doc do Postgres).

## O que não precisa

No PC de produção **não** instale Rust, Node nem drivers ODBC. O `.exe` já traz a API Axum e os clientes Postgres/SQL Server.

## 1. Baixar o instalador

Na [GitHub Release](https://github.com/ancaped/NatumHub/releases):

- Canal fábrica: `NatumHub_*_x64-setup.exe` (**stable**)
- Canal testes (supervisor): `NatumHub Dev_*_x64-setup.exe` (**dev**)

Detalhes de assinatura/canais: [`.github/RELEASE.md`](../../.github/RELEASE.md).

## 2. Instalar e configurar

1. Rode o NSIS → WebView2 costuma já existir no Windows 10/11.
2. Na 1ª abertura: wizard → escolha **PC Principal**.
3. Confirme o arquivo de conexão:
   - Instalado: `%LOCALAPPDATA%\NatumHub\Saves\postgres.env`
   - Dev instalado: `%LOCALAPPDATA%\NatumHub Dev\Saves\postgres.env`
4. Crie a conta **supervisor** (única que cadastra operadores).
5. Login digitando **nome + senha** (a lista de usuários não aparece na tela).

Se o app abriu mas a API está offline: falta `postgres.env` ou o Postgres não está rodando — veja o log no console e o caminho acima.

## 3. Rede

- API escuta em `0.0.0.0:3001`.
- Firewall Windows: permitir inbound **TCP 3001**.
- Terminais usam `http://<ip-ou-hostname-do-master>:3001`.

## 4. ERP e updates

- Sync SQL Server: Configurações / Painel Supervisor (só no master).
- Updates: supervisor sincroniza manifests do GitHub; terminais atualizam pelo master.

## 5. Checklist rápido

- [ ] Postgres no ar + schema
- [ ] `postgres.env` ok
- [ ] App sobe Axum em :3001
- [ ] Supervisor loga
- [ ] Porta 3001 acessível pelos outros PCs (ou Tailscale)
