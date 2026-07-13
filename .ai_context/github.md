# Conexão GitHub - NatumHub

## Repositório
- **URL**: https://github.com/ancaped/NatumHub.git
- **Organização/Usuário**: `ancaped`
- **Nome**: `NatumHub`
- **Visibilidade**: Privado 🔒
- **Branch principal**: `main`

## Credenciais / Autenticação (Para IAs)

Por solicitação do usuário, o **GitHub Personal Access Token (PAT)** está salvo localmente no arquivo gitignorado:
- **Caminho**: `/.github_token` (no diretório raiz do projeto)

Futuras IAs de codificação devem ler este arquivo para obter o token de acesso e autenticar ao realizar operações Git ou interagir com a API do GitHub.

## Como fazer push (para IAs)

O token de autenticação também pode ser usado no Git Credential Manager ou diretamente via URL temporária.
Para fazer push usando o token salvo:
```bash
# Ler o token do arquivo .github_token e usar na URL do remote (ou configurar o git local)
# Exemplo via PowerShell:
$token = Get-Content .github_token -Raw
git remote set-url origin "https://$($token.Trim())@github.com/ancaped/NatumHub.git"
git push origin main
git remote set-url origin https://github.com/ancaped/NatumHub.git
```

```bash
# Verificar status
git status

# Adicionar alterações
git add -A

# Commitar com mensagem descritiva
git commit -m "feat: descrição da mudança"

# Enviar para o GitHub
git push origin main
```

## Se a autenticação expirar

Se o `git push` retornar erro 401/403, o usuário precisa gerar um novo token:
1. Acessar https://github.com/settings/tokens
2. Gerar um **Classic token** com permissões `repo` (Full control)
3. Executar: `git remote set-url origin https://TOKEN@github.com/ancaped/NatumHub.git`
4. Fazer o push
5. Depois remover o token da URL: `git remote set-url origin https://github.com/ancaped/NatumHub.git`

## Estrutura do Projeto

```
NatumHub/              # ou C:\api no Windows
├── Frontend/          # React + Vite + Tailwind CSS v4
├── Backend/           # Tauri + Rust + SQLite + Axum
│   └── NatumHub/      # App desktop Tauri
├── Docs/              # Documentação por módulo
├── .ai_context/       # Guias para IAs de codificação
├── ARCHITECTURE.md    # Arquitetura geral
└── feedback.md        # Bug reports auto-gerados
```
