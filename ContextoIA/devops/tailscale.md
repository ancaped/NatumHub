# Tailscale (rede sem LAN / “offline” remoto)

Use Tailscale quando os PCs não estão na mesma Wi‑Fi/rede cabeada, mas precisam falar com o **PC Principal** (API `:3001`).

## 1. Conta e instalação

1. Crie conta em https://tailscale.com (gratuita para uso pequeno).
2. Instale o cliente Tailscale em **todos** os PCs (master + terminais).
3. Faça login com a mesma organização/conta.

## 2. Rede

- Cada PC recebe um IP `100.x.x.x` e, se MagicDNS estiver ativo, um hostname (ex.: `pc-escritorio`).
- No master, confirme que o NatumHub está como **PC Principal** e a API responde em `:3001`.

## 3. Terminais

No wizard do terminal, use:

```
http://<hostname-tailscale>:3001
```

ou

```
http://100.x.x.x:3001
```

Teste antes: no navegador do terminal, abra `http://…:3001/api/health` (deve responder ok).

## 4. Notas

- Postgres continua **só no master** (localhost); não exponha `5432` na tailnet.
- Firewall do Windows no master ainda precisa aceitar a API (Tailscale costuma contornar NAT).
- “Offline” aqui = sem internet pública fixa; a mesh Tailscale precisa que os nós estejam online na VPN.

## 5. Alternativa

Se todos os PCs estão na mesma LAN, Tailscale é opcional — use o IP local do master.
