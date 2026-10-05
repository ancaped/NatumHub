# Publicar o Nexus

Clientes da fábrica acessam o navegador:

`http://nexus.local:3001`

Atualização de produção no PC principal:

```bash
git checkout main && git pull
cd Frontend && npm run build
```

Depois reinicie `nexus-server` (`Nexus-Server.bat` ou o binário em `Backend/target/release/nexus-server.exe`).

## Repositório

O remote ainda é `https://github.com/ancaped/NatumHub.git`. O nome do produto é Nexus; o nome do repositório GitHub não mudou.

## Workflow antigo

[`.github/workflows/release.yml`](workflows/release.yml) ainda tenta gerar um instalador desktop (Tauri). Esse caminho não é o deploy atual. Não use essa Action como publicação do servidor.
