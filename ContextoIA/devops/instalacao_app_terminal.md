# Acessar NatumHub — Terminal (navegador)

Terminais **não** precisam de PostgreSQL, Rust, Node, SQL Server nem instalador `.exe`.

## 1. Hosts / DNS

No PC do terminal (admin), edite `C:\Windows\System32\drivers\etc\hosts` e adicione:

```text
<IP-DO-PC-PRINCIPAL>  natumhub.local
```

Exemplo: `192.168.0.10  natumhub.local`

(Alternativa: DNS interno da empresa apontando `natumhub.local` para o master.)

## 2. Abrir o Hub

No navegador (Chrome/Edge):

```text
http://natumhub.local:3001
```

A UI e a API ficam na mesma origem. Faça login com **nome + senha** (cadastrado pelo supervisor no master).

Teste rápido da API: `http://natumhub.local:3001/api/health`

## 3. Comportamento

- Sem app instalado: só o navegador.
- Atualizações: o master faz `git pull` em `main` + rebuild do Frontend; no terminal basta **recarregar a página**.
- Não há aba de atualizações GitHub.

## 4. Rede

- O PC Principal precisa ter firewall liberando **TCP 3001**.
- Se não estiver na mesma LAN, use [Tailscale](tailscale.md) e aponte `natumhub.local` (ou use o hostname MagicDNS) para o IP do master.

Ver também: [instalacao_app_master.md](instalacao_app_master.md) · [multi_usuario.md](../arquitetura/multi_usuario.md).
