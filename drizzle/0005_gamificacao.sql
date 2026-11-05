CREATE TABLE "reconhecimentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"ministerio_id" integer NOT NULL,
	"de_usuario" integer NOT NULL,
	"para_usuario" integer NOT NULL,
	"texto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "aparecer_no_ranking" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reconhecimentos" ADD CONSTRAINT "reconhecimentos_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconhecimentos" ADD CONSTRAINT "reconhecimentos_ministerio_id_ministerios_id_fk" FOREIGN KEY ("ministerio_id") REFERENCES "public"."ministerios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconhecimentos" ADD CONSTRAINT "reconhecimentos_de_usuario_usuarios_id_fk" FOREIGN KEY ("de_usuario") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconhecimentos" ADD CONSTRAINT "reconhecimentos_para_usuario_usuarios_id_fk" FOREIGN KEY ("para_usuario") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconhecimentos_para" ON "reconhecimentos" USING btree ("para_usuario","criado_em");