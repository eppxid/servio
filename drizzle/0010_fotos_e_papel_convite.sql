CREATE TYPE "public"."papel_convite" AS ENUM('voluntario', 'lider', 'admin');--> statement-breakpoint
CREATE TABLE "fotos" (
	"usuario_id" integer PRIMARY KEY NOT NULL,
	"igreja_id" integer NOT NULL,
	"conteudo" "bytea" NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "convites_pessoais" ADD COLUMN "papel" "papel_convite" DEFAULT 'voluntario' NOT NULL;--> statement-breakpoint
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_igreja_id_igrejas_id_fk" FOREIGN KEY ("igreja_id") REFERENCES "public"."igrejas"("id") ON DELETE no action ON UPDATE no action;