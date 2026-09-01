# Tailscale (IP estável sem depender do roteador)

Use Tailscale quando o DHCP da Wi‑Fi muda o IP do notebook, ou quando os PCs não estão na mesma rede, mas precisam da API `:3001`.

O domínio do Hub continua `http://nexus.local:3001`. O arquivo hosts dos **clientes** aponta esse nome para o IP Tailscale (`100.x.x.x`) do master — esse IP não muda quando o roteador renova o `192.168…`.

Para Hub **sem janela Tauri**: [instalacao_servidor.md](instalacao_servidor.md) + Tailscale no host do `natumhub-server`.

## 1. Conta e instalação

1. Crie conta em https://tailscale.com (gratuita para uso pequeno).
2. Instale o cliente Tailscale em **todos** os PCs (master + terminais).
3. Faça login com a mesma conta.

## 2. Rede

- Cada PC recebe um IP `100.x.x.x` (estável) e, se MagicDNS estiver ativo, um hostname (ex.: `notebook-edson`).
- No master, o NatumHub (Tauri **ou** `natumhub-server`) responde em `:3001`.
- Anote o `100.x.x.x` do **notebook** (app Tailscale → máquina do PC Principal).

## 3. Hosts `nexus.local`

**Notebook (master):**

```text
NatumHub-Setup-Hosts.bat
```

grava `127.0.0.1  nexus.local`.

**Cada outro PC** (como administrador), com o IP Tailscale do notebook:

```text
NatumHub-Setup-Hosts.bat 100.x.x.x
```

grava `100.x.x.x  nexus.local`.

Depois, em todos os navegadores:

```
http://nexus.local:3001
```

Ainda funciona o atalho MagicDNS (`http://<hostname-tailscale>:3001`) se não quiser hosts.

Teste: `http://nexus.local:3001/api/health`. Login com nome + senha.

## 4. Notas

- Postgres continua **só no master** (localhost); não exponha `5432` na tailnet.
- Firewall do notebook: inbound **TCP 3001**.
- A mesh Tailscale precisa que os nós estejam ligados; não substitui internet/VPN desligada.
- **Não** publique `:3001` na internet aberta — só Tailscale (ou LAN).

Detalhe dos clientes: [instalacao_app_terminal.md](instalacao_app_terminal.md).
