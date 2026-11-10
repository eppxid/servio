# Roteiro de resposta a incidente de segurança — Servio

Base: LGPD art. 48 e Resolução CD/ANPD nº 15/2024 (Regulamento de Comunicação de Incidente de Segurança). Este roteiro é técnico. A decisão de comunicar é da igreja (controladora), com apoio jurídico.

## Papéis

| Papel | Quem | O que faz |
|---|---|---|
| Controladora | a igreja (`IGREJA_NOME`, `IGREJA_CNPJ`) | decide se comunica; assina a comunicação à ANPD e aos titulares |
| Operador técnico | PI System (opera o portal) | detecta, contém, preserva evidências, levanta o escopo; avisa a controladora no mesmo dia |
| Canal do titular / encarregado | contato em `IGREJA_CONTATO` | recebe dúvidas dos titulares; aparece nas comunicações |
| Suboperadores | Vercel (hospedagem, `gru1`) e Neon (banco, `sa-east-1`) | o operador técnico pede a eles relatório quando o incidente for do lado deles |

## Prazos

| Obrigação | Prazo | Norma |
|---|---|---|
| Comunicar à ANPD | **3 dias úteis** a partir da ciência de que o incidente afetou dados pessoais | Res. ANPD 15/2024, art. 6º |
| Comunicar aos titulares | **3 dias úteis** (mesmo marco) | Res. ANPD 15/2024, art. 9º |
| Complementar a comunicação preliminar | até 20 dias úteis da comunicação inicial | Res. ANPD 15/2024, art. 6º, § 4º |
| Guardar o registro interno do incidente (inclusive o não comunicado) | mínimo de 5 anos | Res. ANPD 15/2024, art. 10 |

Agente de tratamento de pequeno porte (Res. ANPD 2/2022) pode ter prazo em dobro. A igreja só usa o prazo em dobro com confirmação do advogado. Sem essa confirmação, vale o prazo de 3 dias úteis.

## Quando comunicar (Res. ANPD 15/2024, art. 5º)

Comunique quando os dois requisitos ocorrem juntos:

1. **Requisito A:** o incidente pode afetar de forma significativa os interesses e direitos dos titulares (discriminação, dano moral, perda de controle sobre o dado).
2. **Requisito B:** o incidente envolve pelo menos um destes: dado sensível; dado de criança, adolescente ou idoso; dado financeiro; dado de autenticação; dado sob sigilo; dado em larga escala.

No Servio, o vínculo com um ministério revela convicção religiosa: é **dado sensível** (LGPD art. 5º II e art. 11). Os tokens de link pessoal, cookies de aparelho e hashes de senha são **dado de autenticação**. Por isso, quase todo vazamento do banco preenche o requisito B.

## Passos

### T+0 — Ciência
1. Registre a data e a hora (com fuso) em que alguém soube que o incidente afetou dado pessoal. Esse é o início do prazo.
2. Avise a controladora no mesmo dia, pelo contato da igreja.

### Até T+4 h — Contenção
1. Revogue o acesso exposto: troque `SESSION_SECRET` (encerra todas as sessões), `CRON_SECRET`, a senha do Neon (`DATABASE_URL`) e as chaves VAPID, se forem o vetor.
2. Se o vazamento atingiu links pessoais ou aparelhos, revogue os aparelhos (`aparelhos.revogado_em`) e os convites (`convites_pessoais.revogado_em`) afetados.
3. Preserve as evidências antes de apagar ou reiniciar: logs do Vercel, histórico do Neon (branch de restauração) e o commit em produção.

### Até T+24 h — Escopo e decisão
1. Liste as tabelas e as colunas afetadas (use o mapa de dados de `docs/auditoria-lgpd.md`).
2. Conte os titulares afetados. Separe crianças, adolescentes e idosos, se houver.
3. Aplique o teste do art. 5º acima. A controladora decide, com o advogado, e registra o motivo.

### Até 3 dias úteis — Comunicação
1. **À ANPD:** pelo peticionamento eletrônico da ANPD (gov.br/anpd), com os itens do art. 6º da Res. 15/2024 (modelo abaixo).
2. **Aos titulares:** mensagem individual em linguagem simples (modelo abaixo). O canal é o aviso no aparelho, o e-mail (quando houver) ou a mensagem do líder. Se não for possível avisar cada pessoa, publique o aviso no portal por no mínimo 3 meses.

### Depois — Registro e correção
1. Grave o registro interno (modelo abaixo) e guarde por 5 anos, mesmo se a decisão for não comunicar.
2. Corrija a causa e crie um teste que impede a volta do problema.

## Modelo — comunicação à ANPD

```
Controladora: <IGREJA_NOME>, CNPJ <IGREJA_CNPJ>, <IGREJA_ENDERECO>
Operador: PI System (operação técnica do portal Servio)
Contato do encarregado / canal: <IGREJA_CONTATO>

1. Natureza e categoria dos dados afetados: <ex.: nome e vínculo com ministério da igreja (dado sensível — convicção religiosa)>
2. Número de titulares afetados: <total>; crianças: <n>; adolescentes: <n>; idosos: <n>
3. Medidas de segurança antes do incidente: TLS; senha em bcrypt custo 12; tokens de link e aparelho só em hash SHA-256; banco em São Paulo; acesso por papel e igreja
   Medidas adotadas depois: <lista>
4. Riscos aos titulares: <ex.: exposição da convicção religiosa; tentativa de golpe em nome da igreja>
5. Motivo da demora (se passou de 3 dias úteis): <N/A ou motivo>
6. Medidas para reverter ou reduzir o dano: <lista>
7. Data do incidente: <data e hora>; data da ciência: <data e hora>; data desta comunicação: <data e hora>
8. Descrição do incidente e causa principal: <texto>
9. Total de titulares tratados na atividade afetada: <total de voluntários cadastrados>
```

## Modelo — comunicação ao titular

```
Assunto: Aviso sobre os seus dados no Servio

Olá, <nome>.

Em <data>, a <IGREJA_NOME> soube de um incidente de segurança no Servio, o portal das escalas de voluntários.

O que aconteceu: <descrição curta, sem termo técnico>.
Quais dados seus foram afetados: <lista>. <Dados que não foram afetados, se for útil.>
O que fizemos: <medidas>.
Qual o risco para você: <risco em linguagem simples>.
O que você pode fazer: desconfie de mensagens que pedem dados em nome da igreja; <outras ações>.
<Se houve demora: por que só avisamos agora.>

Dúvidas: <IGREJA_CONTATO>. Você também pode falar com a ANPD em gov.br/anpd.

<IGREJA_NOME>
```

## Modelo — registro interno (guardar 5 anos)

```
## INC-AAAA-NNN
- Data e hora do incidente:
- Data e hora da ciência:
- Descrição e causa principal:
- Dados e titulares afetados:
- Avaliação do art. 5º (Res. ANPD 15/2024): notificável / não notificável — motivo:
- Comunicação à ANPD: data — protocolo
- Comunicação aos titulares: data — canal
- Medidas técnicas adotadas:
- Guardar até: <data + 5 anos>
```
