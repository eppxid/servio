# Acesso por link pessoal + aparelho (08/11/2026)

Pedido do usuário: trocar o cadastro com e-mail e senha por um link pessoal que o líder gera.
O link fica preso aos aparelhos da pessoa. Uma pessoa pode ter N aparelhos (celular pessoal,
celular da empresa, PC).

## Fluxo

1. **Líder gera o convite.** Equipe → Membros → "Convidar pessoa". O líder digita nome e
   sobrenome. O Servio gera o link `/acesso/<token>` e abre a folha de compartilhar do aparelho
   (`navigator.share`), igual a compartilhar um reels para o WhatsApp. Sem `navigator.share`
   (PC): botões "Enviar por WhatsApp" (`https://wa.me/?text=`) e "Copiar link".
2. **Primeiro uso.** A pessoa abre o link. A tela mostra "Olá, Fulano". A pessoa marca o
   consentimento (LGPD art. 11 I) e toca em "Entrar". O Servio cria a conta (sem e-mail e sem
   senha), registra o aparelho, abre a sessão e põe a pessoa no ministério como voluntário
   **aprovado** (o líder já escolheu a pessoa). Depois: tela "Onde quer servir" (funções).
3. **Mesmo aparelho de novo.** O cookie do aparelho confere: a sessão abre sem pergunta.
4. **Aparelho novo com o mesmo link.** A tela pergunta "Você é Fulano Sobrenome?".
   - **Sim:** o Servio cria um pedido de aparelho e avisa os líderes (push). A tela espera
     (consulta a cada 5 s). Líder aprova → a sessão abre nesse aparelho. Líder recusa → a tela
     diz "Pedido recusado. Fale com o líder".
   - **Não:** a pessoa digita o nome e o sobrenome dela. O Servio cria um pedido de convite
     novo e avisa os líderes. O líder abre o pedido e cai na tela "Convidar pessoa" com nome e
     sobrenome já preenchidos (gera e compartilha um link novo). Este aparelho não ganha acesso
     ao link original.
5. **Gestão.** O líder vê os aparelhos de cada membro e revoga qualquer um. A pessoa vê e
   remove os próprios aparelhos no Perfil. O líder também gera "link de acesso" para um membro
   que já existe (ex.: conta antiga com senha, ou quem perdeu todos os aparelhos).

## Decisões técnicas

| Ponto | Decisão | Motivo |
|---|---|---|
| Identificador do aparelho | Token aleatório de 32 bytes num cookie `servio_aparelho` (httpOnly, secure, sameSite=lax, maxAge 400 dias). O banco guarda só o SHA-256. | O navegador não dá acesso ao MAC. Fingerprint (impressão digital do navegador) é instável e é rastreamento — pior para a LGPD. |
| Token do link | 32 bytes hex; o banco guarda só o SHA-256 (`token_hash`). | Vazamento do banco não entrega links válidos (art. 46). |
| Validade do link | 14 dias até o 1º uso. Depois do 1º uso, o link vira o link de acesso da pessoa e não expira (o aparelho novo sempre passa pelo líder). Revogável. | Pedido do usuário: reabrir pelo mesmo link. |
| Quem aprova | Líder aprovado do ministério do convite, ou admin. | Mesmo critério de `temPapel`. |
| Sessão | Continua `iron-session` (`escala_sessao`). A sessão guarda `aparelhoId`. `usuarioAtual()` recusa sessão cujo aparelho foi revogado. Sem sessão mas com cookie de aparelho válido → abre a sessão sozinho. | Revogar o aparelho derruba o acesso na hora. |
| E-mail e senha | Ficam **opcionais**. `/entrar` continua para admin e contas antigas (recuperação quando não há líder para aprovar). Conta nova por link nasce sem e-mail e sem senha. | O admin precisa de uma porta de entrada que não depende de outro aprovador. |
| Convite antigo por ministério (`/convite/<token>`) | A rota continua funcionando; o botão "Gerar convite" da Equipe passa a ser o convite pessoal. | Links antigos já enviados não quebram. |
| iPhone: Safari × app instalado | São armazenamentos separados: instalar o PWA depois de abrir no Safari conta como aparelho novo (passa pelo líder uma vez). A tela de primeiro uso sugere instalar o app antes de tocar em "Entrar". | Limitação do iOS. |
| Android: instalar o app | Componente `InstalarApp` (reusável): no Chrome/Edge/Samsung Internet captura `beforeinstallprompt` e mostra o botão "Instalar o app" (abre o diálogo nativo). Sem o evento (Firefox, diálogo já recusado, navegador do WhatsApp) mostra o passo a passo: "Abra no Chrome → menu ⋮ → Instalar app (ou Adicionar à tela inicial)". No iPhone mostra o passo do Safari. App já instalado (`display-mode: standalone`) → some. No Android o app instalado divide os cookies com o Chrome: instalar depois de entrar **não** vira aparelho novo. | Pedido do usuário (08/11): Android também precisa do caminho de instalação. |
| Link aberto dentro do WhatsApp | O navegador interno do WhatsApp guarda cookies à parte e não instala o app. A tela do link detecta o navegador interno (user agent com `WhatsApp`/`wv`) e pede "Abra no Chrome (⋮ → Abrir no navegador)" / "Abra no Safari" antes do "Entrar". | Evita registrar um aparelho que some quando a pessoa sai do WhatsApp. |

## Modelo de dados (migração 0009)

- `usuarios.email` e `usuarios.senha_hash` passam a aceitar nulo. O índice único
  `(igreja_id, email)` continua (nulos não colidem).
- `convites_pessoais`: `id`, `igreja_id`, `ministerio_id`, `nome`, `sobrenome`, `token_hash`
  (único), `criado_por` (usuário), `usuario_id` (nulo até o 1º uso; preenchido também quando o
  líder gera link para membro existente), `expira_em`, `usado_em`, `revogado_em`, `criado_em`.
- `aparelhos`: `id`, `igreja_id`, `usuario_id`, `token_hash` (único), `rotulo` (ex.:
  "iPhone · Safari", tirado do user agent), `criado_em`, `ultimo_uso_em`, `revogado_em`.
- `pedidos_acesso`: `id`, `igreja_id`, `convite_id`, `tipo` (`mesma_pessoa` | `outra_pessoa`),
  `nome`, `sobrenome` (só em `outra_pessoa`), `aparelho_token_hash` (só em `mesma_pessoa`:
  o aparelho que espera), `rotulo`, `status` (`pendente` | `aprovado` | `recusado` | `atendido`),
  `decidido_por`, `criado_em`, `decidido_em`.

## Regras LGPD e leis (obrigatórias em todas as tarefas)

Base: LGPD (Lei 13.709/2018), Guia de Cookies da ANPD (2022), Marco Civil (Lei 12.965/2014).
A participação num ministério da igreja revela convicção religiosa: **dado sensível**
(art. 5º II). Por isso:

1. **Pré-cadastro mínimo.** Antes do consentimento, o Servio guarda só nome, sobrenome e
   ministério no `convites_pessoais`. Não cria `usuarios` antes do aceite. Convite não usado é
   apagado na expiração (rotina de limpeza).
2. **Consentimento destacado (art. 11 I)** no primeiro uso, antes de criar a conta — o mesmo
   `CampoConsentimento` de hoje. Sem a marca, a conta não nasce.
3. **Cookie de aparelho = estritamente necessário** (autenticação). Não pede banner
   (Guia ANPD), mas a política de privacidade declara o cookie, a finalidade e o prazo.
4. **Sem MAC, sem fingerprint, sem IP guardado.** O rótulo do aparelho vem do user agent,
   só para a pessoa reconhecer o aparelho na lista.
5. **Pedidos de acesso** guardam só nome digitado e rótulo. A limpeza apaga o pedido 30 dias
   depois da decisão (ou 30 dias pendente).
6. **Direitos do titular (art. 18).** A pessoa vê e remove os próprios aparelhos no Perfil.
   A exclusão de conta apaga aparelhos, convites pessoais e pedidos dela.
7. **Mensagem do WhatsApp mínima:** "Olá, {Nome}! Seu link de acesso ao Servio: {link}".
   Não cita igreja nem ministério: a mensagem passa por terceiro (WhatsApp/Meta, fora do
   Brasil — art. 33) e o compartilhamento é ato do líder.
8. **Segurança (art. 46):** tokens só em hash; limite de pedidos (máx. 5 pedidos pendentes por
   convite; máx. 20 por hora por igreja); o link nunca abre sessão num aparelho novo sem o líder.
9. **Textos:** `/privacidade` e `/termos` ganham as seções de link pessoal, aparelho e pedido;
   `TERMOS_VERSAO` sobe (força o novo aceite). Os textos seguem RASCUNHO até a revisão jurídica.
10. **Marco Civil art. 15** (guarda de registro de acesso por 6 meses) vale para provedor com
    fim econômico. O Servio é gratuito e sem fim econômico: não guarda IP (regra 4). Registrar
    essa leitura no checklist; o advogado confirma.

Pontos para o advogado (não bloqueiam o código): pré-cadastro do nome pelo líder (base legal
antes do aceite), voluntários menores de idade (art. 14), transferência via WhatsApp.
