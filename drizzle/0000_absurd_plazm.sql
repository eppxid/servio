CREATE TYPE "public"."papel_global" AS ENUM('admin', 'lider', 'voluntario');--> statement-breakpoint
CREATE TYPE "public"."papel_membro" AS ENUM('lider', 'voluntario');--> statement-breakpoint
CREATE TYPE "public"."status_escala" AS ENUM('rascunho', 'publicada');--> statement-breakpoint
CREATE TYPE "public"."status_item" AS ENUM('pendente', 'confirmado', 'recusado');--> statement-breakpoint
CREATE TYPE "public"."status_membro" AS ENUM('pendente', 'aprovado');--> statement-breakpoint
CREATE TYPE "public"."status_troca" AS ENUM('aberta', 'aceita', 'aprovada', 'recusada');--> statement-breakpoint
CREATE TABLE "convites" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"ministerio_id" integer NOT NULL,
	"token" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	CONSTRAINT "convites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "escala_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"escala_id" integer NOT NULL,
	"funcao_id" integer NOT NULL,
	"usuario_id" integer,
	"status" "status_item" DEFAULT 'pendente' NOT NULL,
	"checkin_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "escalas" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"evento_id" integer NOT NULL,
	"ministerio_id" integer NOT NULL,
	"status" "status_escala" DEFAULT 'rascunho' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"titulo" text NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone,
	"recorrencia_id" integer
);
--> statement-breakpoint
CREATE TABLE "funcoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"ministerio_id" integer NOT NULL,
	"nome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "igrejas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indisponibilidades" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"motivo" text
);
--> statement-breakpoint
CREATE TABLE "membro_funcoes" (
	"igreja_id" integer NOT NULL,
	"membro_id" integer NOT NULL,
	"funcao_id" integer NOT NULL,
	CONSTRAINT "membro_funcoes_membro_id_funcao_id_pk" PRIMARY KEY("membro_id","funcao_id")
);
--> statement-breakpoint
CREATE TABLE "membros_ministerio" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"ministerio_id" integer NOT NULL,
	"papel" "papel_membro" DEFAULT 'voluntario' NOT NULL,
	"status" "status_membro" DEFAULT 'pendente' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"evento_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"texto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ministerios" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_inscricoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"chave_p256dh" text NOT NULL,
	"chave_auth" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_inscricoes_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "recorrencias" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"dia_semana" integer NOT NULL,
	"hora_inicio" text NOT NULL,
	"hora_fim" text,
	"ate" date
);
--> statement-breakpoint
CREATE TABLE "tentativas_login" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trocas" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"escala_item_id" integer NOT NULL,
	"solicitante_id" integer NOT NULL,
	"substituto_id" integer,
	"status" "status_troca" DEFAULT 'aberta' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"telefone" text,
	"foto_url" text,
	"senha_hash" text NOT NULL,
	"papel_global" "papel_global" DEFAULT 'voluntario' NOT NULL,
	"sessao_versao" integer DEFAULT 1 NOT NULL,
	"consentimento_em" timestamp with time zone,
	"termos_versao" text,
	"anonimizado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_ministerio_id_ministerios_id_fk" FOREIGN KEY ("ministerio_id") REFERENCES "public"."ministerios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escala_itens" ADD CONSTRAINT "escala_itens_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escala_itens" ADD CONSTRAINT "escala_itens_escala_id_escalas_id_fk" FOREIGN KEY ("escala_id") REFERENCES "public"."escalas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escala_itens" ADD CONSTRAINT "escala_itens_funcao_id_funcoes_id_fk" FOREIGN KEY ("funcao_id") REFERENCES "public"."funcoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escala_itens" ADD CONSTRAINT "escala_itens_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_ministerio_id_ministerios_id_fk" FOREIGN KEY ("ministerio_id") REFERENCES "public"."ministerios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_recorrencia_id_recorrencias_id_fk" FOREIGN KEY ("recorrencia_id") REFERENCES "public"."recorrencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcoes" ADD CONSTRAINT "funcoes_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcoes" ADD CONSTRAINT "funcoes_ministerio_id_ministerios_id_fk" FOREIGN KEY ("ministerio_id") REFERENCES "public"."ministerios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indisponibilidades" ADD CONSTRAINT "indisponibilidades_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indisponibilidades" ADD CONSTRAINT "indisponibilidades_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membro_funcoes" ADD CONSTRAINT "membro_funcoes_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membro_funcoes" ADD CONSTRAINT "membro_funcoes_membro_id_membros_ministerio_id_fk" FOREIGN KEY ("membro_id") REFERENCES "public"."membros_ministerio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membro_funcoes" ADD CONSTRAINT "membro_funcoes_funcao_id_funcoes_id_fk" FOREIGN KEY ("funcao_id") REFERENCES "public"."funcoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros_ministerio" ADD CONSTRAINT "membros_ministerio_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros_ministerio" ADD CONSTRAINT "membros_ministerio_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros_ministerio" ADD CONSTRAINT "membros_ministerio_ministerio_id_ministerios_id_fk" FOREIGN KEY ("ministerio_id") REFERENCES "public"."ministerios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministerios" ADD CONSTRAINT "ministerios_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trocas" ADD CONSTRAINT "trocas_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trocas" ADD CONSTRAINT "trocas_escala_item_id_escala_itens_id_fk" FOREIGN KEY ("escala_item_id") REFERENCES "public"."escala_itens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trocas" ADD CONSTRAINT "trocas_solicitante_id_usuarios_id_fk" FOREIGN KEY ("solicitante_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trocas" ADD CONSTRAINT "trocas_substituto_id_usuarios_id_fk" FOREIGN KEY ("substituto_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "escalas_evento_ministerio" ON "escalas" USING btree ("evento_id","ministerio_id");--> statement-breakpoint
CREATE INDEX "eventos_inicio" ON "eventos" USING btree ("igreja_id","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "membros_unico" ON "membros_ministerio" USING btree ("usuario_id","ministerio_id");--> statement-breakpoint
CREATE INDEX "mensagens_evento" ON "mensagens" USING btree ("evento_id","criado_em");--> statement-breakpoint
CREATE INDEX "tentativas_login_email" ON "tentativas_login" USING btree ("email_hash","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_unico" ON "usuarios" USING btree ("igreja_id","email");