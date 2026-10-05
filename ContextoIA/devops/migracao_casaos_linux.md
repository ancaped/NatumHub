# Guia de Operação e Migração: Servidor Linux / CasaOS + Desenvolvimento Antigravity (Windows)

Este documento orienta a configuração do ambiente completo do **Nexus** no servidor dedicado com **CasaOS (sobre Ubuntu/Debian)**, estabelecendo uma separação estrita e segura entre **Produção (Estável para a Fábrica)** e **Desenvolvimento (Beta para o Antigravity)**.

---

## 1. Arquitetura Dual no CasaOS

Toda a infraestrutura do Nexus roda centralizada no servidor dedicado gerenciado pelo CasaOS:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MÁQUINA SERVIDOR (Linux / CasaOS)                    │
│                                                                        │
│  ┌───────────────────────────────┐    ┌──────────────────────────────┐ │
│  │ 🟢 PRODUÇÃO (Estável)         │    │ 🟡 DESENVOLVIMENTO (Beta)    │ │
│  │                               │    │                              │ │
│  │ - App: nexus-prod (:3001)     │    │ - App: nexus-dev (:3002)     │ │
│  │ - Banco: postgres-prod (:5432)│    │ - Banco: postgres-dev (:5433)│ │
│  │ - Volume: postgres_prod_data  │    │ - Volume: postgres_dev_data  │ │
│  │ - Atende a Fábrica 24/7       │    │ - Exclusivo para Testes/Dev  │ │
│  └───────────────────────────────┘    └──────────────────────────────┘ │
│                                  ▲                                     │
│                                  │ Snapshot/Espelho com 1 comando      │
│                                  │ (scripts/espelhar_banco.sh)         │
│  ┌───────────────────────────────┴───────────────────────────────────┐ │
│  │ (Opcional) Container pgAdmin (:5050) — Inspeciona os 2 bancos     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Compartilhamento Samba / Rede Local
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   PC DE DESENVOLVIMENTO (Windows)                      │
│                                                                        │
│  - Google Antigravity IDE (Edita direto a pasta compartilhada no Dev)  │
│  - Saves/postgres.env apontando para a porta 5433 (Banco Dev)          │
│  - Navegador para validar Beta: http://<IP_DO_CASAOS>:3002             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Passo a Passo da Instalação do CasaOS

1. Instale **Ubuntu Server 24.04 LTS** ou **Debian 12** na máquina servidora.
2. Acesse o terminal (ou via SSH) e instale o CasaOS com um único comando:
   ```bash
   curl -fsSL https://get.casaos.io | sudo bash
   ```
3. Ao finalizar, acesse pelo navegador no seu PC Windows:
   `http://<IP_DO_SERVIDOR_LINUX>`
4. Crie sua conta de administrador no painel inicial do CasaOS.

---

## 3. Subindo a Arquitetura Dual no CasaOS

1. No painel do CasaOS, clique no botão **"+"** (Instalar aplicativo personalizado).
2. No canto superior direito da janela que abrir, clique em **"Importar"** (ícone de terminal).
3. Abra o arquivo [`docker/docker-compose.yml`](../../docker/docker-compose.yml) deste repositório, copie todo o conteúdo e cole no CasaOS.
4. Clique em **Enviar** e depois em **Instalar**.
5. O CasaOS criará e iniciará automaticamente:
   - `nexus-postgres-prod` na porta `5432` (Produção oficial)
   - `nexus-postgres-dev` na porta `5433` (Desenvolvimento isolado)
   - `nexus-pgadmin` na porta `5050`
   - `nexus-prod` na porta `3001`
   - `nexus-dev` na porta `3002`

---

## 4. Migração e Carga Inicial dos Bancos de Dados

Para que ambos os bancos iniciem idênticos aos dados da sua empresa:

1. **Gere o backup do banco atual no Windows:**
   Execute o script com duplo clique no Windows Explorer:
   [`scripts/backup_postgres.bat`](../../scripts/backup_postgres.bat)
   Ele gerará um arquivo `.dump` na pasta `Saves/pg-backups/`.

2. **Copie o arquivo gerado para o servidor:**
   ```bash
   scp Saves/pg-backups/nexus_backup_*.dump root@<IP_DO_CASAOS>:/tmp/backup.dump
   ```

3. **Restaure o backup nos dois bancos (Produção e Dev):**
   ```bash
   # Restaura na Produção (porta 5432)
   docker exec -i nexus-postgres-prod pg_restore -U postgres -d natumhub -v /tmp/backup.dump

   # Restaura no Desenvolvimento (porta 5433)
   docker exec -i nexus-postgres-dev pg_restore -U postgres -d natumhub_dev -v /tmp/backup.dump
   ```
   Pronto! Os dois bancos agora possuem exatamente os mesmos dados e estruturas, sem nenhum risco de interferência entre si.

---

## 5. Conectando o Antigravity (Windows) ao CasaOS

Para desenvolver no seu Windows com o Antigravity de forma fluida:

1. **Ativar Compartilhamento de Arquivos no CasaOS (Samba):**
   - No painel do CasaOS, acesse a aba **"Arquivos"**.
   - Localize a pasta do projeto (ex: `/DATA/AppData/nexus/dev` ou onde clonou o repo).
   - Clique com o botão direito e selecione **"Compartilhar"**.
2. **Mapear Unidade de Rede no Windows:**
   - No Windows Explorer, clique com botão direito em "Este Computador" -> "Mapear unidade de rede".
   - Escolha a letra `Z:` e informe o caminho `\\<IP_DO_CASAOS>\dev` (ou o nome compartilhado).
3. **Abrir a pasta no Antigravity:**
   - Abra a unidade `Z:` no Antigravity.
   - Qualquer arquivo editado por você ou pelo Antigravity é salvo instantaneamente no servidor.
4. **Variáveis de Ambiente Locais:**
   - Em `Saves/postgres.env`, aponte para a porta do banco Dev:
     ```env
     DATABASE_URL=postgresql://postgres:postgres@<IP_DO_CASAOS>:5433/natumhub_dev
     ```

---

## 6. Fluxo Operacional no Dia a Dia

### Como atualizar o banco de testes (Espelhamento)
Sempre que quiser atualizar o banco de desenvolvimento com os lotes, pesagens e movimentações mais recentes da fábrica:
- No terminal do servidor (ou via SSH), execute:
  ```bash
  bash scripts/espelhar_banco.sh
  ```
- O script limpa o banco de dev e injeta uma réplica exata do banco de produção em poucos segundos.

### Como promover a versão Beta para Produção
Depois de testar suas alterações na porta `3002` (`http://<IP_DO_CASAOS>:3002`) e validar que tudo funciona perfeitamente:
- No terminal do servidor, execute:
  ```bash
  bash scripts/promover_para_producao.sh
  ```
- O script recompila a imagem com as alterações validadas e recarrega o container de produção na porta `3001` sem derrubar a operação da fábrica.
