"use client";

import { useState } from "react";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import { alterarPapel, salvarFuncoesDoMembro, senhaTemporariaAcao, tirarDoMinisterio } from "./actions";
import { iniciais } from "./Avatar";
import estilo from "./equipe.module.css";

export interface MembroLinha {
  id: number;
  usuarioId: number;
  nome: string;
  papel: "lider" | "voluntario";
  funcaoIds: number[];
  escalasNoMes: number;
}

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
  const [aberto, setAberto] = useState<MembroLinha | null>(null);
  const nomeDe = (id: number) => funcoes.find((f) => f.id === id)?.nome;

  return (
    <>
      <div className="list">
        {membros.map((m) => (
          <button key={m.id} type="button" className={`row ${estilo.linha}`} onClick={() => setAberto(m)}>
            <span className="avatar">{iniciais(m.nome)}</span>
            <span className="row__tx">
              <b>
                {m.nome}
                {m.papel === "lider" ? " · líder" : ""}
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
        aoFechar={() => setAberto(null)}
        titulo={aberto?.nome ?? ""}
        descricao={aberto ? `${aberto.escalasNoMes} no mês` : undefined}
      >
        {aberto && (
          <div className={estilo.folha}>
            <form action={salvarFuncoesDoMembro} onSubmit={() => setAberto(null)}>
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

            {admin && (
              <form action={alterarPapel} onSubmit={() => setAberto(null)}>
                <input type="hidden" name="ministerio" value={ministerioId} />
                <input type="hidden" name="usuario" value={aberto.usuarioId} />
                <input type="hidden" name="lider" value={aberto.papel === "lider" ? "0" : "1"} />
                <button type="submit" className="tbtn tbtn--soft">
                  {aberto.papel === "lider" ? "Tirar de líder" : "Tornar líder"}
                </button>
              </form>
            )}

            {aberto.papel !== "lider" && (
              <form action={tirarDoMinisterio} onSubmit={() => setAberto(null)}>
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
