"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import type { Resultado } from "../acoes";
import type { FuncaoCulto, MinisterioCulto, VagaCulto } from "../vagas-culto";

const ROTULO_STATUS = { pendente: "Aguardando confirmação", confirmado: "Confirmado", recusado: "Recusou" } as const;

/** Vagas de um ministério no culto: escolher, trocar e remover pessoas, e publicar. */
/**
 * As ações chegam por prop (vindas da página, no servidor): importar o arquivo `"use server"` aqui
 * criaria uma segunda cópia do módulo do banco e, com ela, um segundo pool de conexões.
 */
export function VagasMinisterio({
  eventoId,
  quando,
  ministerio,
  escolher,
  publicarCulto,
}: {
  eventoId: number;
  quando: string;
  ministerio: MinisterioCulto;
  escolher: (eventoId: number, itemId: number, usuarioId: number | null) => Promise<Resultado>;
  publicarCulto: (eventoId: number, ministerioId: number) => Promise<Resultado>;
}) {
  const [alvo, setAlvo] = useState<{ funcao: FuncaoCulto; vaga: VagaCulto } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const vagas = ministerio.funcoes.flatMap((f) => f.vagas);
  const total = vagas.length;
  const preenchidas = vagas.filter((v) => v.usuarioId !== null && v.status !== "recusado").length;
  const publicada = ministerio.status === "publicada";

  const gravar = (itemId: number, usuarioId: number | null) =>
    iniciar(async () => {
      const r = await escolher(eventoId, itemId, usuarioId);
      setErro(r.erro ?? null);
      if (!r.erro) setAlvo(null);
    });

  const publicar = () =>
    iniciar(async () => {
      const r = await publicarCulto(eventoId, ministerio.id);
      setErro(r.erro ?? null);
    });

  // Livres para a vaga aberta: função aprovada, sem folga, fora de outro culto no horário e sem outra vaga neste.
  const livres = (() => {
    if (!alvo) return { lista: [], bloqueados: 0 };
    const usados = new Set(
      vagas.filter((v) => v.itemId !== alvo.vaga.itemId && v.usuarioId !== null).map((v) => v.usuarioId),
    );
    const candidatos = alvo.funcao.candidatos.filter(
      (c) => !usados.has(c.usuarioId) && c.usuarioId !== alvo.vaga.usuarioId,
    );
    return { lista: candidatos.filter((c) => !c.bloqueio), bloqueados: candidatos.filter((c) => c.bloqueio).length };
  })();

  return (
    <section aria-label={ministerio.nome} style={{ display: "grid", gap: 10 }}>
      <div>
        <h2 className="title" style={{ fontSize: "var(--fs-2xl)" }}>
          {ministerio.nome}
        </h2>
        <p className="eyebrow">
          {preenchidas}/{total} vagas · {publicada ? "Publicada" : "Rascunho"}
        </p>
      </div>
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {ministerio.funcoes.map((f) => (
        <div key={f.id} className="list" role="group" aria-label={f.nome}>
          {f.vagas.map((v, i) => (
            <div key={v.itemId} className="row">
              <span className="row__tx">
                <b>{v.nome ?? "Vaga aberta"}</b>
                <span>
                  {f.nome}
                  {f.vagas.length > 1 ? ` ${i + 1}` : ""}
                  {v.usuarioId !== null ? ` · ${ROTULO_STATUS[v.status]}` : ""}
                </span>
              </span>
              <span className="row__end">
                {v.usuarioId === null ? (
                  <button
                    type="button"
                    className="tbtn tbtn--soft"
                    disabled={pendente}
                    onClick={() => setAlvo({ funcao: f, vaga: v })}
                  >
                    Escolher
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="tbtn"
                      disabled={pendente}
                      onClick={() => setAlvo({ funcao: f, vaga: v })}
                    >
                      Trocar
                    </button>
                    <button type="button" className="tbtn" disabled={pendente} onClick={() => gravar(v.itemId, null)}>
                      Remover
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}
      <button
        type="button"
        className="tbtn tbtn--p"
        style={{ height: 48 }}
        disabled={pendente || preenchidas === 0 || publicada}
        onClick={publicar}
      >
        {publicada ? "Publicada" : "Publicar"}
      </button>

      <FolhaInferior
        aberta={alvo !== null}
        aoFechar={() => setAlvo(null)}
        titulo={alvo ? `Escolher ${alvo.funcao.nome}` : "Escolher"}
        descricao={`${ministerio.nome} · ${quando}`}
      >
        {livres.lista.length === 0 ? (
          <p className="vazio" style={{ padding: 16 }}>
            Ninguém livre com esta função.{" "}
            <Link href="/lider/equipe" className="link">
              Ver equipe
            </Link>
          </p>
        ) : (
          livres.lista.map((c) => (
            <button
              key={c.usuarioId}
              type="button"
              className="row"
              style={{ width: "100%", border: 0, background: "none", color: "inherit", textAlign: "left" }}
              disabled={pendente}
              onClick={() => alvo && gravar(alvo.vaga.itemId, c.usuarioId)}
            >
              <span className="row__tx">
                <b>{c.nome}</b>
                <span>
                  {c.noMes === 0 ? "Nenhuma escala no mês" : `${c.noMes} ${c.noMes === 1 ? "escala" : "escalas"} no mês`}
                </span>
              </span>
            </button>
          ))
        )}
        {livres.bloqueados > 0 && (
          <p style={{ padding: "8px 16px", color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
            {livres.bloqueados} {livres.bloqueados === 1 ? "pessoa fora" : "pessoas fora"} da lista: folga ou outro culto
            no mesmo horário.
          </p>
        )}
      </FolhaInferior>
    </section>
  );
}
