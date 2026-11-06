CREATE TYPE "public"."status_funcao" AS ENUM('desejada', 'aprovada');--> statement-breakpoint
CREATE TABLE "vagas_modelo" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"recorrencia_id" integer NOT NULL,
	"ministerio_id" integer NOT NULL,
	"funcao_id" integer NOT NULL,
	"quantidade" integer NOT NULL,
	CONSTRAINT "vagas_modelo_quantidade_positiva" CHECK ("vagas_modelo"."quantidade" > 0)
);
--> statement-breakpoint
ALTER TABLE "membro_funcoes" ADD COLUMN "status" "status_funcao" DEFAULT 'aprovada' NOT NULL;--> statement-breakpoint
ALTER TABLE "ministerios" ADD COLUMN "limite_mensal" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD COLUMN "nome" text DEFAULT 'Culto' NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas_modelo" ADD CONSTRAINT "vagas_modelo_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vagas_modelo" ADD CONSTRAINT "vagas_modelo_recorrencia_id_recorrencias_id_fk" FOREIGN KEY ("recorrencia_id") REFERENCES "public"."recorrencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vagas_modelo" ADD CONSTRAINT "vagas_modelo_ministerio_id_ministerios_id_fk" FOREIGN KEY ("ministerio_id") REFERENCES "public"."ministerios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vagas_modelo" ADD CONSTRAINT "vagas_modelo_funcao_id_funcoes_id_fk" FOREIGN KEY ("funcao_id") REFERENCES "public"."funcoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vagas_modelo_unico" ON "vagas_modelo" USING btree ("recorrencia_id","ministerio_id","funcao_id");