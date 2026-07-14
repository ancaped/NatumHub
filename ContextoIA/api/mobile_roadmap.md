# Roadmap mobile (Almoxarifado / Hub)

O NatumHub já é API Axum + Bearer em `:3001`. Um app (Capacitor / React Native / PWA) na LAN ou VPN pode reutilizar os mesmos endpoints — **sem app compilado nesta fase**.

## Pré-requisitos de rede

- PC **master** acessível (Wi‑Fi empresa, Tailscale/VPN ou HTTPS reverso).
- Auth: `POST /api/auth/login` → `Authorization: Bearer <token>`.
- Header opcional `X-Natum-Device-Id` (já usado pelos clientes desktop).

## Endpoints prioritários (v1 mobile)

| Uso | Rota |
|-----|------|
| Login / sessão | `POST /api/auth/login`, `GET /api/auth/me` |
| Lista almox + saldo | `GET /api/almox/items` |
| Lançar movimento | `POST /api/almox/movements` |
| Histórico | `GET /api/almox/movements` |
| Abaixo do mínimo | `GET /api/almox/replenishment` |
| Notificações | `GET /api/notifications` |

Escopos: operador com `estoque_almoxarifado` (operações) e/ou `compras_almoxarifado` (demandas).

## Fora do escopo do mobile (primeiro)

- Cotações complexas / compras online completas
- Sync ERP / admin / resets
- Supervisão completa de operadores

## Domínio

[`../modulos/almoxarifado.md`](../modulos/almoxarifado.md)
