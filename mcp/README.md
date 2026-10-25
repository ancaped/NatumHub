# Nexus MCP (somente leitura)

Servidor MCP mínimo por stdio. Expõe ao agente de IA as ações **de leitura** (`GET`, sem escrita) do catálogo `GET /api/agentes/acoes` do Nexus. Nada que grava é exposto. Sem dependências: Node 22 ou mais novo.

## Configuração

No cliente MCP (Claude Code: `.mcp.json` ou `claude mcp add`):

```json
{
  "mcpServers": {
    "nexus": {
      "command": "node",
      "args": ["<caminho>/mcp/nexus-mcp.mjs"],
      "env": {
        "NEXUS_URL": "http://100.64.207.54:3001",
        "NEXUS_TOKEN": "nxa_..."
      }
    }
  }
}
```

## Token de agente

O supervisor cria o token (aparece uma única vez):

```
POST /api/admin/agentes/:id/token?confirmar=true
```

Guarde o token só no `env` do cliente; o servidor nunca o registra em log.

## Avisos

- Somente leitura: ações que gravam são ignoradas, mesmo as de cálculo via POST.
- O que o agente vê depende dos módulos liberados para aquele agente no Nexus.
- A lista de ferramentas fica em cache por 5 minutos; respostas acima de 100 kB são cortadas (use `limite`/`pagina`).

## Testes

```
node --test "mcp/*.test.mjs"
```
