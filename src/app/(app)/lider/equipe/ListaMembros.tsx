"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import { alterarPapel, definirAdminAcao, gerarLinkDoMembroAcao, revogarAparelhoAcao, salvarFuncoesDoMembro, senhaTemporariaAcao, tirarDoMinisterio } from "./actions";
import estilo from "./equipe.module.css";
import { FormConfirmar } from "./FormConfirmar";
import { SeloPapel } from "./SeloPapel";

export interface MembroLinha {
  id: number;
  usuarioId: number;
  fotoVersao?: number;
  nome: string;
  papel: "lider" | "voluntario";
  papelGlobal: "admin" | "lider" | "voluntario";
  funcaoIds: number[];
  escalasNoMes: number;
  /** Só quem tem e-mail (conta antiga) pode ter senha temporária. */
  temEmail: boolean;
  aparelhos: { id: number; rotulo: string; ultimoUso: string }[];
}

const dataCurta = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Membros aprovados; tocar numa linha abre a folha com funções, senha temporária e saída do ministério. */
export function ListaMembros({
  ministerioId,
  membros,
  funcoes,
  admin,
  senhaMinima,
}: {
  ministerioId: number;
  membros: MembroLinha[];
  funcoes: { id: number; nome: string }[];
  admin: boolean;
  senhaMinima: number;
}) {
  // Guarda só o id: a folha lê o membro das props, que se renovam depois de revogar um aparelho.
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const aberto = membros.find((m) => m.id === abertoId) ?? null;
  const abertoAdmin = aberto?.papelGlobal === "admin";
  const nomeDe = (id: number) => funcoes.find((f) => f.id === id)?.nome;

  return (
    <>
      <div className="list">
        {membros.map((m) => (
          <button key={m.id} type="button" className={`row ${estilo.linha}`} onClick={() => setAbertoId(m.id)}>
            <Avatar nome={m.nome} usuarioId={m.usuarioId} fotoVersao={m.fotoVersao} />
            <span className="row__tx">
              <b>
                {m.nome}
                <SeloPapel papel={m.papelGlobal === "admin" ? "admin" : m.papel} />
              </b>
              <span>{m.funcaoIds.map(nomeDe).filter(Boolean).join(", ") || "Sem funções"}</span>
            </span>
            <span className={`${estilo.fim} num`}>{m.escalasNoMes} no mês</span>
          </button>
        ))}
        {membros.length === 0 && (
          <p className="row" style={{ color: "var(--muted)" }}>
            Ninguém na equipe ainda.
          </p>
        )}
      </div>

      <FolhaInferior
        aberta={aberto !== null}
        aoFechar={() => setAbertoId(null)}
        titulo={aberto?.nome ?? ""}
        descricao={aberto ? `${aberto.escalasNoMes} no mês` : undefined}
      >
        {aberto && (
          <div className={estilo.folha}>
            <form action={salvarFuncoesDoMembro} onSubmit={() => setAbertoId(null)}>
              <input type="hidden" name="membro" value={aberto.id} />
              <b>Funções aprovadas</b>
              {funcoes.map((f) => (
                <label key={f.id} className={estilo.marca}>
                  <input type="checkbox" name="funcoes" value={f.id} defaultChecked={aberto.funcaoIds.includes(f.id)} className="caixa" />
                  {f.nome}
                </label>
              ))}
              {funcoes.length === 0 && <p style={{ color: "var(--muted)" }}>O ministério ainda não tem funções.</p>}
              <button type="submit" className="tbtn tbtn--p" style={{ justifySelf: "start" }}>
                Salvar funções
              </button>
            </form>

            <div className={estilo.bloco}>
              <details>
                <summary>
                  <b>Aparelhos ({aberto.aparelhos.length})</b>
                </summary>
                {aberto.aparelhos.map((ap) => (
                  <form key={ap.id} action={revogarAparelhoAcao} className={estilo.inline}>
                    <input type="hidden" name="aparelho" value={ap.id} />
                    <span style={{ flex: 1 }}>
                      {ap.rotulo}
                      <span className={estilo.fim}> · último uso {dataCurta(ap.ultimoUso)}</span>
                    </span>
                    <button type="submit" className={`tbtn ${estilo.perigo}`} aria-label={`Revogar ${ap.rotulo} de ${aberto.nome}`}>
                      Revogar
                    </button>
                  </form>
                ))}
                {aberto.aparelhos.length === 0 && <span className={estilo.fim}>Nenhum aparelho.</span>}
              </details>
            </div>

            {(admin || !abertoAdmin) && (
              <form action={gerarLinkDoMembroAcao}>
                <input type="hidden" name="ministerio" value={ministerioId} />
                <input type="hidden" name="usuario" value={aberto.usuarioId} />
                <button type="submit" className="tbtn tbtn--soft" style={{ justifySelf: "start" }}>
                  Gerar link de acesso
                </button>
              </form>
            )}

            {aberto.temEmail && (admin || !abertoAdmin) && (
            <form action={senhaTemporariaAcao}>
              <input type="hidden" name="ministerio" value={ministerioId} />
              <input type="hidden" name="membro" value={aberto.id} />
              <b>Gerar senha temporária</b>
              <div className={estilo.inline}>
                <input
                  name="senha"
                  type="text"
                  required
                  minLength={senhaMinima}
                  autoComplete="off"
                  className="campo"
                  aria-label="Senha temporária"
                  placeholder="Senha temporária"
                />
                <button type="submit" className="tbtn tbtn--soft">
                  Definir
                </button>
              </div>
              <span className={estilo.fim}>A pessoa troca a senha no próximo acesso.</span>
            </form>
            )}

            {admin && (
              <form action={alterarPapel} onSubmit={() => setAbertoId(null)}>
                <input type="hidden" name="ministerio" value={ministerioId} />
                <input type="hidden" name="usuario" value={aberto.usuarioId} />
                <input type="hidden" name="lider" value={aberto.papel === "lider" ? "0" : "1"} />
                <button type="submit" className="tbtn tbtn--soft">
                  {aberto.papel === "lider" ? "Tirar de líder" : "Tornar líder"}
                </button>
              </form>
            )}

            {admin && (
              <FormConfirmar
                action={definirAdminAcao}
                pergunta={abertoAdmin ? `Tirar ${aberto.nome} de administrador?` : `Tornar ${aberto.nome} administrador? A pessoa poderá gerir toda a igreja.`}
                aoEnviar={() => setAbertoId(null)}
              >
                <input type="hidden" name="ministerio" value={ministerioId} />
                <input type="hidden" name="usuario" value={aberto.usuarioId} />
                <input type="hidden" name="admin" value={abertoAdmin ? "0" : "1"} />
                <button type="submit" className="tbtn tbtn--soft">
                  {abertoAdmin ? "Tirar de administrador" : "Tornar administrador"}
                </button>
              </FormConfirmar>
            )}

            {aberto.papel !== "lider" && (
              <form action={tirarDoMinisterio} onSubmit={() => setAbertoId(null)}>
                <input type="hidden" name="membro" value={aberto.id} />
                <button type="submit" className={`tbtn ${estilo.perigo}`}>
                  Tirar do ministério
                </button>
              </form>
            )}
          </div>
        )}
      </FolhaInferior>
    </>
  );
}
