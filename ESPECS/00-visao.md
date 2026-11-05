# EscalaIgreja — visão e decisões

## Objetivo
Portal web gratuito que substitui o app pago de escala de voluntários da igreja.
Funciona no navegador do celular (PWA) — Android e iPhone. O app atual só roda em iPhone.

## Funções do app atual que o portal cobre
| Perfil | Função |
|---|---|
| Líder de ministério | Montar a escala sem conflito de disponibilidade |
| Líder de ministério | Validar o perfil do voluntário (aprovar entrada no ministério) |
| Líder de ministério | Falar com a equipe (aviso + chat da escala) |
| Voluntário | Ver a agenda de escalas |
| Voluntário | Pedir troca quando houver imprevisto |
| Voluntário | Fazer check-in no dia |
| Todos | Chat da escala (por evento) |

Extras baratos: indisponibilidade por data, sugestão automática de escala, aviso no celular (Web Push), link de WhatsApp.

Itens da página comercial do app atual (paridade): escala automática (005), troca entre voluntários (006), gestão de vários ministérios (002), repertório com links de Spotify, Deezer e Cifra Club (010), painel de indicadores e relatórios (011), pontos, medalhas e reconhecimento (012). Aviso oficial por WhatsApp: em decisão (API oficial da Meta cobra por mensagem).

## Decisões
- **Stack:** Next.js 15 (App Router, Server Actions) + TypeScript + Tailwind + Drizzle ORM + Postgres.
- **Hospedagem:** Vercel Free (app) + Neon Free (Postgres). Custo R$ 0. Sem servidor que dorme.
- **Login:** e-mail + senha (bcryptjs) e sessão em cookie assinado (`iron-session`). Sem serviço de e-mail pago. Senha esquecida = líder/admin gera nova senha temporária.
- **Entrada:** admin cria a igreja; voluntário entra por link de convite do ministério; líder aprova.
- **Papéis:** `admin` (igreja toda), `lider` (por ministério), `voluntario`.
- **Aviso no celular:** Web Push (VAPID, pacote `web-push`). iPhone exige PWA instalado na tela inicial (iOS 16.4+).
- **Chat:** mensagens no Postgres; tela atualiza por polling a cada 5 s (sem WebSocket — Vercel Free não mantém conexão).
- **Uma igreja por instalação** no início, mas toda tabela tem `igreja_id` para virar multi-igreja depois.
- **Pasta de código:** `src/app/(rotas)`, `src/lib`, `src/db/schema.ts`, `src/components`.
- **Testes:** Vitest para regras (conflito, sugestão, troca). `pnpm build` tem de passar.

## Modelo de dados (dono: tarefa 001)
`igrejas`, `usuarios` (nome, email, telefone, senha_hash, papel_global), `ministerios`, `membros_ministerio` (usuario, ministerio, papel lider|voluntario, status pendente|aprovado), `funcoes` (por ministério: "Vocal", "Câmera"…), `membro_funcoes`, `eventos` (titulo, inicio, fim, recorrencia_id), `recorrencias` (regra semanal), `indisponibilidades` (usuario, data_inicio, data_fim, motivo), `escalas` (evento, ministerio, status rascunho|publicada), `escala_itens` (escala, funcao, usuario, status pendente|confirmado|recusado, checkin_em), `trocas` (escala_item, solicitante, substituto, status aberta|aceita|aprovada|recusada), `mensagens` (evento, usuario, texto, criado_em), `push_inscricoes` (usuario, endpoint, chaves), `convites` (ministerio, token, expira_em).
