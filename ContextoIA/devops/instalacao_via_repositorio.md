# Instalação e Execução do Nexus via Repositório

Este guia descreve como clonar, compilar e executar o **Nexus Industrial Hub** diretamente a partir do código-fonte no Windows ou Linux.

---

## 1. Arquitetura Operacional

| Papel | Descrição | O que roda |
|---|---|---|
| **Servidor (Master)** | Servidor de produção (Windows ou Linux / CasaOS) | `nexus-server` (Axum :3001) + PostgreSQL |
| **Terminal (Cliente)** | PCs de operadores e supervisores | Apenas o **Navegador** em `http://nexus.local:3001` |

---

## 2. Pré-requisitos para Compilação (PC Servidor / Desenvolvedor)

1. **Git:** Para clonar o repositório.
2. **Node.js (20+ LTS):** Para compilar os assets do Frontend React SPA.
3. **Rust (1.77+):** Instalado via [rustup.rs](https://rustup.rs).
4. **PostgreSQL 17:** Localmente ou via Docker no servidor dedicado.

---

## 3. Passo a Passo de Instalação

### Passo 1: Clonar o Repositório
```cmd
git clone https://github.com/ancaped/NatumHub.git C:\api
cd C:\api
```

### Passo 2: Instalar Dependências e Buildar o Frontend
```cmd
cd Frontend
npm install
npm run build
cd ..
```
*(O build gerará os arquivos estáticos de produção na pasta `Frontend/dist`).*

### Passo 3: Configurar Conexão com o PostgreSQL
Copie o modelo de ambiente e configure sua conexão:
```cmd
copy Saves\postgres.env.example Saves\postgres.env
notepad Saves\postgres.env
```
Defina sua string de conexão:
```env
DATABASE_URL=postgresql://postgres:sua_senha@localhost:5432/natumhub
# ou aponte para o IP do CasaOS na LAN:
# DATABASE_URL=postgresql://postgres:sua_senha@192.168.1.150:5432/natumhub
```

### Passo 4: Iniciar o Servidor
No Windows, execute:
```cmd
Nexus-Server.bat
```
*(O servidor Axum escuta requisições na porta 3001 e atende aos clientes e terminais da rede).*

---

## 4. Configurando PCs Clientes (Terminais)

Nos outros computadores da rede que só precisam acessar o sistema:
1. **NÃO precisa instalar Git, Rust ou Node.js.**
2. Execute o arquivo [`Nexus-Setup-Cliente.bat`](../../Nexus-Setup-Cliente.bat) como Administrador.
3. Digite o IP do servidor (ou mantenha o padrão).
4. O navegador abrirá automaticamente em `http://nexus.local:3001`.
