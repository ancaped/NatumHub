# Acessar NatumHub — Terminal (navegador)

Terminais **não** precisam de PostgreSQL, Rust, Node, SQL Server nem instalador `.exe`.

URL fixa: `http://nexus.local:3001`

## 1. Hosts → IP estável (Tailscale)

O roteador troca o IP da Wi‑Fi. Nos clientes, `nexus.local` deve apontar para o IP **Tailscale** do notebook (`100.x.x.x`), que não muda. Ver [tailscale.md](tailscale.md).

No PC do terminal, como administrador:

```text
NatumHub-Setup-Hosts.bat 100.x.x.x
```

(substitua pelo IP Tailscale do PC Principal, visível no app Tailscale do notebook.)

Isso grava no `hosts`:

```text
100.x.x.x  nexus.local
```

**Não** rode o `.bat` sem argumento nos clientes — o padrão `127.0.0.1` é só no notebook.

No notebook (master): `NatumHub-Setup-Hosts.bat` → `127.0.0.1  nexus.local`.

## 2. Abrir o Hub

No navegador (Chrome/Edge):

```text
http://nexus.local:3001
```

A UI e a API ficam na mesma origem. Login com **nome + senha** (cadastrado pelo supervisor no master).

Teste: `http://nexus.local:3001/api/health`

Firefox: se `nexus.local` não abrir, desligue DNS sobre HTTPS.

## 3. Comportamento

- Sem app instalado: só o navegador.
- Atualizações: o master faz `git pull` em `main` + rebuild do Frontend; no terminal basta **recarregar a página**.

## 4. Rede

- Firewall do PC Principal: **TCP 3001**.
- Postgres **não** abre na rede (`5432` só no notebook).

Ver também: [instalacao_app_master.md](instalacao_app_master.md) · [multi_usuario.md](../arquitetura/multi_usuario.md).
