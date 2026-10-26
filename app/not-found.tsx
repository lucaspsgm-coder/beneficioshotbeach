import Link from "next/link";
import { Button } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[22px] font-semibold">Página não encontrada</p>
      <p className="text-sm text-ink-soft">O endereço pode ter mudado, ou você não tem acesso a este registro.</p>
      <Button asChild variant="secondary" className="mt-2">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </main>
  );
}
