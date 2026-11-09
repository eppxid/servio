import estilo from "./equipe.module.css";

/** Marca quem é admin ou líder; voluntário não leva selo. */
export function SeloPapel({ papel }: { papel: "admin" | "lider" | "voluntario" }) {
  if (papel === "voluntario") return null;
  return <span className={estilo.selo}>{papel === "admin" ? "Admin" : "Líder"}</span>;
}
