import { cn } from "@/lib/cn";

/** Marca do sistema: um assento estilizado. */
export function SeatMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} fill="none" aria-hidden>
      <path d="M7 3.5h10a2 2 0 0 1 2 2V14H5V5.5a2 2 0 0 1 2-2Z" fill="currentColor" opacity=".35" />
      <path d="M4 12.5h16a1 1 0 0 1 1 1V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5a1 1 0 0 1 1-1Z" fill="currentColor" />
      <path d="M6.5 19v2M17.5 19v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Assentos de um horário de fretado: ocupados preenchidos, livres em contorno.
 * Até 40 assentos desenha um a um; acima disso mostra uma barra proporcional.
 */
export function SeatMeter({ seats, taken, compact }: { seats: number | null; taken: number; compact?: boolean }) {
  if (seats === null) {
    return <span className="text-xs text-ink-soft">Sem limite · {taken} em uso</span>;
  }
  const free = Math.max(seats - taken, 0);
  const tone = free === 0 ? "bad" : free <= 3 ? "warn" : "ok";
  const label = free === 0 ? "Esgotado" : free <= 3 ? `Últimas vagas · ${free} livre${free > 1 ? "s" : ""}` : `${free} livres de ${seats}`;
  const color = { ok: "bg-petrol-500", warn: "bg-warn", bad: "bg-bad" }[tone];
  const text = { ok: "text-ink-soft", warn: "text-warn", bad: "text-bad" }[tone];

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {seats <= 40 && !compact ? (
        <div className="flex flex-wrap gap-[3px]" role="img" aria-label={`${taken} de ${seats} assentos ocupados`}>
          {Array.from({ length: seats }, (_, i) => (
            <span
              key={i}
              className={cn("h-3 w-2.5 rounded-t-[3px] rounded-b-[1px]", i < taken ? color : "border border-line-strong bg-surface")}
            />
          ))}
        </div>
      ) : (
        <div className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-line" role="img" aria-label={`${taken} de ${seats} assentos ocupados`}>
          <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, (taken / seats) * 100)}%` }} />
        </div>
      )}
      <span className={cn("text-xs font-medium", text)}>{label}</span>
    </div>
  );
}
