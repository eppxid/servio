CREATE TABLE "repertorio_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"escala_id" integer NOT NULL,
	"ordem" integer NOT NULL,
	"titulo" text NOT NULL,
	"artista" text,
	"tom" text,
	"link_spotify" text,
	"link_deezer" text,
	"link_cifra" text,
	"observacao" text,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repertorio_itens" ADD CONSTRAINT "repertorio_itens_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertorio_itens" ADD CONSTRAINT "repertorio_itens_escala_id_escalas_id_fk" FOREIGN KEY ("escala_id") REFERENCES "public"."escalas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertorio_itens" ADD CONSTRAINT "repertorio_itens_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repertorio_escala" ON "repertorio_itens" USING btree ("escala_id","ordem");