import Link from "next/link";
import { headers } from "next/headers";
import { Cabecalho } from "@/components/Cabecalho";
import { IconeApp } from "@/components/app/icones";
import { db } from "@/db";
import { lerConvitePessoal, listarAparelhos, listarPedidosPendentes } from "@/lib/acesso/nucleo";
import { exigirUsuario } from "@/lib/auth";
import { SENHA_MINIMA, type AnyDb } from "@/lib/auth-core";
import { ministeriosDoLider } from "@/lib/escala/nucleo";
import { idSeguro } from "@/lib/ministerios/sessao";
import {
  adicionarFuncao,
  aprovarEntrada,
  aprovarFuncaoDesejada,
  aprovarPedidoInteiro,
  decidirPedidoAcessoAcao,
  excluirFuncaoAcao,
  gerarConvitePessoalAcao,
  recusarEntrada,
  recusarFuncaoDesejada,
  renomearFuncaoAcao,
} from "./actions";
import { iniciais } from "./Avatar";
import { CompartilharConvite } from "./CompartilharConvite";
import { carregarEquipe } from "./dados";
import estilo from "./equipe.module.css";
import { ListaMembros } from "./ListaMembros";
import { MinisteriosAdmin } from "./MinisteriosAdmin";

export const dynamic = "force-dynamic";

type Aba = "pedidos" | "membros" | "funcoes" | "ministerios";

/** Equipe do líder: pedidos, membros e funções do ministério; o admin também gere os ministérios. */
export default async function Equipe({
  searchParams,
}: {
  searchParams: Promise<{
    ministerio?: string;
    aba?: string;
    acesso?: string;
    nome?: string;
    sobrenome?: string;
    pedido?: string;
    ok?: string;
    erro?: string;
  }>;
}) {
  const usuario = await exigirUsuario();
  const admin = usuario.papelGlobal === "admin";
  const meus = await ministeriosDoLider(db() as unknown as AnyDb, usuario);
  const { ministerio, aba: abaPedida, acesso, nome: nomePedido, sobrenome: sobrenomePedido, pedido, ok, erro } = await searchParams;
  const escolhido = meus.find((x) => x.id === idSeguro(ministerio)) ?? meus[0];
  const equipe = escolhido ? await carregarEquipe(usuario, escolhido.id) : null;

  const abasValidas: Aba[] = equipe ? ["pedidos", "membros", "funcoes"] : [];
  if (admin) abasValidas.push("ministerios");
  const padrao: Aba = equipe && equipe.pedidos.length > 0 ? "pedidos" : equipe ? "membros" : "ministerios";
  const aba = abasValidas.find((a) => a === abaPedida) ?? padrao;
  const rotulo: Record<Aba, string> = { pedidos: "Pedidos", membros: "Membros", funcoes: "Funções", ministerios: "Ministérios" };
  const href = (a: Aba) => `/lider/equipe?${escolhido ? `ministerio=${escolhido.id}&` : ""}aba=${a}`;

  const banco = db() as unknown as AnyDb;
  let link: string | null = null;
  let nomeDoConvite = "";
  if (acesso && /^[0-9a-f]{64}$/.test(acesso)) {
    const dono = await lerConvitePessoal(banco, acesso);
    if (dono && dono.ministerioId === escolhido?.id) {
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
      const proto = h.get("x-forwarded-proto") ?? "https";
      link = `${proto}://${host}/acesso/${acesso}`;
      nomeDoConvite = dono.nome;
    }
  }
  const pedidosAcesso = equipe && escolhido && aba === "membros" ? await listarPedidosPendentes(banco, usuario, escolhido.id) : [];
  const aparelhosDe = new Map<number, Awaited<ReturnType<typeof listarAparelhos>>>();
  if (equipe && aba === "membros") {
    for (const m of equipe.membros) aparelhosDe.set(m.usuarioId, await listarAparelhos(banco, m.usuarioId));
  }
  const pedidoId = /^[0-9]+$/.test(pedido ?? "") ? (pedido ?? "") : "";

  return (
    <div className="tela">
      <Cabecalho
        eyebrow={equipe && escolhido ? `${escolhido.nome} · ${equipe.membros.length} ${equipe.membros.length === 1 ? "pessoa" : "pessoas"}` : "Modo líder"}
        titulo="Equipe"
      />
      {meus.length > 1 && (
        <nav aria-label="Ministério" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {meus.map((x) => (
            <Link
              key={x.id}
              href={`/lider/equipe?ministerio=${x.id}${abaPedida && abaPedida !== "ministerios" ? `&aba=${abaPedida}` : ""}`}
              className={`tbtn ${x.id === escolhido?.id ? "tbtn--p" : "tbtn--soft"}`}
              aria-current={x.id === escolhido?.id ? "page" : undefined}
            >
              {x.nome}
            </Link>
          ))}
        </nav>
      )}

      <nav aria-label="Seções da equipe" className={estilo.abas}>
        {abasValidas.map((a) => (
          <Link key={a} href={href(a)} className={`${estilo.aba} ${a === aba ? estilo.ativa : ""}`} aria-current={a === aba ? "page" : undefined}>
            {rotulo[a]}
            {a === "pedidos" && equipe && equipe.pedidos.length > 0 && <span className={estilo.contador}>{equipe.pedidos.length}</span>}
          </Link>
        ))}
      </nav>

      {erro && (
        <p role="alert" className={`${estilo.aviso} ${estilo.erro}`}>
          {erro === "senha"
            ? `A senha precisa de ${SENHA_MINIMA} caracteres ou mais.`
            : erro === "nome"
              ? "Digite o nome e o sobrenome, com 2 a 60 letras cada."
              : "Confira os campos."}
        </p>
      )}
      {ok === "senha" && (
        <p role="status" className={estilo.aviso}>
          Senha temporária definida. A pessoa troca no próximo acesso.
        </p>
      )}

      {equipe && escolhido && aba === "pedidos" && (
        <>
          {equipe.recomendacoes.length > 0 && (
            <section aria-label="Recomendações" style={{ display: "grid", gap: 8 }}>
              {equipe.recomendacoes.map((r) => (
                <p key={r.funcaoId} className={estilo.reco}>
                  <IconeApp nome="magia" />
                  <span>
                    {r.desejam} {r.desejam === 1 ? "pessoa quer" : "pessoas querem"} servir em {r.funcao}
                  </span>
                </p>
              ))}
            </section>
          )}
          <section aria-label="Pedidos pendentes" style={{ display: "grid", gap: 12 }}>
            {equipe.pedidos.map((p) => (
              <div key={p.membroId} className={estilo.pedido}>
                <div className={estilo.quem}>
                  <span className="avatar">{iniciais(p.nome)}</span>
                  <div>
                    <b>{p.nome}</b>
                    <span>{p.status === "pendente" ? "Quer entrar no ministério" : "Pediu novas funções"}</span>
                  </div>
                </div>
                {p.funcoesDesejadas.map((f) => (
                  <div key={f.funcaoId} className={estilo.funcao}>
                    <span>Quer servir em {f.nome}</span>
                    <form action={recusarFuncaoDesejada}>
                      <input type="hidden" name="membro" value={p.membroId} />
                      <input type="hidden" name="funcao" value={f.funcaoId} />
                      <button type="submit" className="tbtn" aria-label={`Recusar ${f.nome} para ${p.nome}`}>
                        Recusar
                      </button>
                    </form>
                    <form action={aprovarFuncaoDesejada}>
                      <input type="hidden" name="membro" value={p.membroId} />
                      <input type="hidden" name="funcao" value={f.funcaoId} />
                      <button type="submit" className="tbtn tbtn--p" aria-label={`Aprovar ${f.nome} para ${p.nome}`}>
                        Aprovar
                      </button>
                    </form>
                  </div>
                ))}
                {(p.status === "pendente" || p.funcoesDesejadas.length > 1) && (
                  <div className={estilo.acoes}>
                    {p.status === "pendente" && (
                      <>
                        <form action={recusarEntrada}>
                          <input type="hidden" name="membro" value={p.membroId} />
                          <button type="submit" className="tbtn" aria-label={`Recusar entrada de ${p.nome}`}>
                            Recusar
                          </button>
                        </form>
                        <form action={aprovarEntrada}>
                          <input type="hidden" name="membro" value={p.membroId} />
                          <button type="submit" className="tbtn" aria-label={`Aprovar entrada de ${p.nome}`}>
                            Só a entrada
                          </button>
                        </form>
                      </>
                    )}
                    {p.funcoesDesejadas.length > 0 && (
                      <form action={aprovarPedidoInteiro}>
                        <input type="hidden" name="membro" value={p.membroId} />
                        {p.funcoesDesejadas.map((f) => (
                          <input key={f.funcaoId} type="hidden" name="funcao" value={f.funcaoId} />
                        ))}
                        <button type="submit" className="tbtn tbtn--p" aria-label={`Aprovar tudo de ${p.nome}`}>
                          {p.funcoesDesejadas.length > 1 ? `Aprovar as ${p.funcoesDesejadas.length}` : "Aprovar tudo"}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            ))}
            {equipe.pedidos.length === 0 && (
              <div className="list">
                <p className="row" style={{ color: "var(--muted)" }}>
                  Nenhum pedido pendente.
                </p>
              </div>
            )}
          </section>
        </>
      )}

      {equipe && escolhido && aba === "membros" && (
        <>
          {pedidosAcesso.length > 0 && (
            <section aria-label="Pedidos de acesso" style={{ display: "grid", gap: 8 }}>
              <h2 className="eyebrow">Pedidos de acesso ({pedidosAcesso.length})</h2>
              {pedidosAcesso.map((p) => {
                const mesma = p.tipo === "mesma_pessoa";
                const dono = `${p.conviteNome} ${p.conviteSobrenome}`.trim();
                const pedinte = `${p.nome ?? ""} ${p.sobrenome ?? ""}`.trim();
                const dados = new URLSearchParams({ ministerio: String(escolhido.id), aba: "membros", nome: p.nome ?? "", sobrenome: p.sobrenome ?? "", pedido: String(p.id) });
                return (
                  <div key={p.id} className={estilo.pedido}>
                    <div className={estilo.quem}>
                      <span className="avatar">{iniciais(mesma ? dono : pedinte)}</span>
                      <div>
                        <b>{mesma ? `Aparelho novo para ${dono}` : pedinte}</b>
                        <span>{mesma ? p.rotulo : `Pediu um convite (abriu o link de ${dono})`}</span>
                      </div>
                    </div>
                    <div className={estilo.acoes}>
                      <form action={decidirPedidoAcessoAcao}>
                        <input type="hidden" name="pedido" value={p.id} />
                        <input type="hidden" name="aprovar" value="0" />
                        <button type="submit" className="tbtn" aria-label={`Recusar pedido de ${mesma ? dono : pedinte}`}>
                          Recusar
                        </button>
                      </form>
                      {mesma ? (
                        <form action={decidirPedidoAcessoAcao}>
                          <input type="hidden" name="pedido" value={p.id} />
                          <input type="hidden" name="aprovar" value="1" />
                          <button type="submit" className="tbtn tbtn--p" aria-label={`Aprovar aparelho de ${dono}`}>
                            Aprovar
                          </button>
                        </form>
                      ) : (
                        <Link href={`/lider/equipe?${dados}`} className="tbtn tbtn--p">
                          Gerar convite
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}
          <section aria-label="Convidar pessoa" className={estilo.convite}>
            <b>Convidar pessoa</b>
            <p>O link vale por 14 dias. Compartilhe pelo WhatsApp.</p>
            <form action={gerarConvitePessoalAcao} className={estilo.bloco}>
              <input type="hidden" name="ministerio" value={escolhido.id} />
              <input type="hidden" name="pedido" value={pedidoId} />
              <input name="nome" required minLength={2} maxLength={60} className="campo" aria-label="Nome" placeholder="Nome" defaultValue={nomePedido ?? ""} autoComplete="off" />
              <input name="sobrenome" required minLength={2} maxLength={60} className="campo" aria-label="Sobrenome" placeholder="Sobrenome" defaultValue={sobrenomePedido ?? ""} autoComplete="off" />
              <button type="submit" className="tbtn tbtn--p">
                Gerar convite
              </button>
            </form>
            {link && <CompartilharConvite link={link} nome={nomeDoConvite} />}
          </section>
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
                temEmail: !!x.email,
                aparelhos: (aparelhosDe.get(x.usuarioId) ?? []).map((ap) => ({
                  id: ap.id,
                  rotulo: ap.rotulo,
                  ultimoUso: (ap.ultimoUsoEm ?? ap.criadoEm).toISOString(),
                })),
              }))}
              funcoes={equipe.funcoes.map((f) => ({ id: f.id, nome: f.nome }))}
              admin={admin}
              senhaMinima={SENHA_MINIMA}
            />
          </section>
        </>
      )}

      {equipe && escolhido && aba === "funcoes" && (
        <section aria-label="Funções do ministério" style={{ display: "grid", gap: 8 }}>
          <div className="list">
            {equipe.funcoes.map((f) => (
              <div key={f.id} className="row">
                <form action={renomearFuncaoAcao} className={estilo.inline} style={{ flex: 1 }}>
                  <input type="hidden" name="funcao" value={f.id} />
                  <input name="nome" defaultValue={f.nome} required minLength={2} maxLength={80} className="campo" aria-label={`Nome da função ${f.nome}`} />
                  <button type="submit" className="tbtn tbtn--soft" aria-label={`Salvar ${f.nome}`}>
                    Salvar
                  </button>
                </form>
                <form action={excluirFuncaoAcao}>
                  <input type="hidden" name="funcao" value={f.id} />
                  <button type="submit" className={`tbtn ${estilo.perigo}`} aria-label={`Excluir ${f.nome}`}>
                    Excluir
                  </button>
                </form>
              </div>
            ))}
            <form action={adicionarFuncao} className="row">
              <input type="hidden" name="ministerio" value={escolhido.id} />
              <input name="nome" required minLength={2} maxLength={80} className="campo" aria-label="Nova função" placeholder="Nova função" />
              <button type="submit" className="tbtn tbtn--p">
                Adicionar
              </button>
            </form>
          </div>
        </section>
      )}

      {aba === "ministerios" && admin && <MinisteriosAdmin ator={usuario} />}
    </div>
  );
}
