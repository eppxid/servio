"use client";

import { useState, useTransition } from "react";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type Resposta = { erro?: string };

const br = (iso: string) => iso.split("-").reverse().join("/");

/** Dia, horários e data limite do tipo de culto. As ações chegam por prop (mesmo motivo do `EditorModelo`). */
export function DiaHorarioTipo({
  recorrenciaId,
  diaSemana,
  horaInicio,
  horaFim,
  ate,
  salvarHorario,
  contarRemocao,
  salvarLimite,
}: {
  recorrenciaId: number;
  diaSemana: number;
  horaInicio: string;
  horaFim: string | null;
  ate: string | null;
  salvarHorario: (recorrenciaId: number, dia: number, inicio: string, fim: string) => Promise<Resposta>;
  contarRemocao: (
    recorrenciaId: number,
    ate: string,
  ) => Promise<{ removidos?: number; publicados?: number; erro?: string }>;
  salvarLimite: (recorrenciaId: number, ate: string | null) => Promise<Resposta>;
}) {
  const [dia, setDia] = useState(String(diaSemana));
  const [inicio, setInicio] = useState(horaInicio);
  const [fim, setFim] = useState(horaFim ?? "");
  const [limite, setLimite] = useState(ate ?? "");
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const resposta = (r: Resposta, ok: string) => setMsg(r.erro ? { erro: true, texto: r.erro } : { erro: false, texto: ok });

  const gravarHorario = () =>
    iniciar(async () => resposta(await salvarHorario(recorrenciaId, Number(dia), inicio, fim), "Horário salvo"));

  const gravarLimite = (valor: string) =>
    iniciar(async () => {
      resposta(await salvarLimite(recorrenciaId, valor || null), valor ? "Data limite salva" : "Data limite removida");
      setConfirmar(null);
    });

  const pedirLimite = () =>
    iniciar(async () => {
      if (!limite) return gravarLimite("");
      const c = await contarRemocao(recorrenciaId, limite);
      if (c.erro) return setMsg({ erro: true, texto: c.erro });
      if (!c.removidos) return gravarLimite(limite);
      setMsg(null);
      setConfirmar(
        `${c.removidos} ${c.removidos === 1 ? "culto depois de" : "cultos depois de"} ${br(limite).slice(0, 5)} ` +
          `${c.removidos === 1 ? "será removido" : "serão removidos"} da agenda${c.publicados ? ` (${c.publicados} já ${c.publicados === 1 ? "publicado" : "publicados"})` : ""}.`,
      );
    });

  const mudou = (f: (v: string) => void) => (e: { target: { value: string } }) => {
    setMsg(null);
    setConfirmar(null);
    f(e.target.value);
  };

  return (
    <section aria-label="Dia e horário" style={{ display: "grid", gap: 10 }}>
      <label className="eyebrow" htmlFor="dia-tipo">
        Dia da semana
      </label>
      <select id="dia-tipo" className="campo" value={dia} onChange={mudou(setDia)}>
        {DIAS.map((nome, i) => (
          <option key={nome} value={i}>
            {nome}
          </option>
        ))}
      </select>
      <label className="eyebrow" htmlFor="inicio-tipo">
        Início
      </label>
      <input id="inicio-tipo" type="time" className="campo" value={inicio} onChange={mudou(setInicio)} />
      <label className="eyebrow" htmlFor="fim-tipo">
        Fim (opcional)
      </label>
      <input id="fim-tipo" type="time" className="campo" value={fim} onChange={mudou(setFim)} />
      <button type="button" className="tbtn tbtn--p" style={{ height: 48 }} disabled={pendente} onClick={gravarHorario}>
        Salvar horário
      </button>

      <label className="eyebrow" htmlFor="limite-tipo">
        Repete até (opcional)
      </label>
      <input id="limite-tipo" type="date" className="campo" value={limite} onChange={mudou(setLimite)} />
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="tbtn tbtn--p" style={{ height: 48, flex: 1 }} disabled={pendente} onClick={pedirLimite}>
          Salvar data limite
        </button>
        <button
          type="button"
          className="tbtn"
          style={{ height: 48 }}
          disabled={pendente || (!limite && !ate)}
          onClick={() => {
            setLimite("");
            setConfirmar(null);
            gravarLimite("");
          }}
        >
          Limpar
        </button>
      </div>
      {confirmar && (
        <div role="alertdialog" aria-label="Confirmar data limite" className="alerta alerta--bad" style={{ display: "grid", gap: 10 }}>
          <p>{confirmar}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="tbtn tbtn--p" disabled={pendente} onClick={() => gravarLimite(limite)}>
              Sim, remover
            </button>
            <button type="button" className="tbtn" onClick={() => setConfirmar(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p role={msg.erro ? "alert" : "status"} className={msg.erro ? "alerta alerta--bad" : "alerta alerta--good"}>
          {msg.texto}
        </p>
      )}
    </section>
  );
}
