# Instalação e Configuração do PostgreSQL para o Nexus

O **Nexus** utiliza o PostgreSQL como seu banco de dados operacional unificado. O banco pode ser hospedado em um **Servidor Dedicado Linux / CasaOS** (recomendado para produção) ou **localmente no Windows** (para desenvolvimento).

---

## Opção 1 — Servidor Linux / CasaOS via Docker (Recomendado para Produção)

Consulte o guia completo: [`migracao_casaos_linux.md`](migracao_casaos_linux.md).

1. No CasaOS ou servidor Linux, suba o container através do arquivo [`../../docker/docker-compose.yml`](../../docker/docker-compose.yml).
2. O PostgreSQL 17 rodará na porta padrão `5432` com persistência de volume.
3. No seu PC de desenvolvimento (Windows), aponte o arquivo `Saves/postgres.env`:
   ```env
   DATABASE_URL=postgresql://postgres:sua_senha@<IP_DO_CASAOS>:5432/natumhub
   ```

---

## Opção 2 — PostgreSQL Local no Windows (Desenvolvimento)

Caso queira rodar o PostgreSQL diretamente na máquina Windows:

### 1. Instalação
1. Baixe o instalador oficial do **PostgreSQL 17** em https://www.postgresql.org/download/windows/
2. Mantenha a porta padrão `5432` e defina uma senha para o superusuário `postgres`.
3. Garanta que o diretório `bin` do PostgreSQL esteja no `PATH` do Windows (para comandos como `pg_dump` e `pg_restore`).

### 2. Criar Banco
Abra o **pgAdmin** ou o terminal `psql` e execute:
```sql
CREATE DATABASE natumhub;
```

### 3. Configurar Conexão
No arquivo `C:\api\Saves\postgres.env`:
```env
DATABASE_URL=postgresql://postgres:sua_senha@localhost:5432/natumhub
```

---

## Backups e Restauração

- **Backup automático:** Execute [`../../scripts/backup_postgres.bat`](../../scripts/backup_postgres.bat) no Windows.
- **Restauração:** Execute [`../../scripts/restore_postgres.bat`](../../scripts/restore_postgres.bat) ou [`../../scripts/restore_postgres.sh`](../../scripts/restore_postgres.sh) no Linux.
