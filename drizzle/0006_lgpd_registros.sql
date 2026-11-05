CREATE TABLE "lgpd_registros" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"feito_por" integer NOT NULL,
	"acao" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lgpd_registros" ADD CONSTRAINT "lgpd_registros_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lgpd_registros" ADD CONSTRAINT "lgpd_registros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lgpd_registros" ADD CONSTRAINT "lgpd_registros_feito_por_usuarios_id_fk" FOREIGN KEY ("feito_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lgpd_registros_usuario" ON "lgpd_registros" USING btree ("usuario_id");