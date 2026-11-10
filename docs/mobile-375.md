# Checklist mobile-375

Cinco regras para telas de 375px. Reuse em outros apps. Teste de referência: `e2e/mobile-375.spec.ts`.

## 1. Tabela vira cartão abaixo de 640px
Cada `td` leva `data-label`. O CSS mostra o rótulo antes do valor (`src/ui/kit/kit.css`, classe `.table`).
```css
@media (max-width: 639px) {
  .table, .table tbody, .table tr, .table td { display: block; }
  .table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .table td { display: flex; justify-content: space-between; }
  .table td::before { content: attr(data-label); }
}
```

## 2. Valor grande numa linha só
```css
.stat__val { font-size: clamp(20px, 7vw, 30px); white-space: nowrap; font-variant-numeric: tabular-nums; }
```

## 3. Campos com 16px ou mais e teclado certo
Fonte menor que 16px faz o iOS ampliar a tela ao focar. Use também `type`, `inputMode` e `autoComplete`.
```html
<input type="email" inputmode="email" autocomplete="email" />
<input inputmode="numeric" autocomplete="one-time-code" />
```

## 4. Alvo de toque com 44×44px ou mais
Aplique só em tela de toque (`src/app/globals.css`, `src/components/app/app.css`).
```css
@media (pointer: coarse) { .btn, .btn--sm, .tbtn { min-height: 44px; } }
```

## 5. Barra fixa com safe-area
```css
.barra-fixa { position: fixed; bottom: 0; padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
```
Exija `viewport-fit=cover` no `<meta name="viewport">`.

## Como testar
```
pnpm build
npx playwright test e2e/mobile-375.spec.ts
```
O teste usa viewport 375×812 com `hasTouch` e `isMobile`. Ele confere nas rotas `/entrar`, `/inicio`, `/painel`, `/perfil` e `/lider/equipe`:
- `scrollWidth` ≤ 375;
- fonte dos campos ≥ 16px;
- `button` e `a.btn` com 44×44px ou mais;
- `/painel`: tabela em cartões (quando há linhas) e `.stat__val` em uma linha.

A regra 5 não tem teste automático. Confira a barra fixa num aparelho com entalhe.

## Pendências
- Nenhuma falha aberta. Dois ajustes de 1 linha entraram com o teste: `.tbtn` e `.btn--sm` passaram a 44px em `pointer: coarse`.
- O teste de tabela em cartões só roda se o banco tiver escalas publicadas (rode a suíte completa).
