# Tailscale (rede sem LAN / “offline” remoto)

Use Tailscale quando os PCs não estão na mesma Wi‑Fi/rede cabeada, mas precisam falar com o **PC Principal** (API `:3001`).

Para Hub **sem janela Tauri** (serviço / VPS): [instalacao_servidor.md](instalacao_servidor.md) + Tailscale no host do `natumhub-server`.

## 1. Conta e instalação

1. Crie conta em https://tailscale.com (gratuita para uso pequeno).
2. Instale o cliente Tailscale em **todos** os PCs (master + terminais + notebook do supervisor).
3. Faça login com a mesma organização/conta.

## 2. Rede

- Cada PC recebe um IP `100.x.x.x` e, se MagicDNS estiver ativo, um hostname (ex.: `pc-escritorio`).
- No master, confirme que o NatumHub está como **PC Principal** (app Tauri **ou** `natumhub-server`) e a API responde em `:3001`.

## 3. Terminais / supervisor remoto

Abra no navegador:

```
http://natumhub.local:3001
```

(com hosts apontando `natumhub.local` para o IP Tailscale do master), ou use direto:

```
http://<hostname-tailscale>:3001
http://100.x.x.x:3001
```

Teste: `http://…:3001/api/health` e a UI em `/`. Login supervisor com nome + senha.

## 4. Notas

- Postgres continua **só no master** (localhost); não exponha `5432` na tailnet.
- Firewall do Windows/Linux no master ainda precisa aceitar a API (Tailscale costuma contornar NAT).
- “Offline” aqui = sem internet pública fixa; a mesh Tailscale precisa que os nós estejam online na VPN.
- **Não** publique `:3001` na internet aberta nesta fase — só Tailscale (ou LAN).

## 5. Alternativa preferida na LAN

Se todos os PCs estão na mesma rede local, Tailscale é opcional — use hosts `natumhub.local` → IP LAN do master ([instalacao_app_terminal.md](instalacao_app_terminal.md)).
