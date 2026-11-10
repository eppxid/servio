# Auditoria LGPD — Servio — 2026-11-10

Roteiro: plugin `goul4rt/lgpd-skills` v1.3.0 (commit `f1aedec`), pipeline B "projeto legado", seguido à mão. O plugin não foi instalado. Esta auditoria complementa `docs/checklist-lancamento.md` (05/11 e 08/11) e não refaz os itens dele. É leitura técnica do código, não parecer jurídico.

Enquadramento: a igreja é a **controladora**; a PI System opera o portal. O vínculo com um ministério revela convicção religiosa: é **dado sensível** (LGPD art. 5º II e art. 11). Base legal: consentimento específico e destacado (art. 11 I).

## (a) Revisão do código do plugin

Clone em pasta nova fora do repositório: `E:\Devs\_terceiros\lgpd-skills` (`git clone --depth 1`).

| Ponto | Resultado |
|---|---|
| Arquivos lidos | 64 arquivos: manifestos (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `gemini-extension.json`), `.opencode/plugins/lgpd-skills.js`, `package.json`, `scripts/validate-prisma.mjs`, `.github/workflows/ci.yml`, 19 `SKILL.md` com `references/` e `assets/`, `tests/*.test.ts` |
| Hooks | Nenhum. Sem `hooks.json` e sem chave `hooks` nos manifestos |
| MCP | Nenhum. Sem `mcpServers` e sem `.mcp.json` |
| Scripts | `extract-prisma-annotations.sh` (só `awk` sobre um arquivo local); `validate-prisma.mjs` (roda `prisma validate` em pasta temporária; só no CI do próprio plugin); `.opencode/plugins/lgpd-skills.js` (só registra a pasta `skills/`) |
| Rede | Nenhuma chamada de rede. Os `https://` são links de documentação (GitHub, gov.br, planalto) |
| `.env` / credenciais | Nenhuma leitura. `process.env` aparece só em exemplos de código dentro dos `.md` e no `validate-prisma.mjs` (repassa o ambiente ao `prisma`) |
| Instrução para enviar dado para fora | Nenhuma. Procurei `upload`, `webhook`, `curl`, `fetch(`, "ignore as instruções": nada |
| **Veredito** | **Seguro para leitura.** Usei só os textos de `lgpd-audit`, `lgpd-legacy-retrofit`, `lgpd-data-mapping`, `lgpd-dsar`, `lgpd-retention-erasure`, `lgpd-vendor-audit` e `lgpd-incident-response` como roteiro. Nada do plugin entrou no repositório nem em `~/.claude` |

## (b) Mapa de dados

Colunas com dado pessoal. As tabelas que entraram depois de 05/11 (`drizzle/0007` a `0011`) estão marcadas com **novo**. Base legal de todas as linhas: consentimento (art. 11 I), salvo nota.

| Tabela.coluna | Finalidade | Retenção / exclusão |
|---|---|---|
| usuarios.nome | identificar na escala, chat e ranking | vira "Voluntário removido" na exclusão — `src/lib/lgpd/titular.ts:247` |
| usuarios.email, usuarios.senha_hash | login (só admin e contas antigas; **novo:** colunas aceitam nulo desde `0009`) | nulos na exclusão — `titular.ts:249,252` |
| usuarios.telefone | contato do líder (opcional) | nulo na exclusão — `titular.ts:250` |
| usuarios.foto_url | **sem uso** (foto foi para a tabela `fotos`) | nulo na exclusão — `titular.ts:251`; ver T1 |
| usuarios.agenda_token | link .ics | nulo na exclusão — `titular.ts:256` |
| usuarios.consentimento_em, termos_versao | prova do consentimento (art. 8º § 2º) | mantidos na conta anonimizada |
| fotos.conteudo (**novo**, `0010`) | foto opcional do perfil (bytea no Neon) | linha apagada na exclusão — `titular.ts:198`; "Remover foto" — `src/lib/foto/nucleo.ts:48` |
| convites_pessoais.nome, sobrenome, token_hash (**novo**, `0009`) | pré-cadastro do link pessoal | apagado em 14 dias se não usado — `src/lib/lgpd/limpeza.ts:55-63`; apagado na exclusão — `titular.ts:210`. Base legal do pré-cadastro: ver (f) |
| aparelhos.rotulo, token_hash, ultimo_uso_em (**novo**, `0009`) | entrar sem senha | revogado some em 30 dias — `limpeza.ts:65-73`; apagado na exclusão — `titular.ts:204` |
| pedidos_acesso.nome, sobrenome, rotulo (**novo**, `0009`) | líder confirma aparelho novo | apagado 30 dias após a decisão — `limpeza.ts:44-52`; na exclusão — `titular.ts:209` |
| membro_funcoes.status (**novo**, `0008`) | função desejada × aprovada | apagada na exclusão — `titular.ts:217` |
| escala_itens.recusado_em (**novo**, `0007`) | recusa de escala, indicadores | passado fica sem identificação; futuro volta à vaga — `titular.ts:222-232` |
| indisponibilidades.* | evitar escala na data | 90 dias após passar; apagadas na exclusão |
| mensagens.texto | chat da escala | 180 dias após o evento; apagadas na exclusão |
| reconhecimentos.texto | agradecimento | enviados **e recebidos** apagados na exclusão — `titular.ts:201` (correção C3) |
| repertorio_itens.criado_por | autor do item | id sem nome; a conta fica anonimizada |
| push_inscricoes.endpoint, chaves | aviso no aparelho | apagadas na exclusão e quando o serviço responde 404/410 |
| tentativas_login.email_hash | limite de tentativas (legítimo interesse/segurança, art. 7º IX e art. 46) | 1 dia |
| lgpd_registros | prova do pedido do titular | mantido (só ids) |
| `vagas_modelo` (**novo**, `0008`), `ministerios.limite_mensal` | configuração | sem dado pessoal |

Cookies: sessão (30 dias) e `servio_aparelho` (400 dias, `src/lib/acesso/cookie.ts:4`), os dois necessários. Já declarados em `/privacidade` (seção 2).

## (c) Os 7 itens

| # | Item | Situação | Evidência |
|---|---|---|---|
| 1 | Mapa de dados atualizado | ✅ | tabela (b) acima, com as tabelas de `0007` a `0011` |
| 2 | Dado em excesso; telefone e foto opcionais | ⚠️ | telefone nulo no schema (`src/db/schema.ts:48`); foto só existe se a pessoa envia (`src/lib/foto/nucleo.ts:38`). **Excesso:** `usuarios.foto_url` (`schema.ts:49`) não é mais gravada em lugar nenhum; só aparece na exportação e é anulada (`src/app/(app)/perfil/acoes.ts:39`). Ver T1 |
| 3 | Terceiros citados em `/privacidade` | ✅ (após C2) | Vercel e Neon (art. 33) — `src/app/privacidade/page.tsx:89-95`; WhatsApp (`wa.me`) — `page.tsx:63`; armazenamento da foto = Neon (sem serviço novo). **Faltavam** o serviço de push do navegador e Spotify/Deezer: corrigido em C2 — `page.tsx:96-105` |
| 4 | Log sem máscara | ✅ | os 5 `console.error` gravam só `e.message` técnico: `src/lib/acesso/nucleo.ts:330`, `src/lib/notificar.ts:31,46`, `src/lib/push/enviar.ts:73`, `src/lib/gamificacao/consulta.ts:245`. Nenhum grava e-mail, telefone, token ou texto. `src/lib/push/gerar-vapid.mjs` imprime chaves, mas é script local (`pnpm vapid`). **Risco residual:** o log de requisição do Vercel grava o caminho `/acesso/<token>` (ver T2) |
| 5 | Link pessoal | ⚠️ | token de 32 bytes (`randomBytes(32)`, `src/lib/ministerios/nucleo.ts:264-265`); banco guarda só SHA-256 (`src/lib/acesso/nucleo.ts:24`); expira em 14 dias se não usado (`ministerios/nucleo.ts:8`, `acesso/nucleo.ts:122-147`); aparelho pode ser revogado (`acesso/nucleo.ts:546`, `src/app/sair/route.ts:15`); `Referrer-Policy: strict-origin-when-cross-origin` (`next.config.ts:31`) e CSP sem script externo (`next.config.ts:5`), então o token não sai no Referer. **Falta:** link **já usado** não expira e o líder não tem como revogar ou trocar o link (só a promoção a admin revoga link não usado, `ministerios/nucleo.ts:173-183`). Ver T3. O link também passa pelo WhatsApp quando o líder envia (decisão de produto, já na política) |
| 6 | Prazos | ✅ / ⚠️ | exportação imediata (`src/app/(app)/perfil/privacidade/exportar/route.ts:13`) e exclusão imediata (`src/app/(app)/perfil/privacidade/acoes.ts:32`) cumprem o art. 19 I; política promete resposta em até 15 dias para o resto (`page.tsx:145`), igual ao art. 19 II. **Incidente:** não havia roteiro. Criado `docs/incidente-lgpd.md` (3 dias úteis, Res. ANPD 15/2024, arts. 6º, 9º e 10) |
| 7 | Exclusão apaga foto e tokens | ✅ | foto é bytea no Neon: a exclusão apaga a linha, não só uma URL (`titular.ts:198`), e `foto_url` vai a nulo (`titular.ts:251`); tokens: aparelhos (`titular.ts:204`), link pessoal e pedidos (`titular.ts:205-210`), `.ics` (`titular.ts:256`), sessões (`titular.ts:258`). Teste: `tests/foto.test.ts` ("exclusão de conta apaga") e `tests/lgpd.test.ts` ("conta criada por link exclui a si mesma"). **Resíduo:** backup do Neon (restauração) e cache do navegador (`Cache-Control: private, max-age=31536000` em `src/app/api/foto/[usuarioId]/route.ts:19`) — ver T4 |

Recomendação (boa prática, não exigência da lei): a exclusão já pede confirmação (senha ou a palavra EXCLUIR, `titular.ts:285-304`). Uma segunda tela "tem certeza?" é opcional.

## (d) Correções feitas (um commit por achado)

| # | Achado | Regra | Commit |
|---|---|---|---|
| C1 | Exportação marcava toda foto como `image/webp`; foto JPEG saía com tipo errado | LGPD art. 18 V (portabilidade em formato que abre) | `44882a4` — `src/lib/lgpd/titular.ts:170-172`, teste em `tests/lgpd.test.ts` |
| C2 | Política não citava o serviço de push do navegador nem Spotify/Deezer | LGPD art. 9º V e art. 18 VII (informar com quem há uso compartilhado) | `1ce66f2` — `src/app/privacidade/page.tsx:96-105` |
| C3 | Exclusão mantinha os agradecimentos **recebidos** (texto do colega sobre a pessoa, às vezes com o nome) | LGPD art. 16 e art. 18 VI (eliminação) | `3fc5138` — `titular.ts:201`, `page.tsx:118`, teste em `tests/lgpd.test.ts` |

`TERMOS_VERSAO` **não mudou** (continua `2026-11-08`). C2 e C3 só detalham operadores que já existiam e ampliam a exclusão: não há finalidade nova. Mudar a versão pede novo aceite de todos; deixo para o lote da revisão jurídica.

## (e) Tarefas sugeridas (fora do escopo desta tarefa)

| # | Onde | Achado | Correção proposta |
|---|---|---|---|
| T1 | `src/db/schema.ts:49`, `drizzle/**`, `src/app/(app)/perfil/acoes.ts:39` | `usuarios.foto_url` sem uso (dado em excesso, art. 6º III) | migração que remove a coluna; tirar da exportação e da anonimização |
| T2 | `src/app/acesso/[token]/page.tsx` | o token do link pessoal vai no caminho da URL e aparece no log de requisição do Vercel | ler o token, gravar em cookie curto e redirecionar para `/acesso` sem o token; ou levar o token no fragmento `#` |
| T3 | `src/lib/acesso/nucleo.ts`, `src/app/(app)/lider/equipe/**` | link usado não expira e o líder não troca o link de um voluntário | ação "gerar novo link" que grava `revogado_em` no convite antigo e cria outro |
| T4 | `src/app/api/foto/[usuarioId]/route.ts:19` | foto removida continua no cache dos aparelhos por até 1 ano | `max-age` curto (ex.: 1 dia) com `?v=` na URL, ou `no-store` |
| T5 | `src/db/schema.ts:233` (`convites.token`) | convite antigo por ministério guarda o token em claro (os novos usam hash) | guardar só o hash, como em `convites_pessoais` |

## (f) Pendências do usuário

1. **Revisão jurídica** da política e dos termos (continuam RASCUNHO), incluindo os textos novos de C2 e C3.
2. **Porte (Res. ANPD 2/2022):** confirmar com o advogado se a igreja é agente de pequeno porte. Isso muda os prazos (resposta ao titular e incidente em dobro). Até a confirmação, valem os prazos padrão (15 dias e 3 dias úteis).
3. **Base legal do pré-cadastro** (já listada em 08/11): o líder digita nome e ministério antes do aceite.
4. **Voluntário menor de idade** (art. 14, já listado em 08/11).
5. **Contratos com operadores (art. 39):** guardar o DPA da Vercel e do Neon; o código não comprova isso.
6. **Backups do Neon:** conferir o prazo de restauração do plano (dado apagado continua no histórico até esse prazo) e citar o prazo na política.
7. **Incidente:** a igreja nomeia quem decide e assina as comunicações em `docs/incidente-lgpd.md`.
