# Conexão GitHub — NatumHub

## Repositório

- **URL**: https://github.com/ancaped/NatumHub
- **Clone**: `https://github.com/ancaped/NatumHub.git`
- **Organização/Usuário**: `ancaped`
- **Nome**: `NatumHub`
- **Visibilidade**: **Público** — confirmar com Edson / tornar privado (P0-1 ainda aberto)
- **Branch padrão do GitHub**: `main` (releases / código estável)
- **Branch de docs e trabalho de IA**: **`grokbot`**

Não commite em `main` a partir de sessões de documentação ou hardening incremental. Empilhe docs, contexto de IA e P0 de segurança em `grokbot` (como o squash `feat(security)`).

## Autenticação (sem PAT na URL)

**Não** embutir Personal Access Token na URL do remote (`https://TOKEN@github.com/...`). Isso vaza no `git remote -v`, em logs e em transcripts.

Use um destes:

1. **GitHub CLI** (preferido em sessões interativas):
   ```bash
   gh auth login
   gh auth setup-git
   git push origin grokbot
   ```
2. **Credential helper** (`gh`, Git Credential Manager, ou `git credential`):
   ```bash
   git remote set-url origin https://github.com/ancaped/NatumHub.git
   git push origin grokbot
   ```
   O helper pede / reutiliza credenciais. A URL do remote permanece sem segredo.
3. **HTTPS com token só no helper**, nunca no `origin` persistente.

Arquivos locais tipo `.github_token` (se existirem e estiverem no `.gitignore`) são opcionais para o humano; IAs **não** devem `git remote set-url` com o conteúdo deles.

## Fluxo Git usual

```bash
git status
git checkout grokbot
git pull origin grokbot

git add -A
git commit -m "docs: descrição da mudança"
git push origin grokbot
```

Para feature isolada: branch a partir de `grokbot`, PR **contra `grokbot`** (não contra `main`), a menos que o usuário peça merge em `main`.

## Se a autenticação falhar (401/403)

1. Conferir se o remote **não** tem token expirado na URL: `git remote -v`
2. Restaurar URL limpa: `git remote set-url origin https://github.com/ancaped/NatumHub.git`
3. Reautenticar com `gh auth login` ou renovar o token no credential helper
4. Fine-grained PATs precisam de **Contents: Read and write** no repo; sem isso o push falha mesmo com clone ok

Não cole o token novo na URL do remote.

## Estrutura do projeto

```
NatumHub/
├── Frontend/          # React + Vite + Tailwind CSS v4
├── Backend/           # Tauri + Rust + SQLite + Axum
├── Docs/              # Blueprints históricos por módulo
├── .ai_context/       # Guias para IAs (inclui security.md)
├── ARCHITECTURE.md    # Arquitetura atual (v0.0.11-alpha)
└── feedback.md        # Bug reports auto-gerados
```
