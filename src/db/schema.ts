import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const papelGlobal = pgEnum("papel_global", ["admin", "lider", "voluntario"]);
export const papelMembro = pgEnum("papel_membro", ["lider", "voluntario"]);
export const statusMembro = pgEnum("status_membro", ["pendente", "aprovado"]);
export const statusEscala = pgEnum("status_escala", ["rascunho", "publicada"]);
export const statusItem = pgEnum("status_item", ["pendente", "confirmado", "recusado"]);
export const statusTroca = pgEnum("status_troca", ["aberta", "aceita", "aprovada", "recusada"]);

const ts = (nome: string) => timestamp(nome, { withTimezone: true });

export const igrejas = pgTable("igrejas", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  criadoEm: ts("criado_em").notNull().defaultNow(),
});

export const usuarios = pgTable(
  "usuarios",
  {
    id: serial("id").primaryKey(),
    igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    telefone: text("telefone"),
    fotoUrl: text("foto_url"),
    senhaHash: text("senha_hash").notNull(),
    papelGlobal: papelGlobal("papel_global").notNull().default("voluntario"),
    sessaoVersao: integer("sessao_versao").notNull().default(1),
    consentimentoEm: ts("consentimento_em"),
    termosVersao: text("termos_versao"),
    anonimizadoEm: ts("anonimizado_em"),
    trocarSenha: boolean("trocar_senha").notNull().default(false),
    aparecerNoRanking: boolean("aparecer_no_ranking").notNull().default(true),
    agendaToken: text("agenda_token").unique(),
    agendaTokenExpiraEm: ts("agenda_token_expira_em"),
    criadoEm: ts("criado_em").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usuarios_email_unico").on(t.igrejaId, t.email)],
);

export const ministerios = pgTable("ministerios", {
  id: serial("id").primaryKey(),
  igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  arquivadoEm: ts("arquivado_em"),
  trocaAutomatica: boolean("troca_automatica").notNull().default(false),
  criadoEm: ts("criado_em").notNull().defaultNow(),
});

export const membrosMinisterio = pgTable(
  "membros_ministerio",
  {
    id: serial("id").primaryKey(),
    igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
    usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
    ministerioId: integer("ministerio_id").notNull().references(() => ministerios.id),
    papel: papelMembro("papel").notNull().default("voluntario"),
    status: statusMembro("status").notNull().default("pendente"),
    criadoEm: ts("criado_em").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("membros_unico").on(t.usuarioId, t.ministerioId)],
);

export const funcoes = pgTable("funcoes", {
  id: serial("id").primaryKey(),
  igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
  ministerioId: integer("ministerio_id").notNull().references(() => ministerios.id),
  nome: text("nome").notNull(),
});

export const membroFuncoes = pgTable(
  "membro_funcoes",
  {
    igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
    membroId: integer("membro_id").notNull().references(() => membrosMinisterio.id),
    funcaoId: integer("funcao_id").notNull().references(() => funcoes.id),
  },
  (t) => [primaryKey({ columns: [t.membroId, t.funcaoId] })],
);

export const recorrencias = pgTable("recorrencias", {
  id: serial("id").primaryKey(),
  igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
  diaSemana: integer("dia_semana").notNull(),
  horaInicio: text("hora_inicio").notNull(),
  horaFim: text("hora_fim"),
  ate: date("ate"),
});

export const eventos = pgTable(
  "eventos",
  {
    id: serial("id").primaryKey(),
    igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
    titulo: text("titulo").notNull(),
    inicio: ts("inicio").notNull(),
    fim: ts("fim"),
    recorrenciaId: integer("recorrencia_id").references(() => recorrencias.id),
  },
  (t) => [index("eventos_inicio").on(t.igrejaId, t.inicio)],
);

export const indisponibilidades = pgTable("indisponibilidades", {
  id: serial("id").primaryKey(),
  igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
  dataInicio: date("data_inicio").notNull(),
  dataFim: date("data_fim").notNull(),
  motivo: text("motivo"),
});

export const escalas = pgTable(
  "escalas",
  {
    id: serial("id").primaryKey(),
    igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
    eventoId: integer("evento_id").notNull().references(() => eventos.id),
    ministerioId: integer("ministerio_id").notNull().references(() => ministerios.id),
    status: statusEscala("status").notNull().default("rascunho"),
  },
  (t) => [uniqueIndex("escalas_evento_ministerio").on(t.eventoId, t.ministerioId)],
);

export const escalaItens = pgTable("escala_itens", {
  id: serial("id").primaryKey(),
  igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
  escalaId: integer("escala_id").notNull().references(() => escalas.id),
  funcaoId: integer("funcao_id").notNull().references(() => funcoes.id),
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  status: statusItem("status").notNull().default("pendente"),
  checkinEm: ts("checkin_em"),
});

export const trocas = pgTable("trocas", {
  id: serial("id").primaryKey(),
  igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
  escalaItemId: integer("escala_item_id").notNull().references(() => escalaItens.id),
  solicitanteId: integer("solicitante_id").notNull().references(() => usuarios.id),
  substitutoId: integer("substituto_id").references(() => usuarios.id),
  status: statusTroca("status").notNull().default("aberta"),
  criadoEm: ts("criado_em").notNull().defaultNow(),
});

export const mensagens = pgTable(
  "mensagens",
  {
    id: serial("id").primaryKey(),
    igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
    eventoId: integer("evento_id").notNull().references(() => eventos.id),
    usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
    texto: text("texto").notNull(),
    aviso: boolean("aviso").notNull().default(false),
    criadoEm: ts("criado_em").notNull().defaultNow(),
  },
  (t) => [index("mensagens_evento").on(t.eventoId, t.criadoEm)],
);

export const pushInscricoes = pgTable("push_inscricoes", {
  id: serial("id").primaryKey(),
  igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
  endpoint: text("endpoint").notNull().unique(),
  chaveP256dh: text("chave_p256dh").notNull(),
  chaveAuth: text("chave_auth").notNull(),
  criadoEm: ts("criado_em").notNull().defaultNow(),
});

export const convites = pgTable("convites", {
  id: serial("id").primaryKey(),
  igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
  ministerioId: integer("ministerio_id").notNull().references(() => ministerios.id),
  token: text("token").notNull().unique(),
  expiraEm: ts("expira_em").notNull(),
});

export const tentativasLogin = pgTable(
  "tentativas_login",
  {
    id: serial("id").primaryKey(),
    emailHash: text("email_hash").notNull(),
    criadoEm: ts("criado_em").notNull().defaultNow(),
  },
  (t) => [index("tentativas_login_email").on(t.emailHash, t.criadoEm)],
);
