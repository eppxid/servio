"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import { IconeApp } from "@/components/app/icones";
import type { Resultado } from "../acoes";
import type { CandidatoCulto, FuncaoCulto, MinisterioCulto, StatusItem, VagaCulto } from "../vagas-culto";
import s from "./culto.module.css";

const STATUS = {
  pendente: { texto: "Ainda não respondeu", chip: "Aguarda", classe: "chip--warn" },
  confirmado: { texto: "Confirmou", chip: "Ok", classe: "chip--good" },
  recusado: { texto: "Recusou", chip: "Recusou", classe: "chip--bad" },
} as const;

const CORES = ["var(--primary)", "#b4549a", "var(--good)", "var(--warn)"];
const SEGUNDOS_DO_AVISO = 8;

const corDe = (usuarioId: number) => CORES[usuarioId % CORES.length];

function Pessoa({ usuarioId, nome, fotos, classe }: { usuarioId: number; nome: string; fotos: Record<number, number>; classe?: string }) {
  return <Avatar nome={nome} usuarioId={usuarioId} fotoVersao={fotos[usuarioId]} cor={corDe(usuarioId)} className={classe} />;
}

const MOTIVO_FORA = { indisponivel: "De folga neste dia", conflito: "Em outro culto no mesmo horário" } as const;

/** Livres para a vaga: função aprovada, sem folga, fora de outro culto no horário e sem outra vaga neste. */
function livresPara(vagas: VagaCulto[], funcao: FuncaoCulto, vaga: VagaCulto) {
  const usados = new Set(vagas.filter((v) => v.itemId !== vaga.itemId && v.usuarioId !== null).map((v) => v.usuarioId));
  const candidatos = funcao.candidatos.filter((c) => !usados.has(c.usuarioId) && c.usuarioId !== vaga.usuarioId);
  const lista = candidatos
    .filter((c) => !c.bloqueio)
    .sort((a, b) => a.noMes - b.noMes || a.nome.localeCompare(b.nome, "pt-BR"));
  return { lista, fora: candidatos.filter((c) => c.bloqueio) };
}

/**
 * Vagas de um ministério no culto, agrupadas por função: escolher, trocar e remover pessoas, e publicar.
 * As ações chegam por prop (vindas da página, no servidor): importar o arquivo `"use server"` aqui
 * criaria uma segunda cópia do módulo do banco e, com ela, um segundo pool de conexões.
 */
export function VagasMinisterio({
  eventoId,
  quando,
  ministerio,
  fotos,
  fixo,
  escolher,
  desfazer,
  aprovar,
  publicarCulto,
}: {
  eventoId: number;
  quando: string;
  ministerio: MinisterioCulto;
  /** usuarioId → versão da foto (uma consulta para a tela toda). */
  fotos: Record<number, number>;
  /** Único ministério na tela: o Publicar fica fixo no rodapé; senão, dentro do cartão. */
  fixo: boolean;
  escolher: (eventoId: number, itemId: number, usuarioId: number | null) => Promise<Resultado>;
  desfazer: (eventoId: number, itemId: number, usuarioId: number, status: StatusItem) => Promise<Resultado>;
  aprovar: (eventoId: number, ministerioId: number, membroId: number, funcaoId: number) => Promise<Resultado>;
  publicarCulto: (eventoId: number, ministerioId: number) => Promise<Resultado>;
}) {
  const [escolhendo, setEscolhendo] = useState<{ funcao: FuncaoCulto; vaga: VagaCulto } | null>(null);
  const [acoes, setAcoes] = useState<{ funcao: FuncaoCulto; vaga: VagaCulto } | null>(null);
  const [removido, setRemovido] = useState<{ itemId: number; usuarioId: number; status: StatusItem; texto: string } | null>(
    null,
  );
  const [adiados, setAdiados] = useState<number[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (!removido) return;
    const t = setTimeout(() => setRemovido(null), SEGUNDOS_DO_AVISO * 1000);
    return () => clearTimeout(t);
  }, [removido]);

  const vagas = ministerio.funcoes.flatMap((f) => f.vagas);
  const publicada = ministerio.status === "publicada";
  const preenchidas = vagas.filter((v) => v.usuarioId !== null && v.status !== "recusado").length;

  // Só vale recomendar quem pediu uma função que tem vaga aberta neste culto.
  const reco = ministerio.pedidos.find(
    (p) =>
      !adiados.includes(p.membroId * 1000 + p.funcaoId) &&
      ministerio.funcoes.some((f) => f.id === p.funcaoId && f.vagas.some((v) => v.usuarioId === null)),
  );

  const executar = (fn: () => Promise<Resultado>, depois?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      setErro(r.erro ?? null);
      if (!r.erro) depois?.();
    });

  const gravar = (itemId: number, usuarioId: number | null) =>
    executar(
      () => escolher(eventoId, itemId, usuarioId),
      () => setEscolhendo(null),
    );

  const remover = (funcao: FuncaoCulto, vaga: VagaCulto) => {
    if (vaga.usuarioId === null) return;
    const anterior = { itemId: vaga.itemId, usuarioId: vaga.usuarioId, status: vaga.status };
    executar(
      () => escolher(eventoId, vaga.itemId, null),
      () => {
        setAcoes(null);
        setRemovido({ ...anterior, texto: `${vaga.nome ?? "Pessoa"} saiu de ${funcao.nome}.` });
      },
    );
  };

  const livres = escolhendo ? livresPara(vagas, escolhendo.funcao, escolhendo.vaga) : { lista: [], fora: [] };
  const publicavel = !publicada && preenchidas > 0;
  const botaoPublicar = (
    <button
      type="button"
      className={fixo ? "cta" : "tbtn tbtn--p"}
      disabled={pendente}
      onClick={() => executar(() => publicarCulto(eventoId, ministerio.id))}
    >
      {fixo && <IconeApp nome="seta" />}
      Publicar escala
    </button>
  );

  return (
    <section aria-label={ministerio.nome} className={s.ministerio}>
      <div className={s.mtopo}>
        <h2>{ministerio.nome}</h2>
        <span className={`vg ${publicada ? "vg--ok" : "vg--sem"}`}>{publicada ? "Publicada" : "Rascunho"}</span>
      </div>

      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}

      {reco && (
        <div className={s.reco} role="group" aria-label="Recomendação">
          <span className={`row__ic ${s.reco__ic}`}>
            <IconeApp nome="magia" />
          </span>
          <div className={s.reco__tx}>
            <span>
              <b>
                {reco.nome.split(" ")[0]} quer servir em {reco.funcao}.
              </b>{" "}
              Aprovar e escalar neste culto?
            </span>
            <div className={s.reco__acoes}>
              <button
                type="button"
                className="tbtn tbtn--p"
                disabled={pendente}
                onClick={() => executar(() => aprovar(eventoId, ministerio.id, reco.membroId, reco.funcaoId))}
              >
                Aprovar
              </button>
              <button
                type="button"
                className="tbtn"
                onClick={() => setAdiados((a) => [...a, reco.membroId * 1000 + reco.funcaoId])}
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}

      {ministerio.funcoes.map((f) => {
        const ocupadas = f.vagas.filter((v) => v.usuarioId !== null && v.status !== "recusado").length;
        return (
          <div key={f.id} className={s.funcao} role="group" aria-label={f.nome}>
            <div className={s.funcao__topo}>
              <span className={`row__ic ${s.funcao__ic}`}>
                <IconeApp nome="equipe" />
              </span>
              <b>{f.nome}</b>
              <span className={`vg ${ocupadas === f.vagas.length ? "vg--ok" : "vg--falta"}`}>
                {ocupadas}/{f.vagas.length}
              </span>
            </div>
            {f.vagas.map((v) => {
              if (v.usuarioId === null) {
                const n = livresPara(vagas, f, v).lista.length;
                return (
                  <div key={v.itemId} className={s.slot}>
                    <span className={s.slot__vazio} aria-hidden="true">
                      <IconeApp nome="adicionar" />
                    </span>
                    <span className={s.slot__tx}>
                      <b>Vaga aberta</b>
                      <span>{n === 0 ? "Ninguém livre" : n === 1 ? "1 pessoa livre" : `${n} pessoas livres`}</span>
                    </span>
                    <button
                      type="button"
                      className="tbtn tbtn--p"
                      disabled={pendente}
                      onClick={() => setEscolhendo({ funcao: f, vaga: v })}
                    >
                      Escolher
                    </button>
                  </div>
                );
              }
              const st = STATUS[v.status];
              const nome = v.nome ?? "Pessoa";
              return (
                <button
                  key={v.itemId}
                  type="button"
                  className={s.slot}
                  disabled={pendente}
                  aria-label={`${nome}, ${f.nome}: ${st.texto}. Abrir ações`}
                  onClick={() => setAcoes({ funcao: f, vaga: v })}
                >
                  <Pessoa usuarioId={v.usuarioId} nome={nome} fotos={fotos} classe={s.slot__avatar} />
                  <span className={s.slot__tx}>
                    <b>{nome}</b>
                    <span>{st.texto}</span>
                  </span>
                  <span className={`chip ${st.classe}`}>{st.chip}</span>
                </button>
              );
            })}
          </div>
        );
      })}

      {publicavel && botaoPublicar}

      {removido && (
        <div role="status" className={s.aviso}>
          <span>{removido.texto}</span>
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              executar(
                () => desfazer(eventoId, removido.itemId, removido.usuarioId, removido.status),
                () => setRemovido(null),
              )
            }
          >
            Desfazer
          </button>
        </div>
      )}

      <FolhaInferior
        aberta={acoes !== null}
        aoFechar={() => setAcoes(null)}
        titulo={acoes?.vaga.nome ?? "Pessoa"}
        descricao={acoes ? `${acoes.funcao.nome} · ${quando}` : undefined}
      >
        <div className={s.acoes}>
          <button
            type="button"
            className="tbtn tbtn--soft"
            disabled={pendente}
            onClick={() => {
              setEscolhendo(acoes);
              setAcoes(null);
            }}
          >
            Trocar
          </button>
          <button
            type="button"
            className={`tbtn ${s.perigo}`}
            disabled={pendente}
            onClick={() => acoes && remover(acoes.funcao, acoes.vaga)}
          >
            Remover
          </button>
        </div>
      </FolhaInferior>

      <FolhaInferior
        aberta={escolhendo !== null}
        aoFechar={() => setEscolhendo(null)}
        titulo={escolhendo ? `Quem vai em ${escolhendo.funcao.nome}?` : "Escolher"}
        descricao={`${quando} · só quem tem a função e está livre`}
      >
        {livres.lista.length === 0 ? (
          <p className="vazio" style={{ padding: 16 }}>
            Ninguém livre com esta função.{" "}
            <Link href="/lider/equipe" className="link">
              Ver equipe
            </Link>
          </p>
        ) : (
          livres.lista.map((c, i) => (
            <button
              key={c.usuarioId}
              type="button"
              className={`row ${s.opcao} ${i === 0 ? s.opcao__melhor : ""}`}
              disabled={pendente}
              aria-label={`Escolher ${c.nome}`}
              onClick={() => escolhendo && gravar(escolhendo.vaga.itemId, c.usuarioId)}
            >
              <Pessoa usuarioId={c.usuarioId} nome={c.nome} fotos={fotos} />
              <span className="row__tx">
                <b>{c.nome}</b>
                <span>
                  {c.noMes === 0 ? "Nenhuma escala no mês" : `${c.noMes} ${c.noMes === 1 ? "escala" : "escalas"} no mês`}
                  {i === 0 && livres.lista.length > 1 ? " · melhor opção" : ""}
                </span>
              </span>
              <span className={`tbtn ${i === 0 ? "tbtn--p" : ""}`}>Escolher</span>
            </button>
          ))
        )}
        {livres.fora.length > 0 && (
          <>
            <p className={s.fora}>Fora da lista</p>
            {livres.fora.map((c: CandidatoCulto) => (
              <div key={c.usuarioId} className={`row ${s.opcao__fora}`}>
                <Pessoa usuarioId={c.usuarioId} nome={c.nome} fotos={fotos} />
                <span className="row__tx">
                  <b>{c.nome}</b>
                  <span>{MOTIVO_FORA[c.bloqueio as keyof typeof MOTIVO_FORA]}</span>
                </span>
              </div>
            ))}
          </>
        )}
      </FolhaInferior>
    </section>
  );
}
