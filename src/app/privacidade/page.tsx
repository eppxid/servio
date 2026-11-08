import Link from "next/link";
import { Publica } from "@/components/Publica";
import { AVISO_RASCUNHO, RETENCAO, TERMOS_VERSAO, dadosIgreja } from "@/lib/lgpd/termos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Política de privacidade — Servio" };

export default function Privacidade() {
  const igreja = dadosIgreja();
  return (
    <Publica larga className="text-sm leading-relaxed">
      <p role="note" className="alerta alerta--bad font-bold">
        {AVISO_RASCUNHO}
      </p>
      <h1 className="title">Política de privacidade</h1>
      <p className="text-muted">Versão {TERMOS_VERSAO}</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. Quem trata os seus dados</h2>
        <p>
          A controladora é {igreja.nome}, CNPJ {igreja.cnpj}, com endereço em {igreja.endereco}. O portal serve só para
          organizar as escalas de voluntários da igreja.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Dados que coletamos e para quê</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Nome: identificar você na escala, no chat e no reconhecimento.</li>
          <li>E-mail e senha (guardada só como hash bcrypt): entrar no portal.</li>
          <li>Telefone (opcional): o líder do ministério fala com você sobre a escala.</li>
          <li>Ministérios, funções e escalas: montar a escala e enviar lembretes.</li>
          <li>Datas em que você não pode servir e o motivo (opcional): evitar escalar você nessas datas.</li>
          <li>Confirmação, presença (check-in) e trocas: organizar o culto e gerar os indicadores do ministério.</li>
          <li>Mensagens do chat da escala e agradecimentos: comunicação entre os voluntários.</li>
          <li>Inscrição de aviso no aparelho (Web Push): enviar lembretes da escala.</li>
          <li>Registro de tentativas de login (e-mail em hash): proteger a conta contra ataque de senha.</li>
        </ul>
        <p>Não usamos Google Analytics, pixel nem rastreamento. O único cookie é o de sessão, necessário para o login.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Base legal</h2>
        <p>
          Ser voluntário de uma igreja revela convicção religiosa, que é dado pessoal sensível (LGPD, art. 5º II). Por
          isso tratamos os seus dados com base no seu consentimento específico e destacado (LGPD, art. 11, I), dado no
          cadastro. Você pode revogar o consentimento a qualquer momento (seção 7).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Quem vê o quê</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Colegas de escala veem só o seu nome.</li>
          <li>O líder do ministério e o administrador veem também o seu e-mail e o seu telefone.</li>
          <li>O motivo da indisponibilidade só você vê; o líder vê apenas &quot;indisponível&quot;.</li>
          <li>No ranking do ministério você aparece só se deixar a opção ligada no perfil.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. Operadores e transferência internacional</h2>
        <p>
          O portal roda na Vercel (hospedagem) e no Neon (banco de dados). As duas empresas são dos Estados Unidos. Os
          dados ficam em servidores em São Paulo (Vercel gru1 e Neon sa-east-1), mas as empresas podem acessá-los a partir
          do exterior para manter o serviço. Essa transferência segue a LGPD, art. 33, com as garantias contratuais dessas
          empresas.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">6. Por quanto tempo guardamos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Mensagens do chat: apagadas {RETENCAO.mensagensDias} dias depois do evento.</li>
          <li>Datas em que você não pode servir: apagadas {RETENCAO.indisponibilidadesDias} dias depois de passarem.</li>
          <li>Tentativas de login: apagadas depois de {RETENCAO.tentativasLoginDias} dia.</li>
          <li>Convites: apagados quando expiram.</li>
          <li>
            Conta excluída: nome, e-mail, telefone e o link de foto de cadastros antigos são apagados. A presença nas escalas passadas fica sem
            identificação, só para os números do ministério.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">7. Seus direitos (LGPD, art. 18)</h2>
        <p>Você pode, a qualquer momento:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>confirmar que tratamos seus dados e acessá-los;</li>
          <li>corrigir dados incompletos ou errados (no Perfil);</li>
          <li>pedir anonimização, bloqueio ou eliminação de dados desnecessários;</li>
          <li>receber os seus dados em formato aberto (portabilidade);</li>
          <li>saber com quem compartilhamos os seus dados (seção 5);</li>
          <li>revogar o consentimento e pedir a eliminação dos dados.</li>
        </ul>
        <p>
          No portal, abra <strong>Perfil → Privacidade e meus dados</strong> para baixar seus dados, excluir a conta ou
          revogar o consentimento. Para qualquer outro pedido, escreva para o encarregado.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">8. Encarregado (DPO) e contato</h2>
        <p>
          Pedidos do titular e dúvidas: {igreja.contato}. Respondemos em até 15 dias. Você também pode reclamar à ANPD
          (Autoridade Nacional de Proteção de Dados).
        </p>
      </section>

      <p>
        <Link href="/termos" className="link">
          Termos de uso
        </Link>
        {" · "}
        <Link href="/entrar" className="link">
          Entrar
        </Link>
      </p>
    </Publica>
  );
}
