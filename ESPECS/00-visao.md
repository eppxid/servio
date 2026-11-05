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

Itens da página comercial do app atual (paridade): escala automática (005), troca entre voluntários (006), gestão de vários ministérios (002), repertório com links de Spotify, Deezer e Cifra Club (010), painel de indicadores e relatórios (011), pontos, medalhas e reconhecimento (012). Aviso: só Web Push + link wa.me (decidido 04/11/2026). Fora do escopo: API oficial do WhatsApp (custo por mensagem) e SMS por celular Android (TextBee).

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
`igrejas`, `usuarios` (nome, email, telefone, foto_url, senha_hash, papel_global, sessao_versao, consentimento_em, termos_versao, anonimizado_em), `ministerios`, `membros_ministerio` (usuario, ministerio, papel lider|voluntario, status pendente|aprovado), `funcoes` (por ministério: "Vocal", "Câmera"…), `membro_funcoes`, `eventos` (titulo, inicio, fim, recorrencia_id), `recorrencias` (regra semanal), `indisponibilidades` (usuario, data_inicio, data_fim, motivo), `escalas` (evento, ministerio, status rascunho|publicada), `escala_itens` (escala, funcao, usuario, status pendente|confirmado|recusado, checkin_em), `trocas` (escala_item, solicitante, substituto, status aberta|aceita|aprovada|recusada), `mensagens` (evento, usuario, texto, criado_em), `push_inscricoes` (usuario, endpoint, chaves), `convites` (ministerio, token, expira_em), `tentativas_login` (email_hash, criado_em).

## Segurança e LGPD (vale para TODAS as tarefas)
O portal guarda dado pessoal (nome, e-mail, telefone, foto, datas de indisponibilidade, presença). Ser voluntário de igreja revela convicção religiosa: é **dado sensível** (LGPD art. 11). A igreja é a **controladora**; base legal = consentimento específico e destacado no cadastro (tarefa 013).
- **Autorização no servidor em toda leitura e escrita:** toda consulta filtra por `igreja_id` e confere o papel (exigirUsuario/exigirPapel). Nunca confiar em id vindo da URL ou do formulário sem conferir o dono (IDOR). Cada tarefa tem pelo menos 1 teste de acesso negado.
- **Mínimo necessário (art. 6 III):** telefone e foto opcionais. O motivo da indisponibilidade é opcional e só o próprio usuário vê; o líder vê só "indisponível". Colegas de escala veem só nome e foto; telefone e e-mail só para líder e admin.
- **Senhas e sessão:** bcryptjs custo ≥ 12; senha mínima de 8 caracteres; cookie `httpOnly`, `secure`, `sameSite=lax`; sessão expira em 30 dias; troca de senha encerra as outras sessões (versão de sessão no usuário).
- **Login:** limite de 5 tentativas erradas por e-mail em 15 min (tabela no Postgres, sem serviço externo); mensagem de erro genérica ("e-mail ou senha inválidos").
- **Tokens (convite, .ics, push):** aleatórios de 32 bytes (crypto), com expiração ou revogação; nunca o id do usuário.
- **Entrada e saída:** validar todo formulário com zod no servidor; sem `dangerouslySetInnerHTML`; links externos só com `rel="noopener noreferrer"`.
- **Cabeçalhos:** CSP, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'` (next.config). A CSP libera só os iframes de Spotify e Deezer (tarefa 010).
- **Logs:** nunca gravar senha, token, e-mail, telefone ou texto de mensagem. Erro para o usuário sem detalhe técnico.
- **Segredos:** só em variável de ambiente; `.env` no .gitignore; `.env.example` sem valor real.
- **Dados no Brasil:** Neon em `sa-east-1` (São Paulo) e funções do Vercel em `gru1` (`vercel.json`, `regions`). Vercel e Neon são empresas dos EUA: a política de privacidade cita isso (art. 33).
- **Sem rastreamento:** sem Google Analytics, pixel ou script de terceiros. Só cookie de sessão (necessário, não pede banner).
- **Retenção:** mensagens de chat apagadas 180 dias após o evento; indisponibilidades passadas apagadas após 90 dias; conta excluída é anonimizada (tarefa 013).
