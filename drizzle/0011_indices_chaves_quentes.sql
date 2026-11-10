CREATE INDEX "convites_pessoais_usuario" ON "convites_pessoais" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "convites_pessoais_ministerio" ON "convites_pessoais" USING btree ("ministerio_id");--> statement-breakpoint
CREATE INDEX "escala_itens_escala" ON "escala_itens" USING btree ("escala_id");--> statement-breakpoint
CREATE INDEX "escala_itens_usuario" ON "escala_itens" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "indisponibilidades_usuario" ON "indisponibilidades" USING btree ("usuario_id","data_fim");--> statement-breakpoint
CREATE INDEX "membro_funcoes_funcao" ON "membro_funcoes" USING btree ("funcao_id");--> statement-breakpoint
CREATE INDEX "push_inscricoes_usuario" ON "push_inscricoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "trocas_item" ON "trocas" USING btree ("escala_item_id");--> statement-breakpoint
CREATE INDEX "trocas_solicitante" ON "trocas" USING btree ("solicitante_id");--> statement-breakpoint
CREATE INDEX "trocas_substituto" ON "trocas" USING btree ("substituto_id");