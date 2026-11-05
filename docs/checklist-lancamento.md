# Checklist de lançamento — Escala Igreja — 2026-11-05

Classificação: público (só /entrar, /primeiro-acesso, /convite, /privacidade, /termos) + logado · sem venda (uso gratuito, não B2C) · a igreja é **controladora**; a PI System opera o sistema e atende o canal do titular · dado sensível (convicção religiosa, LGPD art. 11).

Dados pessoais (tabela.coluna → finalidade → exclusão):

| Coluna | Finalidade | Exclusão / retenção |
|---|---|---|
| usuarios.nome | identificar na escala, chat, ranking | anonimizado ("Voluntário removido") — `src/lib/lgpd/titular.ts:215` |
| usuarios.email | login | trocado por `removido-<id>@anonimo.invalid` (coluna NOT NULL) — `titular.ts:217` |
| usuarios.telefone, usuarios.foto_url | contato do líder; foto (opcionais) | nulos na anonimização — `titular.ts:218` |
| usuarios.senha_hash | login (bcrypt 12) | valor inválido na anonimização |
| usuarios.agenda_token | link .ics | apagado na anonimização |
| indisponibilidades.* (motivo) | evitar escala na data | apagadas na exclusão e 90 dias após passar — `src/lib/lgpd/limpeza.ts:25` |
| mensagens.texto | chat da escala | apagadas na exclusão e 180 dias após o evento — `limpeza.ts:15` |
| reconhecimentos.texto | agradecimento | os escritos pelo titular são apagados na exclusão |
| push_inscricoes.* | aviso no aparelho | apagadas na exclusão |
| escala_itens (presença) | indicadores do ministério | mantidos sem identificação (passado); futuros voltam a vaga |
| tentativas_login.email_hash | limite de tentativas | apagadas após 1 dia — `limpeza.ts:31` |
| lgpd_registros | prova do pedido do titular (quem fez e quando) | mantido (sem dado pessoal além do id) |

| # | Item | Situação | Evidência | Ação |
|---|------|----------|-----------|------|
| 1 | Política de privacidade acessível | ✅ | `src/app/privacidade/page.tsx` (finalidades, base legal l.46, quem vê l.52, art. 33 l.66, retenção l.72, encarregado l.103); link no rodapé `src/app/entrar/page.tsx:78`, `src/app/primeiro-acesso/page.tsx:103`, `src/app/convite/[token]/page.tsx:68,141` | Revisão jurídica (pendência do usuário) |
| 2 | Termos de uso e aceite gravado | ✅ | `src/app/termos/page.tsx`; aceite em `usuarios.consentimento_em`/`termos_versao` (`src/db/schema.ts:42-43`); nova versão pede aceite no login (`src/app/entrar/page.tsx:26` → `src/app/entrar/termos/page.tsx`) | Revisão jurídica |
| 3 | Consentimento de cookies | N/A | só o cookie de sessão `httpOnly` (`src/lib/auth.ts:24`); procurei `gtag`, `fbq`, `hotjar`, `clarity`, `document.cookie` em src/: nada | Citado na política (l.39) |
| 4 | Finalidade no ponto de coleta; consentimento destacado | ✅ | checkbox desmarcado e obrigatório `src/lib/lgpd/ui.tsx:23` usado em `primeiro-acesso/page.tsx:98`, `convite/[token]/page.tsx:129`; servidor recusa sem ele `src/lib/ministerios/nucleo.ts:209`; sem marketing | — |
| 5 | Cancelamento / reembolso | N/A | serviço gratuito, sem venda | — |
| 6 | Só o necessário; opcionais | ✅ | telefone e foto opcionais `src/app/(app)/perfil/page.tsx:65,76`, `convite/[token]/page.tsx:122`; motivo opcional e só do usuário `perfil/page.tsx:135` | — |
| 7 | Acesso, correção, exclusão; canal do encarregado | ✅ | exportação `src/app/(app)/perfil/privacidade/exportar/route.ts` + `titular.ts:28`; exclusão/revogação com senha `titular.ts:254`; admin a pedido `titular.ts:267`; correção no Perfil; contato `IGREJA_CONTATO` (`.env.example`) | — |
| 8 | Google Analytics | N/A | procurei `gtag\|googletagmanager\|GA_` em src/: nada | — |
| 9 | Scripts de rastreamento | ✅ | CSP `script-src 'self'` `next.config.ts:5`; nenhum `<script src=` externo | — |
| 10 | Terceiros com dado pessoal na política | ✅ | Vercel e Neon (EUA, art. 33) `privacidade/page.tsx:66`; Web Push (serviço do navegador) citado na l.37; Spotify/Deezer só recebem o id da música | — |
| — | Segurança e logs | ✅ | bcrypt 12 `src/lib/auth-core.ts:9`; 5 tentativas/15 min `auth-core.ts:11`; cookie httpOnly/secure/lax `auth.ts:24-25`; tokens 32 bytes `nucleo.ts:135`, `src/lib/trocas/ics.ts:12`; CSP e cabeçalhos `next.config.ts:24-28`; logs só com `e.message` técnico (`src/lib/notificar.ts:31`, `src/lib/push/enviar.ts:53`, `src/lib/gamificacao/consulta.ts:244`); cron com `timingSafeEqual` `src/app/api/cron/limpeza/route.ts:14`; `pnpm audit --prod`: 0 vulnerabilidades | Ver "Auditoria de segurança" |
| 11 | Acessibilidade geral | ⚠️ | revisão por busca (não rodei a skill `fixing-accessibility` completa): rótulos `<label>` em todos os formulários, `aria-label` em campos sem rótulo (`src/app/(app)/ministerios/page.tsx:105`) | Rodar `fixing-accessibility` nas telas principais |
| 12 | Texto alternativo | N/A | procurei `<img` em src/: nada (foto não é exibida) | — |
| 13 | Contraste 4.5:1 | ✅ | `src/app/globals.css`: texto #0f172a, suave #64748b (4.5:1 sobre #f8fafc), botão branco sobre #1d4ed8 | — |
| 14 | Teclado e foco | ✅ | procurei `outline-none` e `div onClick`: nada; só `<button>`/`<a>` nativos | — |
| 15 | Botões com nome claro | ✅ | botões de ícone têm `aria-label` (`repertorio/page.tsx:130,137`) | — |
| 16 | Depoimento falso | N/A | procurei `depoimento\|testimonial`: nada | — |
| 17 | Promessa sem prova | N/A | procurei "o melhor", "100%", "garantido": nada | — |
| 18 | Direito de uso de imagens | ⚠️ | `public/icons/` (ícones do PWA) sem registro de origem | Confirmar a origem dos ícones |
| 19 | Dados legais da controladora | ✅ | nome, CNPJ, endereço e contato vêm de `IGREJA_*` (`src/lib/lgpd/termos.ts:13`; valores em `.env.example`); vazio mostra "a informar" | Configurar as variáveis no Vercel |
| 20 | Leis aplicáveis e foro | ✅ | `src/app/termos/page.tsx:62` (LGPD, Marco Civil, foro da sede) | Revisão jurídica |

## Auditoria de segurança (00-visao.md → "Segurança e LGPD")

- **Sessão, papel e igreja_id:** toda page/route/Server Action de `src/app` chama `exigirUsuario`/`exigirPapel`/`exigirUsuarioSemTroca`/`usuarioAtual`, ou token (.ics) ou `CRON_SECRET`; as exceções são as públicas (`/entrar`, `/primeiro-acesso`, `/convite`, `/privacidade`, `/termos`, `/sair`). Os núcleos filtram por `igreja_id` e conferem o dono (ex.: `src/app/(app)/perfil/acoes.ts` exclusão de período, `src/lib/chat/nucleo.ts` `exigirAcessoChat`).
- **Contato de colega:** telefone e e-mail só saem em `detalheMinisterio` para líder/admin (`src/lib/ministerios/nucleo.ts:350,359`). Agenda, chat, ranking, repertório e painel selecionam só nome. Teste: `tests/lgpd.test.ts` ("contato de colega não vaza").
- **Logs:** nenhum log com senha, token, e-mail, telefone ou texto.
- **Tokens:** 32 bytes `randomBytes` (convite e .ics); push usa o endpoint do navegador.
- **Corrigido nesta tarefa (um commit cada):**
  1. `next.config.ts`: `frame-src 'none'` bloqueava os players; agora libera só `open.spotify.com` e `widget.deezer.com` (regra "Cabeçalhos").
  2. `package.json`: override `next>postcss ^8.5.32` (2 altas: GHSA-qx2v… path traversal e leitura de arquivo via sourceMappingURL). `pnpm audit --prod` → 0.
  3. `src/lib/ministerios/nucleo.ts`: o cadastro por convite gravava `consentimento_em` sem pedir consentimento; agora recusa sem o checkbox e grava `termos_versao`.
- **Risco residual (não bloqueia):** CSP com `script-src 'unsafe-inline'` (Next sem nonce); `POST /api/push/inscricao` reatribui um endpoint já conhecido a outro usuário (o endpoint é segredo do navegador).

## Bloqueia o go-live
- Nada no código. Pendência do usuário: revisão jurídica da política e dos termos (marcados RASCUNHO) e conferência dos dados reais da igreja nas variáveis `IGREJA_*` do Vercel.

## Pode ir depois
- Rodar a skill `fixing-accessibility` nas telas principais (item 11).
- Registrar a origem dos ícones de `public/icons` (item 18).
- Nonce na CSP para tirar `'unsafe-inline'`.

## Rascunhos (revisão jurídica obrigatória)
- `src/app/privacidade/page.tsx` e `src/app/termos/page.tsx`, com o marcador "RASCUNHO — revisão jurídica obrigatória antes de publicar" no topo.
