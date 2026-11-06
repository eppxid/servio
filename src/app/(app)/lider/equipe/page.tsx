import Link from "next/link";
import { Cabecalho } from "@/components/Cabecalho";
import { db } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { ministeriosDoLider } from "@/lib/escala/nucleo";
import { idSeguro } from "@/lib/ministerios/sessao";
import {
  adicionarFuncao,
  aprovarEntrada,
  aprovarFuncaoDesejada,
  recusarEntrada,
  recusarFuncaoDesejada,
  renomearFuncaoAcao,
} from "./actions";
import { carregarEquipe } from "./dados";
import { ListaMembros } from "./ListaMembros";

export const dynamic = "force-dynamic";

/** Equipe do líder: pedidos, recomendações, membros e funções de um ministério. */
export default async function Equipe({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const usuario = await exigirUsuario();
  const meus = await ministeriosDoLider(db() as unknown as AnyDb, usuario);
  const { m } = await searchParams;
  const escolhido = meus.find((x) => x.id === idSeguro(m)) ?? meus[0];
  const equipe = escolhido ? await carregarEquipe(usuario, escolhido.id) : null;

  return (
    <div className="tela">
      <Cabecalho eyebrow="Modo líder" titulo="Equipe" />
      {meus.length > 1 && (
        <nav aria-label="Ministério" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {meus.map((x) => (
            <Link
              key={x.id}
              href={`/lider/equipe?m=${x.id}`}
              className={`tbtn ${x.id === escolhido.id ? "tbtn--p" : "tbtn--soft"}`}
              aria-current={x.id === escolhido.id ? "page" : undefined}
            >
              {x.nome}
            </Link>
          ))}
        </nav>
      )}
      {equipe && escolhido && (
        <>
          {equipe.pedidos.length > 0 && (
            <section aria-label="Pedidos pendentes" style={{ display: "grid", gap: 8 }}>
              <h2 className="eyebrow">Pedidos ({equipe.pedidos.length})</h2>
              <div className="list">
                {equipe.pedidos.map((p) => (
                  <div key={p.membroId} className="row" style={{ flexWrap: "wrap" }}>
                    <span className="row__tx">
                      <b>{p.nome}</b>
                      <span>{p.status === "pendente" ? "Quer entrar no ministério" : "Pediu novas funções"}</span>
                    </span>
                    {p.status === "pendente" && (
                      <span style={{ display: "flex", gap: 8 }}>
                        <form action={aprovarEntrada}>
                          <input type="hidden" name="membro" value={p.membroId} />
                          <button type="submit" className="tbtn tbtn--p" aria-label={`Aprovar entrada de ${p.nome}`}>
                            Aprovar
                          </button>
                        </form>
                        <form action={recusarEntrada}>
                          <input type="hidden" name="membro" value={p.membroId} />
                          <button type="submit" className="tbtn tbtn--soft" aria-label={`Recusar entrada de ${p.nome}`}>
                            Recusar
                          </button>
                        </form>
                      </span>
                    )}
                    {p.funcoesDesejadas.map((f) => (
                      <div key={f.funcaoId} style={{ display: "flex", flexBasis: "100%", alignItems: "center", gap: 8 }}>
                        <span style={{ flex: 1 }}>Quer servir em {f.nome}</span>
                        <form action={aprovarFuncaoDesejada}>
                          <input type="hidden" name="membro" value={p.membroId} />
                          <input type="hidden" name="funcao" value={f.funcaoId} />
                          <button type="submit" className="tbtn tbtn--p" aria-label={`Aprovar ${f.nome} para ${p.nome}`}>
                            Aprovar
                          </button>
                        </form>
                        <form action={recusarFuncaoDesejada}>
                          <input type="hidden" name="membro" value={p.membroId} />
                          <input type="hidden" name="funcao" value={f.funcaoId} />
                          <button type="submit" className="tbtn tbtn--soft" aria-label={`Recusar ${f.nome} para ${p.nome}`}>
                            Recusar
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {equipe.recomendacoes.length > 0 && (
            <section aria-label="Recomendações" className="list">
              {equipe.recomendacoes.map((r) => (
                <p key={r.funcaoId} className="row" style={{ minHeight: 48 }}>
                  {r.desejam} {r.desejam === 1 ? "pessoa quer" : "pessoas querem"} servir em {r.funcao}
                </p>
              ))}
            </section>
          )}

          <section aria-label="Membros" style={{ display: "grid", gap: 8 }}>
            <h2 className="eyebrow">Membros ({equipe.membros.length})</h2>
            <ListaMembros
              ministerioId={escolhido.id}
              membros={equipe.membros.map((x) => ({
                id: x.id,
                usuarioId: x.usuarioId,
                nome: x.nome,
                papel: x.papel,
                funcaoIds: x.funcaoIds,
                escalasNoMes: x.escalasNoMes,
              }))}
              funcoes={equipe.funcoes.map((f) => ({ id: f.id, nome: f.nome }))}
              admin={usuario.papelGlobal === "admin"}
            />
          </section>

          <section aria-label="Funções do ministério" style={{ display: "grid", gap: 8 }}>
            <h2 className="eyebrow">Funções</h2>
            <div className="list">
              {equipe.funcoes.map((f) => (
                <form key={f.id} action={renomearFuncaoAcao} className="row">
                  <input type="hidden" name="funcao" value={f.id} />
                  <input name="nome" defaultValue={f.nome} required minLength={2} maxLength={80} className="campo" aria-label={`Nome da função ${f.nome}`} />
                  <button type="submit" className="tbtn tbtn--soft">
                    Salvar
                  </button>
                </form>
              ))}
              <form action={adicionarFuncao} className="row">
                <input type="hidden" name="ministerio" value={escolhido.id} />
                <input name="nome" required minLength={2} maxLength={80} className="campo" aria-label="Nova função" placeholder="Nova função" />
                <button type="submit" className="tbtn tbtn--p">
                  Adicionar
                </button>
              </form>
            </div>
            <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
              Para arquivar o ministério ou gerar convite, use <Link href={`/ministerios/${escolhido.id}`}>a página do ministério</Link>.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
