# Instalar NatumHub — PC Principal

Pré-requisito: [PostgreSQL configurado](instalacao_postgres_master.md) + `Saves/postgres.env`.

No **NatumHub Dev**, o wizard **PC Principal** pode instalar Postgres 17, criar `natumhub` e gravar o `.env` com um clique.

## Papel do master

- Sobe Axum em `0.0.0.0:3001` (API + **SPA** do Hub em `/`) — via app Tauri **ou** [`instalacao_servidor.md`](instalacao_servidor.md) (`natumhub-server`, sem janela).
- Clientes abrem `http://nexus.local:3001` no navegador — sem instalador.
- Produção = branch **`main`**. Outras branches só para desenvolvimento.

## 1. Subir a partir do repositório (recomendado)

Ver [instalacao_via_repositorio.md](instalacao_via_repositorio.md). Resumo:

```powershell
git checkout main
git pull
cd Frontend; npm ci; npm run build; cd ..
# subir o app Tauri master (tauri:dev ou build:stable)
```

Opcional: gerar `.exe` do master com `npm run build:stable` em `Backend/` — detalhes em [`.github/RELEASE.md`](../../.github/RELEASE.md).

## 2. Configurar

1. Wizard → **PC Principal**.
2. Confirme `postgres.env` (repo `Saves/` ou `%LOCALAPPDATA%\NatumHub\Saves\`).
3. Crie a conta **supervisor**.
4. Login com **nome + senha**.

## 3. Rede e hostname

- API + SPA em `0.0.0.0:3001`.
- Firewall Windows: inbound **TCP 3001**.
- Nos terminais: hosts `nexus.local` → IP Tailscale deste PC (ver [instalacao_app_terminal.md](instalacao_app_terminal.md)).

## 4. Atualizar produção

```powershell
git checkout main
git pull
cd Frontend; npm run build; cd ..
# reiniciar o app master
```

Não há update in-app nem sync de releases GitHub no Painel Supervisor.

## 5. ERP

Sync SQL Server: Configurações / Painel Supervisor (só no master).

## 6. Checklist

- [ ] Postgres no ar + schema
- [ ] `postgres.env` ok
- [ ] `Frontend/dist` gerado (`npm run build`)
- [ ] App sobe Axum em :3001 e `http://127.0.0.1:3001/` carrega o Hub
- [ ] Supervisor loga
- [ ] Porta 3001 acessível; terminais usam `http://nexus.local:3001`
