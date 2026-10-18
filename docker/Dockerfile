# Multi-stage Dockerfile para Nexus Industrial Hub
#
# 1. Compilação do Frontend SPA (React / Vite)
# 2. Compilação do Backend Headless (Rust / Axum)
# 3. Imagem Final Leve (Debian Slim com runtime)

# --- ESTÁGIO 1: BUILD DO FRONTEND ---
FROM node:20-alpine AS frontend-builder
ARG APP_VERSION=0.2.0
ENV APP_VERSION=$APP_VERSION
WORKDIR /app/Frontend
COPY Frontend/package*.json ./
RUN npm ci --silent || npm install
COPY Frontend ./
RUN npm run build

# --- ESTÁGIO 2: BUILD DO BACKEND RUST ---
FROM rust:slim-bookworm AS backend-builder
ARG APP_VERSION=0.2.0
ENV APP_VERSION=$APP_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Backend/Cargo.toml Backend/Cargo.lock ./Backend/
# Copia código-fonte necessário para o build
COPY Backend ./Backend
COPY erp-import ./erp-import

WORKDIR /app/Backend
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/Backend/target \
    cargo build --release --bin nexus-server --no-default-features && \
    cp target/release/nexus-server /app/nexus-server

# --- ESTÁGIO 3: RUNTIME FINAL (LEVE) ---
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    libpq5 \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/nexus

# Cria pasta de dados persistentes
RUN mkdir -p /opt/nexus/Saves

# Copia binário do servidor e frontend estático
COPY --from=backend-builder /app/nexus-server /opt/nexus/nexus-server
COPY --from=frontend-builder /app/Frontend/dist /opt/nexus/Frontend/dist

# Permissão de execução
RUN chmod +x /opt/nexus/nexus-server

EXPOSE 3001

ENV NEXUS_DATA_DIR=/opt/nexus/Saves
ENV NEXUS_FRONTEND_DIST=/opt/nexus/Frontend/dist
ENV RUST_LOG=info

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["/opt/nexus/nexus-server"]
