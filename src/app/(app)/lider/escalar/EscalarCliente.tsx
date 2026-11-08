"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AcaoPrincipal } from "@/components/app/AcaoPrincipal";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import { IconeApp } from "@/components/app/icones";
import type { RespostaSugestao } from "./acoes";

export interface CultoAberto {
  eventoId: number;
  titulo: string;
  /** "dd/MM · HH:mm" */
  quando: string;
  preenchidas: number;
  total: number;
  status: "completo" | "faltando" | "sem_escala";
}

/**
 * As ações chegam por prop (vindas da página, no servidor): importar o arquivo `"use server"` aqui
 * criaria uma segunda cópia do módulo do banco e, com ela, um segundo pool de conexões.
 */
export function EscalarCliente({
  ministerioId,
  ministerio,
  mes,
  cultos,
  rascunhos,
  sugerir,
  desfazer,
  publicarMes,
}: {
  ministerioId: number;
  ministerio: string;
  mes: string;
  cultos: CultoAberto[];
  rascunhos: number;
  sugerir: (ministerioId: number, mes: string) => Promise<RespostaSugestao>;
  desfazer: (itens: number[], usuarios: number[]) => Promise<{ erro?: string; desfeitas?: number }>;
  publicarMes: (ministerioId: number, mes: string) => Promise<{ erro?: string; publicadas?: number }>;
}) {
  const [sugestao, setSugestao] = useState<RespostaSugestao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();

  const abertos = cultos.filter((c) => c.status !== "completo");
  const completos = cultos.length - abertos.length;

  const aoSugerir = () =>
    iniciar(async () => {
      setAviso(null);
      const r = await sugerir(ministerioId, mes);
      setErro(r.erro ?? null);
      setSugestao(r.erro ? null : r);
    });

  const aoDesfazer = () =>
    iniciar(async () => {
      if (!sugestao?.itens) return;
      const r = await desfazer(sugestao.itens, sugestao.usuarios ?? []);
      setErro(r.erro ?? null);
      if (!r.erro) {
        setSugestao(null);
        setAviso(`Sugestão desfeita: ${r.desfeitas ?? 0} ${r.desfeitas === 1 ? "vaga esvaziada" : "vagas esvaziadas"}.`);
      }
    });

  const aoPublicar = () =>
    iniciar(async () => {
      const r = await publicarMes(ministerioId, mes);
      setErro(r.erro ?? null);
      setConfirmando(false);
      if (!r.erro) {
        setSugestao(null);
        setAviso(
          r.publicadas
            ? `Mês publicado: ${r.publicadas} ${r.publicadas === 1 ? "escala publicada" : "escalas publicadas"}; os escalados foram avisados.`
            : "Nenhuma escala com pessoas para publicar.",
        );
      }
    });

  const desfazivel = (sugestao?.itens?.length ?? 0) > 0;

  return (
    <>
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="alerta alerta--good">
          {aviso}
        </p>
      )}
      {sugestao?.resumo && (
        <section className="list" aria-label="Resumo da sugestão" role="status">
          <div className="row">
            <span className="row__tx row__tx--quebra">
              <b>{sugestao.resumo}</b>
              <span>Rascunho: revise nos cultos e publique o mês.</span>
            </span>
            {desfazivel && (
              <span className="row__end">
                <button type="button" className="tbtn tbtn--soft" disabled={pendente} onClick={aoDesfazer}>
                  Desfazer
                </button>
              </span>
            )}
          </div>
          {(sugestao.semVagas ?? []).map((v) => (
            <Link key={v.eventoId} href={`/lider/cultos/${v.eventoId}`} className="row">
              <span className="row__tx">
                <b>{v.data.slice(8, 10)}/{v.data.slice(5, 7)} · sem vagas definidas</b>
                <span>Defina as vagas do culto para entrar na sugestão</span>
              </span>
              <span className="row__end">
                <IconeApp nome="dir" />
              </span>
            </Link>
          ))}
          {(sugestao.recomendacoes ?? []).map((r) => (
            <Link key={r.funcaoId} href="/lider/equipe" className="row">
              <span className="row__tx">
                <b>
                  {r.desejam} {r.desejam === 1 ? "pessoa deseja" : "pessoas desejam"} {r.funcao}
                </b>
                <span>Aprove na Equipe para entrar nas próximas sugestões</span>
              </span>
              <span className="row__end">
                <IconeApp nome="dir" />
              </span>
            </Link>
          ))}
        </section>
      )}

      {cultos.length === 0 ? (
        <section className="list vazio">
          <p>Nenhum culto neste mês.</p>
        </section>
      ) : (
        <section className="list" aria-label="Cultos com vaga aberta">
          {abertos.length === 0 ? (
            <p className="vazio" style={{ padding: 16 }}>
              Todos os cultos do mês estão completos em {ministerio}.
            </p>
          ) : (
            abertos.map((c) => (
              <Link key={c.eventoId} href={`/lider/cultos/${c.eventoId}`} className="row">
                <span className="row__tx">
                  <b>
                    {c.titulo} · {c.quando}
                  </b>
                  <span>
                    <span className={`vg ${c.status === "sem_escala" || c.preenchidas === 0 ? "vg--sem" : "vg--falta"}`}>
                      {ministerio} {c.status === "sem_escala" ? "–" : `${c.preenchidas}/${c.total}`}
                    </span>
                  </span>
                </span>
                <span className="row__end">
                  <IconeApp nome="dir" />
                </span>
              </Link>
            ))
          )}
        </section>
      )}
      {completos > 0 && abertos.length > 0 && (
        <p className="eyebrow">
          {completos} {completos === 1 ? "culto completo" : "cultos completos"} não aparecem aqui.
        </p>
      )}

      <button
        type="button"
        className="tbtn tbtn--p"
        style={{ height: 48 }}
        disabled={pendente || rascunhos === 0}
        onClick={() => setConfirmando(true)}
      >
        Publicar mês
      </button>
      <AcaoPrincipal icone="magia" disabled={pendente} onClick={aoSugerir}>
        {pendente ? "Trabalhando…" : "Sugerir escala do mês"}
      </AcaoPrincipal>

      <FolhaInferior
        aberta={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo="Publicar o mês?"
        descricao={`${ministerio} · ${rascunhos} ${rascunhos === 1 ? "escala em rascunho" : "escalas em rascunho"}`}
        rodape={
          <button type="button" className="tbtn tbtn--p" style={{ height: 48, width: "100%" }} disabled={pendente} onClick={aoPublicar}>
            Publicar e avisar
          </button>
        }
      >
        <p style={{ padding: "8px 16px" }}>
          As escalas em rascunho com pessoas ficam publicadas e cada escalado recebe um aviso. Cultos sem ninguém escalado
          continuam em rascunho.
        </p>
      </FolhaInferior>
    </>
  );
}
