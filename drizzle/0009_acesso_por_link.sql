CREATE TYPE "public"."status_pedido_acesso" AS ENUM('pendente', 'aprovado', 'recusado', 'atendido');--> statement-breakpoint
CREATE TYPE "public"."tipo_pedido_acesso" AS ENUM('mesma_pessoa', 'outra_pessoa');--> statement-breakpoint
CREATE TABLE "aparelhos" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"rotulo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	CONSTRAINT "aparelhos_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "convites_pessoais" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"ministerio_id" integer NOT NULL,
	"nome" text NOT NULL,
	"sobrenome" text NOT NULL,
	"token_hash" text NOT NULL,
	"criado_por" integer NOT NULL,
	"usuario_id" integer,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convites_pessoais_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "pedidos_acesso" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"convite_id" integer NOT NULL,
	"tipo" "tipo_pedido_acesso" NOT NULL,
	"nome" text,
	"sobrenome" text,
	"aparelho_token_hash" text,
	"rotulo" text NOT NULL,
	"status" "status_pedido_acesso" DEFAULT 'pendente' NOT NULL,
	"decidido_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"decidido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "senha_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "aparelhos" ADD CONSTRAINT "aparelhos_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aparelhos" ADD CONSTRAINT "aparelhos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_pessoais" ADD CONSTRAINT "convites_pessoais_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_pessoais" ADD CONSTRAINT "convites_pessoais_ministerio_id_ministerios_id_fk" FOREIGN KEY ("ministerio_id") REFERENCES "public"."ministerios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_pessoais" ADD CONSTRAINT "convites_pessoais_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_pessoais" ADD CONSTRAINT "convites_pessoais_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_acesso" ADD CONSTRAINT "pedidos_acesso_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_acesso" ADD CONSTRAINT "pedidos_acesso_convite_id_convites_pessoais_id_fk" FOREIGN KEY ("convite_id") REFERENCES "public"."convites_pessoais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_acesso" ADD CONSTRAINT "pedidos_acesso_decidido_por_usuarios_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aparelhos_usuario" ON "aparelhos" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "pedidos_acesso_convite" ON "pedidos_acesso" USING btree ("convite_id","status");