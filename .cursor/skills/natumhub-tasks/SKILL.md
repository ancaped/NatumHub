---
name: natumhub-tasks
description: >-
  A antiga fila do mapa (mapa_tasks, /api/mapa/tasks, task.md) não existe mais:
  desde 2026-11-08 a fila do Nexus é uma só, a de feedbacks (central
  Desenvolvimento → Fila de Demandas). Use quando o usuário mencionar task.md,
  "fila do mapa", "executa as tasks" ou colar um bloco "# Nexus — Task queue",
  para redirecionar à fila de feedbacks e à skill natumhub-resolve-bugs.
---

# Nexus — Skill: fila do mapa (aposentada)

## O que mudou

- Decisão do Edson (2026-11-08): **uma fila só**. As tarefas abertas de `mapa_tasks` viraram feedbacks na
  triagem (`id` = `mapa_<id antigo>`, página `Desenvolvimento`) pela migração `103_mapa_tasks_para_feedbacks.sql`.
- As rotas `/api/mapa/tasks*` e o `task.md` saíram. O assistente "Novo módulo" abre um chamado na triagem com o
  `module_key` do módulo novo.

## O que fazer

1. Trabalho a executar está na fila de feedbacks: siga a skill `natumhub-resolve-bugs`
   (status `queued`/`in_progress` → resolver → `awaiting_review`).
2. Chamado de módulo novo: siga a skill `natumhub-modulos`.
3. Conteúdo colado de um `task.md` antigo: trate como pedido do usuário; se ainda valer, ele pode virar um
   feedback pela tela (Reportar na ficha do módulo).
