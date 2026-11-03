# Multi-stage Dockerfile para Nexus Industrial Hub
#
# 1. Compilação do Frontend SPA (React / Vite)
# 2. Compilação do Backend Headless (Rust / Axum)
# 3. Imagem Final Leve (Debian Slim com runtime)

# --- ESTÁGIO 1: BUILD DO FRONTEND ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/Frontend
COPY Frontend/package*.json ./
RUN npm ci --silent || npm install
COPY Frontend ./
# A versão muda a cada commit: declarar só aqui, senão invalida o cache das camadas de cima (npm ci).
ARG APP_VERSION=0.2.0
ENV APP_VERSION=$APP_VERSION
RUN npm run build

# --- ESTÁGIO 2: BUILD DO BACKEND RUST ---
FROM rust:slim-bookworm AS backend-builder
# Paralelismo do rustc. Esta imagem é compilada pelo GitHub Actions (runner de 4 vCPU / 16 GB).
# NUNCA compile no servidor ZimaOS (3,7 GB de RAM): o build derrubou a produção em 20/10/2026.
ARG CARGO_JOBS=4
ENV CARGO_BUILD_JOBS=$CARGO_JOBS
ENV RUST_BACKTRACE=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/Backend
# Camada só das dependências: compila com um código vazio e fica no cache do GitHub (cache-to gha) enquanto
# Cargo.toml/Cargo.lock não mudarem. Assim cada commit recompila só o crate do Nexus (~2 min a menos por build).
COPY Backend/Cargo.toml Backend/Cargo.lock ./
RUN mkdir -p src/bin \
    && echo 'fn main() {}' > src/main.rs \
    && for b in discover_laudos_erp discover_recebimento_erp run_import_recebimento_mp; do echo 'fn main() {}' > "src/bin/$b.rs"; done \
    && touch src/lib.rs \
    && echo 'fn main() {}' > build.rs \
    && cargo build --release --bin nexus-server --no-default-features \
    && rm -rf src build.rs target/release/.fingerprint/nexus-*

WORKDIR /app
# Copia código-fonte necessário para o build
COPY Backend ./Backend
COPY erp-import ./erp-import
# O build.rs do Backend varre Frontend/src para gerar o mapa do código (ficha da central Desenvolvimento).
COPY Frontend/src ./Frontend/src
# Script do PC que a tela de Impressoras oferece para baixar (include_bytes! em ferramentas/impressoras/handlers.rs).
COPY scripts/configurar_pc_nexus.bat ./scripts/configurar_pc_nexus.bat

WORKDIR /app/Backend
# A versão (option_env! em core/app_config.rs) só entra aqui: antes, invalidava a camada das dependências a cada commit.
ARG APP_VERSION=0.2.0
ENV APP_VERSION=$APP_VERSION
# Apaga o target na mesma camada: só o binário interessa, e assim o cache exportado para o GitHub fica pequeno.
RUN cargo build --release --bin nexus-server --no-default-features && \
    cp target/release/nexus-server /app/nexus-server && \
    rm -rf target

# --- ESTÁGIO 3: RUNTIME FINAL (LEVE) ---
FROM debian:bookworm-slim AS runtime

# pg_dump precisa ser da mesma versão do servidor (Postgres 17) ou mais nova: o do Debian bookworm é o 15 e o backup
# falhava com "server version mismatch". Cliente 17 do repositório oficial do PostgreSQL (PGDG).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    postgresql-client-17 \
    && pg_dump --version | grep -q " 17\." \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/nexus

# Cria pasta de dados persistentes
RUN mkdir -p /opt/nexus/Saves

# Copia binário do servidor e frontend estático
COPY --from=backend-builder /app/nexus-server /opt/nexus/nexus-server
COPY --from=frontend-builder /app/Frontend/dist /opt/nexus/Frontend/dist

# Permissão de execução
RUN chmod +x /opt/nexus/nexus-server

# Metadados OCI: o autodeploy lê a versão daqui e o GHCR liga o pacote ao repositório (visibilidade pública).
ARG APP_VERSION=0.2.0
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Nexus" \
      org.opencontainers.image.source="https://github.com/ancaped/NatumHub" \
      org.opencontainers.image.version="$APP_VERSION" \
      org.opencontainers.image.revision="$VCS_REF"

EXPOSE 3001

ENV NEXUS_DATA_DIR=/opt/nexus/Saves
ENV NEXUS_FRONTEND_DIST=/opt/nexus/Frontend/dist
ENV RUST_LOG=info

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["/opt/nexus/nexus-server"]
