ALTER TABLE "ministerios" ADD COLUMN "arquivado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "trocar_senha" boolean DEFAULT false NOT NULL;