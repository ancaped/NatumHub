# Instalar NatumHub — Terminal

Terminais **não** precisam de PostgreSQL, Rust, Node nem SQL Server.

## 1. Instalador

Mesmo NSIS da release (**stable** para o chão de fábrica): `NatumHub_*_x64-setup.exe`.

## 2. Wizard

1. Abra o app → **Terminal**.
2. Informe a URL da API do PC Principal, por exemplo:
   - LAN: `http://192.168.0.10:3001`
   - Tailscale: `http://pc-master:3001` ou `http://100.x.x.x:3001`
3. O app testa o health; se falhar, corrija rede/firewall.
4. Login com **nome + senha** (cadastrado pelo supervisor no master).

## 3. Comportamento

- Modo `client`: não sobe Axum local; não exige `postgres.env`.
- Toda conversa HTTP vai para o master.
- Updates in-app usam os manifests servidos pelo master.

## 4. Reconfigurar

Na tela de login: **Reconfigurar dispositivo** (volta ao wizard).

Ver também: [tailscale.md](tailscale.md) · [instalacao_app_master.md](instalacao_app_master.md).
