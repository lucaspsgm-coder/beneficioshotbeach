import { LoginForm } from "./login-form";
import { SeatMark } from "@/components/seat-mark";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-petrol-700 p-10 text-petrol-50 lg:flex">
        <div className="flex items-center gap-3">
          <SeatMark className="text-petrol-100" />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">Central de Benefícios</span>
        </div>
        <div className="max-w-sm">
          <p className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-white">
            Vale-transporte e fretado num só lugar, do pedido do RH à compra.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-petrol-100/80">
            Cada inclusão, troca e aprovação fica registrada com quem fez e quando.
          </p>
        </div>
        <SeatRow />
      </aside>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <SeatMark className="text-petrol-600" />
            <span className="text-[15px] font-semibold text-ink">Central de Benefícios</span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Entrar</h1>
          <p className="mt-1 text-sm text-ink-soft">Use o usuário e a senha que o administrador de benefícios criou para você.</p>
          {motivo === "sem-acesso" && (
            <p className="mt-4 rounded-md border border-warn/20 bg-warn-bg px-3 py-2 text-[13px] text-warn">
              Seu usuário não tem acesso ativo. Fale com o administrador de benefícios.
            </p>
          )}
          <LoginForm />
        </div>
      </section>
    </main>
  );
}

/** Fileira de assentos: ocupados em tom claro, livres em contorno. */
function SeatRow() {
  const pattern = [1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1];
  return (
    <div aria-hidden className="flex flex-wrap gap-1.5">
      {pattern.map((taken, i) => (
        <span
          key={i}
          className={
            taken ? "h-5 w-4 rounded-t-[5px] rounded-b-[2px] bg-petrol-200/70" : "h-5 w-4 rounded-t-[5px] rounded-b-[2px] border border-petrol-200/50"
          }
        />
      ))}
    </div>
  );
}
