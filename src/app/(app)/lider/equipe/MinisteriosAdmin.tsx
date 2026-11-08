import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { listarMinisterios, type Ator } from "@/lib/ministerios/nucleo";
import { alterarPapel, arquivarMinisterioAcao, criarMinisterioAcao, editarMinisterioAcao } from "./actions";
import { FormConfirmar } from "./FormConfirmar";
import estilo from "./equipe.module.css";

/** Ministérios da igreja: criar, renomear, definir líder e arquivar (só admin). */
export async function MinisteriosAdmin({ ator }: { ator: Ator }) {
  const banco = db();
  const [todos, pessoas] = await Promise.all([
    listarMinisterios(banco, ator),
    banco
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(eq(usuarios.igrejaId, ator.igrejaId))
      .orderBy(asc(usuarios.nome)),
  ]);
  const ativos = todos.filter((m) => !m.arquivadoEm);

  return (
    <section aria-label="Ministérios da igreja" className={estilo.bloco}>
      <div className="list">
        {ativos.map((m) => (
          <details key={m.id} className="row" style={{ display: "block" }}>
            <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>
              <b>{m.nome}</b>
            </summary>
            <div className={estilo.folha} style={{ padding: "8px 0" }}>
              <form action={editarMinisterioAcao}>
                <input type="hidden" name="ministerio" value={m.id} />
                <input name="nome" defaultValue={m.nome} required minLength={2} maxLength={120} className="campo" aria-label={`Nome do ministério ${m.nome}`} />
                <input name="descricao" defaultValue={m.descricao ?? ""} maxLength={500} className="campo" aria-label="Descrição" placeholder="Descrição" />
                <button type="submit" className="tbtn tbtn--soft" style={{ justifySelf: "start" }}>
                  Salvar ministério
                </button>
              </form>
              <form action={alterarPapel}>
                <input type="hidden" name="ministerio" value={m.id} />
                <select name="usuario" className="campo" aria-label={`Pessoa de ${m.nome}`}>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <select name="lider" className="campo" aria-label={`Papel em ${m.nome}`}>
                  <option value="1">Líder</option>
                  <option value="0">Voluntário</option>
                </select>
                <button type="submit" className="tbtn tbtn--soft" style={{ justifySelf: "start" }}>
                  Definir papel
                </button>
              </form>
              <FormConfirmar action={arquivarMinisterioAcao} pergunta={`Arquivar o ministério ${m.nome}?`}>
                <input type="hidden" name="ministerio" value={m.id} />
                <button type="submit" className={`tbtn ${estilo.perigo}`} style={{ justifySelf: "start" }}>
                  Arquivar {m.nome}
                </button>
              </FormConfirmar>
            </div>
          </details>
        ))}
        {ativos.length === 0 && (
          <p className="row" style={{ color: "var(--muted)" }}>
            Nenhum ministério ainda.
          </p>
        )}
      </div>

      <form action={criarMinisterioAcao} className={estilo.convite}>
        <b>Novo ministério</b>
        <input name="nome" required minLength={2} maxLength={120} className="campo" aria-label="Nome do novo ministério" placeholder="Nome" />
        <input name="descricao" maxLength={500} className="campo" aria-label="Descrição do novo ministério" placeholder="Descrição (opcional)" />
        <button type="submit" className="tbtn tbtn--p" style={{ justifySelf: "start" }}>
          Criar ministério
        </button>
      </form>
    </section>
  );
}
