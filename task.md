# Nexus — Task queue

> **Agente:** preferir `GET /api/mapa/tasks?status=open` (Postgres). Fallback: itens em **Open** abaixo.
> Ao concluir: `PATCH /api/mapa/tasks/:id` `{ "status":"done" }` **ou** marcar md (`Status: done`, mover para **Done`).
> Não expandir escopo além de `Type` / `Targets` / `Payload`.
> Skill: `natumhub-tasks`. Hub: view `mapa_arquitetura`. Export: `GET /api/mapa/tasks/export.md`.

## Open

_(nenhuma task aberta)_

## Done

_(vazio)_
