# Build do PC Principal (opcional)

Clientes da fábrica **não** usam instalador nem update in-app. Acessam o Hub no navegador:

`http://nexus.local:3001`

Atualização de produção = `git checkout main && git pull` + `npm run build` no Frontend + reinício do app master. Ver [`ContextoIA/devops/`](../ContextoIA/devops/).

## Quando gerar o `.exe` do master

Só se quiser instalar o NatumHub como app Tauri no PC Principal (API + sync ERP + serve o SPA).

```bash
cd Backend
npm ci
cd ../Frontend && npm ci && npm run build && cd ../Backend

# Identificador Principal
npm run build:stable

# Identificador Dev (máquina de desenvolvimento)
npm run build:dev
```

Saída típica: `…/bundle/nsis/*-setup.exe`.

## CI (opcional)

```bash
git tag v0.0.12 && git push origin v0.0.12
```

Ou **Actions → Release NatumHub**. O workflow gera instaladores do master; **não** há manifests de updater nem sync GitHub→app.

## Modelo de branches

| Branch | Uso |
|--------|-----|
| `main` | Produção no PC Principal |
| Outras | Desenvolvimento local; não servir aos clientes da fábrica |
