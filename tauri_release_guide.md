# Guia de Compilação, Assinatura e Release (Tauri & Firebase)

Este guia documenta o fluxo completo para compilar, assinar o instalador, configurar o sistema de atualização automática (Tauri Updater) e implantar regras de segurança do Firebase no Natum Hub.

---

## 1. Pré-requisitos do Ambiente

Certifique-se de que a máquina de build tenha as seguintes dependências instaladas:
- **Node.js** (v18+)
- **Rustup** & **Rust** (v1.75+)
- **Build Tools do C++** (como o MSVC para compilação Windows)
- **Tauri CLI** (instalável globalmente via `npm install -g @tauri-apps/cli`)

---

## 2. Geração de Chaves para o Updater (Assinatura)

O Tauri exige que todas as atualizações distribuídas via Updater automático sejam devidamente assinadas por uma chave privada correspondente à chave pública embutida no aplicativo.

### Passo 2.1: Gerar o par de chaves
Execute o comando a seguir no terminal para gerar um novo par de chaves:
```bash
npx tauri signer generate
```
Você receberá:
1. Uma **Chave Privada** (que deve ser mantida em segredo absoluto).
2. Uma **Chave Pública** (que será embutida no app).

### Passo 2.2: Configurar a Chave Pública no app
Abra o arquivo [`Backend/tauri.conf.json`](file:///c:/api/Backend/tauri.conf.json) e substitua a chave existente na seção `"pubkey"` do updater:
```json
"updater": {
  "active": true,
  "endpoints": [
    "https://raw.githubusercontent.com/natum-cosmeticos/natum-hub/main/updater.json"
  ],
  "pubkey": "SUA_CHAVE_PUBLICA_GERADA_AQUI"
}
```

### Passo 2.3: Configurar Variáveis de Ambiente no Servidor/Máquina de Build
Antes de executar o comando de build, configure as variáveis de ambiente com a chave privada obtida no Passo 2.1:

No Windows (PowerShell):
```powershell
$env:TAURI_SIGNING_PRIVATE_KEY="CONTEUDO_DA_CHAVE_PRIVADA"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="SENHA_SE_HOUVER"
```

No Linux/macOS ou GitHub Actions:
```bash
export TAURI_SIGNING_PRIVATE_KEY="CONTEUDO_DA_CHAVE_PRIVADA"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="SENHA_SE_HOUVER"
```

---

## 3. Compilação e Assinatura (Build)

Com as variáveis de ambiente configuradas:

1. Acesse a pasta do frontend e gere os arquivos estáticos compilados:
   ```bash
   cd Frontend
   npm run build
   ```
2. Acesse a pasta do backend e execute a build do pacote de distribuição:
   ```bash
   cd ../Backend
   cargo tauri build
   ```

### Artefatos Gerados
Os arquivos gerados de instalação e atualização automática estarão disponíveis em:
- **Instalador MSI (Windows):** `Backend/target/release/bundle/msi/natum-hub_X.Y.Z_x64_en-US.msi`
- **Pacote do Updater (.zip):** `Backend/target/release/bundle/updater/natum-hub_X.Y.Z_x64_en-US.zip`
- **Metadados do Updater (.json):** `Backend/target/release/bundle/updater/natum-hub_X.Y.Z_x64_en-US.zip.sig`

---

## 4. Deploy e Publicação de Atualizações

1. **Hospedar o arquivo ZIP:** Faça o upload do arquivo `.zip` (gerado na pasta `updater`) para o repositório ou servidor de arquivos (como o GitHub Releases do repositório `natum-cosmeticos/natum-hub`).
2. **Atualizar o arquivo `updater.json`:**
   O arquivo `updater.json` que está na raiz do seu endpoint de updates deve conter o seguinte formato apontando para a nova versão e o link do ZIP, juntamente com a assinatura contida no arquivo `.sig`:
   ```json
   {
     "version": "X.Y.Z",
     "notes": "Notas da versão atualizada.",
     "pub_date": "2026-07-09T00:00:00Z",
     "platforms": {
       "windows-x86_64": {
         "signature": "CONTEUDO_DO_ARQUIVO_SIG_AQUI",
         "url": "https://github.com/natum-cosmeticos/natum-hub/releases/download/vX.Y.Z/natum-hub_X.Y.Z_x64_en-US.zip"
       }
     }
   }
   ```
3. O Tauri instalado nas máquinas dos usuários irá bater no endpoint `"endpoints"` configurado no `tauri.conf.json`, ler o `updater.json`, verificar a assinatura contra a chave pública e realizar a atualização de forma totalmente transparente e segura.

---

## 5. Implantação de Regras de Segurança do Firebase

Para garantir que as regras locais do Firestore e do Storage reflitam na nuvem:

1. **Autenticação:**
   Certifique-se de estar logado na conta administrativa do Firebase CLI:
   ```bash
   firebase login
   ```
2. **Deploy das Regras:**
   Execute o comando de deploy a partir da raiz do projeto para subir as regras configuradas no [`firebase.json`](file:///c:/api/firebase.json):
   ```bash
   firebase deploy --only firestore:rules,storage
   ```
