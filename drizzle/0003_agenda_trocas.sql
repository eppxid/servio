ALTER TABLE "ministerios" ADD COLUMN "troca_automatica" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "agenda_token" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "agenda_token_expira_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_agenda_token_unique" UNIQUE("agenda_token");