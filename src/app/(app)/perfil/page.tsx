export default function Perfil() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Perfil</h1>
      <form action="/sair" method="post">
        <button type="submit" className="botao">
          Sair
        </button>
      </form>
    </div>
  );
}
