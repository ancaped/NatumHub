# Guia de Compilação e Geração de Executáveis (.exe)

Este documento descreve como gerar os binários executáveis (`.exe`) do **NatumHub / Nexus** para distribuição em produção, bem como o fluxo recomendado de desenvolvimento diário (via scripts rápidos).

---

## 1. Fluxo Recomendado para Desenvolvimento (Sem .exe / Modo Direto)

No dia a dia de desenvolvimento e testes, **não é necessário** compilar executáveis de release:

### 1.1 Iniciar o Servidor Backend (Axum :3001)
Execute via terminal ou clicando no script `Nexus-Server.bat`:
```powershell
cd c:\api\Backend
cargo run --bin nexus-server --no-default-features
```
- **Vantagem:** A compilação incremental em modo dev leva apenas **1 a 2 segundos**.

### 1.2 Iniciar o Frontend (Vite / SPA)
Para compilar os arquivos estáticos rapidamente para o servidor Axum:
```powershell
cd c:\api\Frontend
npm run build
```
Ou para rodar com Hot Reload (HMR):
```powershell
cd c:\api\Frontend
npm run dev
```

---

## 2. Como Gerar os Executáveis (.exe) de Release

Quando for necessário gerar os executáveis finais para instalar em novas máquinas ou criar um release:

### 2.1 Pré-requisito: Build do Frontend
Antes de gerar os executáveis de produção, certifique-se de que os assets do frontend estão atualizados:
```powershell
cd c:\api\Frontend
npm run build
```

### 2.2 Compilar o Servidor Headless (`nexus-server.exe`)
Gera o servidor de API Axum + SPA que roda na porta `:3001` sem janela:
```powershell
cd c:\api\Backend
cargo build --release --bin nexus-server --no-default-features
```
- **Local do executável gerado:** `C:\natumhub\release\nexus-server.exe` (ou `target\release\nexus-server.exe`).

### 2.3 Compilar o Painel de Controle / Bandeja (`nexus-server-control.exe`)
Gera a interface leve de controle do servidor com ícone na bandeja do Windows:
```powershell
cd c:\api\Backend
cargo build --release --bin nexus-server-control --no-default-features
```
- **Local do executável gerado:** `C:\natumhub\release\nexus-server-control.exe`.

### 2.4 Compilar o Aplicativo Desktop Tauri Completo (`nexus.exe`)
Gera o aplicativo de janela nativa desktop para o PC Principal ou Terminais:
```powershell
cd c:\api\Backend
npm run tauri:build
```
- **Local do executável gerado:** `target\release\nexus.exe` e instalador `.msi` em `target\release\bundle\msi\`.

---

## 3. Estrutura dos Binários

| Binário | Finalidade | Como Executar em Dev |
|---|---|---|
| `nexus-server` | Servidor HTTP REST (Axum :3001) + SPA Web | `cargo run --bin nexus-server --no-default-features` |
| `nexus-server-control` | Bandeja de sistema do Windows para controle do servidor | `cargo run --bin nexus-server-control --no-default-features` |
| `nexus` | Aplicação Desktop Tauri (Janela Nativa Webview) | `npm --prefix Backend run tauri:dev` |
