# Movimento entre telas, foto da pessoa e convite com papel (09/11/2026)

Pedido do usuário (09/11):
1. As trocas de tela estão estáticas. Usar os padrões de movimento do mercado.
2. A pessoa deve poder anexar uma foto (não só um link). Ideia: importar do Instagram.
3. Convite e administrador: distinguir se a pessoa convidada é admin ou não.

## 1. Movimento entre telas

Hoje: `public/ui/motion.js` anima só a entrada em cascata (`[data-enter]`) e a troca de tema
(View Transition). A troca de aba e de tela não tem movimento.

Padrões a aplicar (todos com View Transitions nativas do navegador + fallback sem animação):

| Padrão | Onde | Como |
|---|---|---|
| Deslize lateral com direção | Troca entre abas da barra inferior / trilho | Aba à direita da atual: a tela nova entra pela direita; à esquerda: pela esquerda. 280–320 ms, curva `EASE` do `motion.js`. |
| Empurrar e voltar (push/pop) | Abrir detalhe (ex.: culto, membro) e voltar | Ir para dentro: entra pela direita; voltar (botão voltar ou `history.back`): sai pela direita. |
| Fade-through | Telas sem relação (troca de modo líder/voluntário, Perfil) | Sai com fade + leve escala 0,98; entra com fade. |
| Indicador que desliza | Pílula da aba ativa (barra inferior, abas em pílula) | `view-transition-name` próprio no indicador: a pílula desliza até a aba nova em vez de pular. |
| Carregamento imediato | Toda rota do grupo `(app)` | `loading.tsx` com esqueleto (cartões cinza) para a troca não "congelar" esperando o servidor. |

Regras: `prefers-reduced-motion: reduce` desliga tudo (só troca seca). Nada passa de 350 ms.
Mesma linguagem do template `layout-fluido` (skill de mesmo nome).
Técnica recomendada: interceptar a navegação das abas e dos links internos e chamar
`document.startViewTransition` em volta do `router.push`, marcando a direção num atributo do
`<html>` (`data-nav="frente|tras|aba-dir|aba-esq|troca"`) que o CSS lê nos pseudo-elementos
`::view-transition-old/new(root)`. Não depender de recurso experimental do React/Next.

## 2. Foto da pessoa

### Decisões

| Ponto | Decisão | Motivo |
|---|---|---|
| Origem | A própria pessoa escolhe a foto no Perfil (galeria ou câmera do celular, via `<input type="file" accept="image/*">`). A tela "Onde quero servir", que abre depois do primeiro acesso, ganha só um atalho "Adicionar foto" para o Perfil. | A folha nativa do celular já oferece galeria e câmera. |
| Instagram | **Não importar.** | A Meta encerrou a Instagram Basic Display API em 04/12/2024; não há API oficial para ler a foto de perfil. Raspar a página viola os termos da Meta e quebra sem aviso. A pessoa usa uma foto da galeria. |
| Quem envia | Só o titular envia a própria foto. O líder **não** envia foto de outra pessoa. | Direito de imagem (CF art. 5º X; Código Civil art. 20) e LGPD: a foto entra com o consentimento da própria pessoa. |
| Tratamento | No navegador: recorte quadrado central, redimensiona para 512×512 e regrava em WebP (qualidade ~0,82) com `canvas`. Isso apaga o EXIF (inclusive GPS). No servidor: aceita só WebP (confere os bytes `RIFF....WEBP`) com até 150 KB. | Sem dependência nova; sem localização escondida na foto. |
| Armazenamento | Tabela `fotos` no Neon (`usuario_id` PK, `igreja_id`, `conteudo` bytea, `atualizado_em`). | Sem serviço novo nem custo; 300 pessoas × 60 KB ≈ 18 MB. Vercel Blob gera URL pública (qualquer um com o link vê) — pior para a privacidade. |
| Entrega | Rota `GET /api/foto/<usuarioId>?v=<atualizado_em>`: exige sessão da mesma igreja; `Cache-Control: private, max-age=31536000, immutable` (o `v` muda quando a foto muda). | Mesma origem: a CSP atual (`img-src 'self'`) já permite. Ninguém de fora vê a foto. |
| Exibição | Componente `Avatar` único: foto quando existe, iniciais quando não. Usado no topo, Início, Equipe, culto. | Um lugar só para manter. |

### LGPD da foto
- A política de privacidade lista a foto (opcional, finalidade: identificar a pessoa na escala, quem vê: membros logados da mesma igreja).
- A pessoa remove a foto quando quiser (botão "Remover foto").
- Exclusão de conta apaga a foto; exportação de dados inclui a foto (base64).
- A coluna antiga `usuarios.foto_url` continua nula (tarefa 040).

## 3. Convite com papel e o administrador

### Como funciona hoje (09/11)
- O link pessoal sempre cria **voluntário aprovado** no ministério do convite.
- Para virar **líder**, o admin abre o membro na Equipe e toca em "Tornar líder".
- **Admin** só existe um: quem fez o primeiro acesso. Não há tela para criar outro admin.
  Efeito colateral: o único admin nunca consegue excluir a própria conta (a regra
  "a igreja não fica sem admin" bloqueia).
- Pedidos de acesso (aparelho novo, "Não sou") avisam só os **líderes do ministério**. O admin
  não recebe o aviso. Ministério sem líder → ninguém é avisado.

### Decisões

| Ponto | Decisão |
|---|---|
| Papel no convite | Campo "Papel" no "Convidar pessoa": **Voluntário** (padrão), **Líder do ministério**, **Administrador**. Líder só vê "Voluntário". Admin vê os três. O servidor confere (líder que mandar papel diferente recebe ErroAcesso). |
| Coluna | `convites_pessoais.papel` (enum `voluntario` \| `lider` \| `admin`, padrão `voluntario`) — migração 0010, junto com a tabela `fotos`. |
| 1º uso como líder | Membro do ministério com `papel = lider`, aprovado. |
| 1º uso como admin | `papelGlobal = admin` + membro líder do ministério do convite. Antes de entrar, a tela pede **e-mail e senha** (obrigatório para admin). |
| Por que admin precisa de senha | O admin aprova os aparelhos dos outros. Se ele perder o aparelho e for o único admin, ninguém aprova o dele: a senha é a porta de recuperação (`/entrar`). |
| Promover membro existente | Na ficha do membro (Equipe), o admin vê "Tornar administrador" / "Tirar de administrador". Promovido sem senha → no próximo acesso o app leva para a tela "Defina e-mail e senha de administrador" (mesmo mecanismo do `trocarSenha` / `exigirUsuarioSemTroca`). Não dá para tirar o último admin. |
| Marca visual | Selo "Admin" / "Líder" no membro, no convite gerado e no pedido. |
| Pedidos de acesso | Avisam líderes do ministério **e** todos os admins. O admin vê e decide pedidos de qualquer ministério. |
| Aparelho novo de um admin | Só **outro admin** aprova (líder de ministério não). Sem outro admin, o admin entra por e-mail e senha em `/entrar`. |
