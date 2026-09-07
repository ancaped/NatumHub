# Guia de estilo, UI e robustez

Padrão visual **Zinc** (minimalista) e regras que evitam tela branca no React. Caminhos relativos à raiz do repo.

Tokens canônicos: `Frontend/src/index.css` (`:root` HSL). Os valores abaixo são a paleta de *orientação* Zinc; **podem diferir 1–2 pontos de lightness** do CSS real (ex.: fundo no CSS é `hsl(240, 4.9%, 98%)` / zinc-50, não `hsl(240, 5%, 96%)`). Em dúvida, leia `index.css`.

---

## 1. Sistema de cores Zinc

Definido em `Frontend/src/index.css`:

| Token | Orientação | No CSS atual (`:root`) |
|-------|------------|-------------------------|
| Background | cinza quase branco | `--background-hsl: 240, 4.9%, 98%` (zinc-50) |
| Card | branco | `--card-hsl: 0, 0%, 100%` |
| Border | zinc-200 | `--card-border-hsl: 240, 5.9%, 90%` |
| Texto principal | zinc-900 | `--text-primary-hsl: 240, 5.9%, 9%` |
| Texto apoio | zinc-500 | `--text-secondary-hsl: 240, 5.2%, 46.1%` |
| Primary / botão | zinc-900 | `--primary-hsl: 240, 5.9%, 9%` |

Fontes: Inter (sans) + JetBrains Mono. Botões: `bg-zinc-900 hover:bg-zinc-800 text-white`. Cards: `bg-white border-zinc-200`. Página: `bg-zinc-50`.

### Alertas (Estoque e laudos)

* Crítico: `bg-red-50` / `border-red-200` / `text-red-600`
* Atenção: `bg-amber-50` / `border-amber-200` / `text-amber-700`
* Saudável: `bg-emerald-50` / `border-emerald-200` / `text-emerald-600`

Não invente outra paleta. Sem transparências complexas no FeedbackWidget.

---

## 2. Tailwind CSS v4 (especificidade)

Classes saem em `:where()` → especificidade **zero**.

* **Não** use reset universal `* { margin: 0; padding: 0 }` em `Frontend/src/index.css`. Isso anula `p-6`, `space-y-4`, `m-2`.
* Reset só em tags base explícitas: `html, body, p, h1 { ... }`.

---

## 3. Null safety (telas em branco)

SQLite devolve `null`. `.toLowerCase()` / `.map()` sem guarda derruba o módulo.

```typescript
(r.productName || '').toLowerCase();
{item.prices?.map(price => ( ... ))}

const formatDate = (isoString?: string | null) => {
  if (!isoString) return '-';
  try {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(isoString));
  } catch {
    return '-';
  }
};
```

---

## 4. ErrorBoundary

Cada view em `Frontend/src/App.tsx` está em `Frontend/src/components/shared/ErrorBoundary.tsx` (não existe `Frontend/src/components/ErrorBoundary.tsx`).

Crash de render fica no módulo: stack + “Voltar ao Hub”. Não deixe um `null` sem guarda depender só do boundary — ele é a última linha.

---

## 5. FeedbackWidget

`Frontend/src/components/shared/FeedbackWidget.tsx` — botão fixo inferior direito, captura de tela, últimos logs de `Frontend/src/lib/logInterceptor.ts`, `invoke('save_feedback')`.
