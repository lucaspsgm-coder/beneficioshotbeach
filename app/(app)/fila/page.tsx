import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, getAvailability, getOrg, describeOption, getUserDirectory } from "@/lib/data";
import { fmtDate, fmtDateTime, todayBR } from "@/lib/format";
import { addMonths } from "@/lib/calc";
import { PageHeader, Panel, PanelHeader, EmptyState, Notice, Button } from "@/components/ui/primitives";
import { ConfirmAction } from "@/components/action-form";
import { SeatMeter } from "@/components/seat-mark";
import { approveWaitlist, cancelWaitlist } from "../movimentacoes/actions";
import type { Waitlist } from "@/lib/types";

type Row = Waitlist & { employees: { full_name: string; registration: string } };

export default async function FilaPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const supabase = await createClient();
  const today = todayBR();
  const nextMonth = addMonths(`${today.slice(0, 7)}-01`, 1);

  const [{ data }, { data: pos }, cat, avail, org, dir] = await Promise.all([
    supabase.from("waitlist").select("*, employees(full_name, registration)").eq("status", "AGUARDANDO").order("requested_at"),
    supabase.rpc("waitlist_positions"),
    getCatalog(),
    getAvailability(nextMonth),
    getOrg(),
    getUserDirectory(),
  ]);
  const rows = (data ?? []) as Row[];
  const position = new Map(((pos ?? []) as { waitlist_id: string; queue_position: number }[]).map((p) => [p.waitlist_id, p.queue_position]));
  const bySchedule = new Map<string, Row[]>();
  rows.forEach((r) => bySchedule.set(r.charter_schedule_id, [...(bySchedule.get(r.charter_schedule_id) ?? []), r]));
  const unit = (id: string) => org.units.find((u) => u.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Fila de espera"
        description="Sem prazo: a ordem é a da solicitação. Quando abrir vaga, o admin aprova no dia de aprovação e a troca vale no mês seguinte, sem o RH refazer nada."
      />
      {rows.length === 0 ? (
        <Panel>
          <EmptyState title="Ninguém na fila de espera.">
            A fila recebe admissões que começaram no VT esperando um horário lotado, e movimentações de categoria para horários sem vaga.
          </EmptyState>
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          {[...bySchedule.entries()].map(([scheduleId, list]) => {
            const o = describeOption(cat, { vt_fare_id: null, charter_schedule_id: scheduleId });
            const a = avail.get(scheduleId) ?? { seats: null, taken: 0 };
            const free = a.seats === null ? Infinity : a.seats - a.taken;
            const sorted = [...list].sort((x, y) => (position.get(x.id) ?? 0) - (position.get(y.id) ?? 0));
            return (
              <Panel key={scheduleId}>
                <PanelHeader
                  title={`${o.title} · ${o.detail}`}
                  description={`${o.operator}. Vagas consideradas a partir de ${fmtDate(nextMonth)}.`}
                  actions={<SeatMeter seats={a.seats} taken={a.taken} compact />}
                />
                <ol className="divide-y divide-line">
                  {sorted.map((w, i) => {
                    const p = position.get(w.id) ?? i + 1;
                    const canApprove = isAdmin && free > 0 && i < free;
                    return (
                      <li key={w.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-sm font-semibold tabular-nums text-petrol-700">
                          {p}º
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link href={`/colaboradores/${w.employee_id}`} className="font-medium hover:text-petrol-600">
                            {w.employees.full_name}
                          </Link>
                          <p className="text-xs text-ink-faint">
                            Chapa {w.employees.registration} · {unit(w.business_unit_id)} · pedido por {w.created_by ? dir.get(w.created_by)?.username : "sistema"} em{" "}
                            {fmtDateTime(w.requested_at)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <ConfirmAction
                            action={cancelWaitlist.bind(null, w.id)}
                            label="Retirar da fila"
                            variant="ghost"
                            title={`Retirar ${w.employees.full_name} da fila?`}
                            description="O colaborador continua no benefício atual."
                            note={{ label: "Motivo" }}
                          />
                          {isAdmin && (
                            <ConfirmAction
                              action={approveWaitlist.bind(null, w.id)}
                              label="Aprovar troca"
                              variant={canApprove ? "primary" : "secondary"}
                              title={`Aprovar a troca de ${w.employees.full_name}?`}
                              description={`O benefício atual termina no fim deste mês e o fretado neste horário começa em ${fmtDate(nextMonth)}.`}
                              note={{ label: "Observação (opcional)" }}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {isAdmin && free <= 0 && (
                  <div className="px-5 pb-4">
                    <Notice tone="warn">Sem vaga para o mês seguinte neste horário. Aprove quando alguém sair (exclusão ou troca).</Notice>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
      {!isAdmin && rows.length > 0 && (
        <p className="mt-4 text-xs text-ink-faint">
          A posição considera a fila de todas as unidades. <Button asChild variant="link" size="sm"><Link href="/movimentacoes?status=FILA_ESPERA">Ver pedidos na fila</Link></Button>
        </p>
      )}
    </>
  );
}
