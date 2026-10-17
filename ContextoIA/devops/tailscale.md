# Tailscale — Acesso Remoto Seguro e Multi-Dispositivo

O **Tailscale** cria uma rede virtual segura (VPN mesh ponto a ponto) conectando o servidor central (Linux / CasaOS ou Windows) a todos os computadores, notebooks e dispositivos operacionais da fábrica e do escritório, sem a necessidade de abrir portas no roteador ou ter IP público.

---

## 1. Como Funciona no Nexus

```
 [ Servidor Nexus (CasaOS / Linux) ]  ─── IP Tailscale (ex: 100.120.161.52:3001)
                  ▲
                  │  (Túnel seguro WireGuard)
                  ▼
 [ PC Operador / Terminal Cliente ]  ─── Acessa via http://nexus.local:3001
```

1. O **Servidor Nexus** (Linux/CasaOS) e os **PCs Clientes** estão conectados na mesma conta Tailscale.
2. Cada máquina recebe um IP virtual fixo seguro (ex.: `100.x.y.z`).
3. O PC cliente roda `Nexus-Setup-Cliente.bat` para associar o domínio amigável `nexus.local` ao IP Tailscale do servidor.
4. O operador abre o navegador em `http://nexus.local:3001` e opera normalmente.

---

## 2. Configuração Rápida em um Novo PC Cliente

1. Instale o Tailscale no computador e faça login na sua conta.
2. Copie o arquivo **[`Nexus-Setup-Cliente.bat`](../../Nexus-Setup-Cliente.bat)** para a máquina.
3. Clique com o botão direito e selecione **"Executar como Administrador"**.
4. O script solicitará o IP do servidor (ou confirmará o IP padrão), configurará o arquivo `hosts`, limpará o cache DNS e abrirá o Nexus diretamente no navegador padrão.

---

## 3. Acesso Direto via Navegador

Qualquer dispositivo conectado à mesma conta Tailscale (inclusive celulares e tablets) pode acessar diretamente por:
- `http://<IP_TAILSCALE_DO_SERVIDOR>:3001`
- `http://nexus.local:3001` (nos computadores configurados)

---

## 4. Segurança

- **Porta 3001:** Deve permanecer acessível apenas para a rede local (LAN) e para a interface do Tailscale (`tailscale0`). Nunca a exponha na internet pública sem proxy reverso com HTTPS.
- **PostgreSQL (Porta 5432):** Deve ser acessível apenas pelo servidor Nexus e pelo PC de desenvolvimento, protegida por senha forte.
