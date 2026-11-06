# Servio — app v2: dois modos, calendário com vagas e escala automática

Data: 2026-11-06. Aprovado pelo usuário no chat (abordagem A, desenho em 3 etapas).
Piloto: ministério **Mídia** (Projeção, Transmissão, Iluminação; lista aberta para cadastro).

## Problema

1. O portal tem cara de site administrativo, não de aplicativo. Nada é intuitivo.
2. Não existe calendário dos cultos.
3. Não existe quantidade de vagas por função. Cada escala começa do zero.
4. O líder escolhe cada nome à mão. Não há sugestão.
5. O voluntário não diz onde quer servir. O líder descobre por fora.

O código já tem: ministérios, funções, vínculo membro × função, eventos recorrentes, indisponibilidade,
escala por evento × ministério com um item por vaga (`escala_itens.usuario_id` aceita nulo), trocas,
check-in, chat, repertório, painel e pontos. A v2 reaproveita tudo isso.

## Decisões

| Tema | Decisão | Motivo |
|---|---|---|
| Plataforma | PWA com cara de app (Next.js atual) | Custo zero, Web Push já existe, sem loja. App nativo fica fora. |
| Modos | Um app; modo **voluntário** (padrão) e modo **líder** (chave no topo, só líder/admin) | O mesmo usuário serve e lidera. |
| Tipo de culto | `recorrencias` ganha `nome` (ex.: "Culto de domingo 18h") | O modelo de vagas pertence ao tipo de culto. |
| Vagas | Tabela nova `vagas_modelo` (recorrência × ministério × função → quantidade) | Uma fonte de verdade para gerar as vagas vazias. |
| Interesse do voluntário | `membro_funcoes` ganha `status` (`desejada` \| `aprovada`) | O voluntário pede; o líder aprova. Só `aprovada` entra na escala automática. |
| Escala automática | Sugestão em rascunho; o líder revisa e publica | Pessoa decide; o sistema faz o trabalho repetitivo. |
| Funções | Sugestões por ministério + cadastro livre | Cada igreja tem nomes próprios. |

## Etapa 1 — App e dois modos

### Modo voluntário (padrão)
Barra de abas no rodapé (celular) ou barra de ícones (desktop), 4 itens:

1. **Início**
   - Cartão grande da próxima escala: dia, hora, culto, ministério, função, colegas, repertório.
   - Botões **Confirmar** e **Recusar** com 1 toque (recusa pede confirmação; mostra aviso de 48 h).
   - Lista curta: escalas pendentes de resposta, trocas abertas para mim, avisos.
   - Estado vazio útil: "Você ainda não está em um ministério" → botão **Quero servir**.
2. **Agenda**: calendário mensal com meus dias de escala e minhas folgas. Toque no dia = detalhes.
3. **Folgas**: marcar datas indisponíveis no calendário (toque no dia; período opcional).
4. **Perfil**: dados, **Onde quero servir**, avisos, privacidade, sair, chave de modo (se líder).

### Modo líder
Chave **Modo líder** no topo, visível só para quem lidera algum ministério ou é admin. Lembra a
última escolha. Abas:

1. **Cultos**: calendário mensal (Etapa 2). Na Etapa 1 mostra a lista dos próximos cultos.
2. **Escalar**: cultos do mês com vagas abertas, em ordem de data.
3. **Equipe**: membros, funções aprovadas, pedidos pendentes (entrada e funções desejadas).
4. **Painel**: indicadores atuais.

### Onde quero servir (pedido do usuário)
- No cadastro (convite e primeiro acesso) e no Perfil: o voluntário escolhe ministérios e, em cada
  um, as funções que deseja. Grava `membros_ministerio` (`pendente`) e `membro_funcoes` (`desejada`).
- O líder vê os pedidos em **Equipe** e aprova o membro e cada função (`desejada` → `aprovada`).
- Recomendação ao líder: "3 pessoas querem servir em Iluminação" no topo de Equipe e no culto com
  vaga aberta naquela função ("Sugestão: Ana quer servir em Iluminação — aprovar?").

### Primeiro acesso guiado (admin)
3 passos com barra de progresso, cada um pulável:
1. Ministério + funções (chips sugeridos: Mídia → Projeção, Transmissão, Iluminação; campo livre).
2. Tipos de culto recorrentes (nome, dia da semana, hora).
3. Convidar a equipe (link de convite para WhatsApp).

### Aparência de app
- Telas cheias no celular, cabeçalho curto, ação principal grande no polegar (rodapé fixo da tela).
- Folhas inferiores (bottom sheet) para escolher pessoa, confirmar recusa e filtros, em vez de páginas.
- Kit layout-fluido continua (tokens, claro/escuro). Ícones com rótulo no rodapé.
- Desktop: o mesmo app em coluna central larga, com a barra de ícones.

## Etapa 2 — Calendário e vagas

### Dados
- `recorrencias.nome text not null default 'Culto'`.
- `vagas_modelo (id, igreja_id, recorrencia_id, ministerio_id, funcao_id, quantidade int > 0)`, único
  por (recorrência, ministério, função).
- `ministerios.limite_mensal int not null default 4` (usado na Etapa 3).

### Regras
1. Ao criar/estender os eventos de uma série, para cada ministério com modelo: cria a escala em
   `rascunho` com N itens vazios por função (`usuario_id` nulo). Não duplica se já existir.
2. Alterar o modelo vale para cultos futuros sem escala publicada; publicada não muda sozinha.
3. Culto avulso: na criação escolhe "copiar vagas de" um tipo de culto, ou define as vagas na hora.
4. Preenchimento = itens com pessoa ÷ total de itens, por ministério.

### Telas
- **Cultos (líder)**: calendário mensal; cada culto mostra uma pílula por ministério "Mídia 3/4" em
  verde (completo), amarelo (faltando) ou cinza (sem escala). Navegação por mês com gesto e setas.
- **Culto (líder)**: funções com as vagas; vaga vazia = botão "Escolher" → folha inferior com pessoas
  filtradas (tem a função aprovada, não está de folga, não está no mesmo culto), com contagem de
  escalas no mês. Botão **Publicar** quando houver ao menos 1 vaga preenchida.
- **Tipos de culto (líder/admin)**: lista; cada tipo abre o modelo de vagas por ministério
  (função + quantidade com botões − / +).
- **Agenda (voluntário)**: mesmo componente de calendário, filtrado para mim.

## Etapa 3 — Escala automática

### Algoritmo (função pura, testável)
Entrada: vagas vazias do mês de um ministério, membros com funções `aprovada`, folgas, escalas já
existentes (mês e últimos 60 dias), `limite_mensal`.
Para cada vaga, em ordem de data e depois de função com menos candidatos:
1. Candidatos = membros aprovados com a função aprovada, sem folga no dia, fora do mesmo culto,
   abaixo do `limite_mensal` no mês.
2. Ordena por: menos escalas nos últimos 60 dias; depois menos escalas no mês; depois sem escala no
   dia anterior; desempate estável por id.
3. Escolhe o primeiro. Sem candidato = vaga fica vazia e entra no resumo.
Saída: lista de (vaga, pessoa) + vagas sem candidato. Determinística para a mesma entrada.

### Telas
- Botão **Sugerir escala do mês** (Cultos e Escalar), por ministério. Preenche só vagas vazias de
  escalas em rascunho. Nunca sobrescreve escolha manual nem escala publicada.
- Resumo: "18 de 20 vagas preenchidas; 2 sem candidato (Iluminação, 15/11 e 22/11)" + atalho para
  as funções desejadas por pessoas ainda não aprovadas (recomendação).
- **Publicar mês**: publica as escalas revisadas e dispara os avisos (Web Push atual).
- Desfazer: aviso com **Desfazer** limpa só o que a sugestão preencheu (guardar ids na resposta).

## Fora do escopo (backlog)
Aniversariantes, comunicados, checklist por função, ensaios, cifras/transposição, matriz pessoas ×
datas, app nativo, WhatsApp API.

## Testes e aceite
- Unitários: geração de vagas pelo modelo; algoritmo de sugestão (folga, limite, rodízio, mesmo
  culto, sem candidato, determinismo); transição `desejada` → `aprovada`.
- E2E (Playwright, celular 390×844): admin faz o primeiro acesso guiado com a Mídia → cria "Culto de
  domingo 18h" com 2 Projeção + 1 Transmissão + 1 Iluminação → voluntário entra pelo convite e
  escolhe funções → líder aprova → calendário mostra "Mídia 0/4" → sugerir → publicar → voluntário
  vê a escala no Início e confirma.
- Prints celular e desktop, claro e escuro, de Início, Agenda, Cultos, Culto e Equipe a cada etapa.
- Uso real: o executor de cada etapa percorre o fluxo como líder e como voluntário no app rodando
  (não só testes) e descreve o que ficou estranho.

## Migrações
Aditivas: colunas novas com default, tabela nova. `membro_funcoes.status` default `aprovada` para os
vínculos existentes. Rodar no Neon de produção depois de cada etapa publicada.
