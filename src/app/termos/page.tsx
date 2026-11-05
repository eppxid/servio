import Link from "next/link";
import { Publica } from "@/components/Publica";
import { AVISO_RASCUNHO, TERMOS_VERSAO, dadosIgreja } from "@/lib/lgpd/termos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Termos de uso — Servio" };

export default function Termos() {
  const igreja = dadosIgreja();
  return (
    <Publica larga className="text-sm leading-relaxed">
      <p role="note" className="alerta alerta--bad font-bold">
        {AVISO_RASCUNHO}
      </p>
      <h1 className="title">Termos de uso</h1>
      <p className="text-muted">Versão {TERMOS_VERSAO}</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. O serviço</h2>
        <p>
          O portal organiza as escalas de voluntários de {igreja.nome} (CNPJ {igreja.cnpj}). O uso é gratuito e só para
          membros e voluntários convidados por um líder.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Sua conta</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Use dados verdadeiros e uma senha só sua, com 8 caracteres ou mais.</li>
          <li>Não compartilhe a senha nem o link do calendário (.ics).</li>
          <li>Avise o líder se perceber acesso que não foi você.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Uso correto</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>O chat e os agradecimentos são para assuntos da escala, com respeito aos colegas.</li>
          <li>Não copie nem divulgue dados de outros voluntários fora do portal.</li>
          <li>O líder pode remover conteúdo ou membro que descumpra estes termos.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Privacidade</h2>
        <p>
          O tratamento dos seus dados segue a{" "}
          <Link href="/privacidade" className="link">
            política de privacidade
          </Link>
          . Quando esta versão mudar, o portal pede um novo aceite no próximo login.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. Encerrar a conta</h2>
        <p>
          Você pode excluir a conta quando quiser em Perfil → Privacidade e meus dados. Dúvidas: {igreja.contato}.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">6. Lei e foro</h2>
        <p>
          Estes termos seguem a lei brasileira, em especial a LGPD (Lei 13.709/2018) e o Marco Civil da Internet (Lei
          12.965/2014). Fica eleito o foro da comarca da sede da igreja ({igreja.endereco}).
        </p>
      </section>

      <p>
        <Link href="/privacidade" className="link">
          Política de privacidade
        </Link>
        {" · "}
        <Link href="/entrar" className="link">
          Entrar
        </Link>
      </p>
    </Publica>
  );
}
