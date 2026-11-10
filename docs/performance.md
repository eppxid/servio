# Performance em rede lenta

Spec: `e2e/rede-lenta.spec.ts` (roda em `pnpm e2e`). Medida em 10/11/2026.

## Como medir
- Chromium com viewport 375 px, rede 3G lenta (400 ms de latência, 400 kbit/s) e CPU 4x mais lenta, via CDP.
- Cache do navegador desligado: cada tela carrega "a frio".
- Tempo = da navegação até o título (`main h1`) ficar visível.
- KB de JS = soma de `transferSize` dos scripts da tela (`performance.getEntriesByType("resource")`).
- Meta: conteúdo em até 4 s. O spec só falha se a tela não carregar; tempo acima da meta só é registrado.
- O resultado bruto fica em `.next/e2e-results/rede-lenta.json`.
- Build de produção (`next build` + `next start`) em servidor local: o tempo não inclui a latência real até a Vercel.

## Resultado

| Tela | Tempo 3G | KB de JS | Observação |
|---|---|---|---|
| Início / agenda do voluntário (`/inicio`) | 1,8 s | 125 | Dentro da meta |
| Cultos do líder (`/lider/cultos`) | 1,8 s | 128 | Dentro da meta |
| Escalar um culto (`/lider/escalar`) | 1,8 s | 127 | Dentro da meta |
| Chat do culto (`/chat/<id>`) | 1,5 s | 124 | Dentro da meta |
| Perfil (`/perfil`) | 1,3 s | 126 | Dentro da meta |

Todas as telas ficam abaixo de 4 s.

## Conferências
- Imagens sem `loading="lazy"`: 0 nas telas medidas. O admin do e2e não tem foto, então `FotoPerfil` (`<img>` sem `loading`) não foi renderizada; ver Pendências.
- Esqueleto de carregamento: nenhuma tela mostrou esqueleto (`[aria-busy]`, `.skeleton`, `.esqueleto`) e não há `loading.tsx` em `src/`. Em rede lenta a tela fica em branco até o HTML chegar.
- Retorno visual: todas as telas mostraram o título, nenhuma ficou vazia.

## Pendências
Nenhuma tela passou de 4 s. Itens para tarefa nova (não corrigidos aqui, `src/**` fora do escopo):
1. `FotoPerfil` (`src/app/(app)/perfil/FotoPerfil.tsx`): `<img>` sem `loading="lazy"` nem `decoding="async"`.
2. Sem esqueleto/`loading.tsx` nas rotas do grupo `(app)`: sem retorno visual enquanto o servidor responde. A tarefa 053 não aparece integrada nesta base.
3. Os ~125 KB de JS são quase iguais em todas as telas (o grosso é o runtime compartilhado do Next); medir de novo com `ANALYZE` se esse valor crescer.
4. `e2e/mobile-375.spec.ts` falha hoje: o botão `Modo líder` (`role="switch"`) tem 34×91 px, abaixo dos 44 px de alvo de toque, em `/perfil` e `/lider/equipe`.
