import Link from "next/link";
import { Check, X } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, getUserDirectory, describeOption, getAvailability, getOrg } from "@/lib/data";
import { fmtDate, fmtDateTime, fmtMonth, todayBR, movementTypeLabel } from "@/lib/format";
import { addMonths, addDays } from "@/lib/calc";
import { PageHeader, Panel, PanelHeader, Table, Th, Td, Tr, EmptyState, Notice } from "@/components/ui/primitives";
import { ConfirmAction } from "@/components/action-form";
import { SeatMeter } from "@/components/seat-mark";
import { approveMovement, rejectMovement } from "../movimentacoes/actions";
import type { Movement, EmployeeBenefit, CalendarMonth } from "@/lib/types";

type Row = Movement & { employees: { full_name: string; registration: string } };

export default async function AprovacoesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = todayBR();
  const nextMonth = addMonths(`${today.slice(0, 7)}-01`, 1);

  const [{ data }, cat, dir, availNext, availNow, org, cal] = await Promise.all([
    supabase.from("movements").select("*, employees(full_name, registration)").eq("status", "AGUARDANDO_APROVACAO").order("created_at"),
    getCatalog(),
    getUserDirectory(),
    getAvailability(nextMonth),
    getAvailability(today),
    getOrg(),
    supabase.from("calendar_months").select("*").gte("approval_date", today).order("approval_date").limit(1).maybeSingle(),
  ]);
  const rows = (data ?? []) as Row[];
  const prevIds = rows.map((r) => r.previous_benefit_id).filter(Boolean) as string[];
  const { data: prevData } = prevIds.length
    ? await supabase.from("employee_benefits").select("*").in("id", prevIds)
    : { data: [] as EmployeeBenefit[] };
  const prev = new Map(((prevData ?? []) as EmployeeBenefit[]).map((b) => [b.id, b]));
  const nextApproval = cal.data as CalendarMonth | null;
  const isApprovalDay = nextApproval?.approval_date === today;

  const groups: { title: string; description: string; types: Movement["type"][] }[] = [
    {
      title: "Movimentações de categoria",
      description: `Troca de rota, horário ou entre VT e fretado. Aprovando hoje, vale a partir de ${fmtDate(nextMonth)}.`,
      types: ["MOVIMENTACAO_CATEGORIA"],
    },
    { title: "Trocas de horário por turno", description: "Mesma rota e operadora. Aprovando, vale a partir de hoje.", types: ["TROCA_HORARIO"] },
    { title: "Pedidos complementares", description: "Exceções fora da janela. Aprovados, entram na próxima compra complementar.", types: ["PEDIDO_COMPLEMENTAR"] },
  ];
  const who = (uid: string | null) => (uid ? dir.get(uid)?.username ?? "—" : "sistema");
  const unit = (id: string) => org.units.find((u) => u.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader title="Aprovações" description="Pedidos do RH que dependem de você. Toda decisão fica registrada com usuário e horário." />

      {rows.some((r) => r.type === "MOVIMENTACAO_CATEGORIA") && (
        <Notice tone={isApprovalDay ? "petrol" : "warn"} className="mb-6">
          {isApprovalDay
            ? "Hoje é o dia de aprovação das trocas no calendário."
            : nextApproval
              ? `O próximo dia de aprovação das trocas no calendário é ${fmtDate(nextApproval.approval_date)}. Se aprovar antes, a troca já vale a partir de ${fmtMonth(nextMonth)}.`
              : "Não há dia de aprovação definido no calendário."}
        </Notice>
      )}

      {rows.length === 0 ? (
        <Panel>
          <EmptyState title="Nada aguardando aprovação.">Os pedidos que estiverem na fila de espera aparecem em Fila de espera.</EmptyState>
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => {
            const list = rows.filter((r) => g.types.includes(r.type));
            if (!list.length) return null;
            return (
              <Panel key={g.title}>
                <PanelHeader title={`${g.title} (${list.length})`} description={g.description} />
                <Table>
                  <thead>
                    <tr>
                      <Th>Colaborador</Th>
                      <Th>De</Th>
                      <Th>Para</Th>
                      <Th>Pedido</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((m) => {
                      const from = m.previous_benefit_id ? prev.get(m.previous_benefit_id) : undefined;
                      const fromOpt = from ? describeOption(cat, from) : null;
                      const to = describeOption(cat, m);
                      const a = m.charter_schedule_id ? (m.type === "TROCA_HORARIO" ? availNow : availNext).get(m.charter_schedule_id) : undefined;
                      return (
                        <Tr key={m.id}>
                          <Td>
                            <Link href={`/colaboradores/${m.employee_id}`} className="font-medium hover:text-petrol-600">
                              {m.employees.full_name}
                            </Link>
                            <p className="text-xs text-ink-faint">
                              Chapa {m.employees.registration} · {unit(m.business_unit_id)}
                            </p>
                          </Td>
                          <Td className="text-[13px] text-ink-soft">
                            {fromOpt ? (
                              <>
                                {fromOpt.category}
                                <br />
                                {fromOpt.title} {fromOpt.detail}
                              </>
                            ) : (
                              "Sem benefício"
                            )}
                          </Td>
                          <Td className="text-[13px]">
                            <span className="font-medium">{to.category}</span>
                            <br />
                            {to.title} {to.detail}
                            {a && (
                              <div className="mt-2">
                                <SeatMeter seats={a.seats} taken={a.taken} compact />
                              </div>
                            )}
                            {m.type === "PEDIDO_COMPLEMENTAR" && <p className="text-xs text-ink-faint">Início em {fmtDate(m.effective_date)}</p>}
                          </Td>
                          <Td className="text-xs text-ink-soft">
                            {who(m.created_by)}
                            <br />
                            {fmtDateTime(m.created_at)}
                            {m.justification && <p className="mt-1 max-w-[240px] text-ink">“{m.justification}”</p>}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            <div className="flex justify-end gap-2">
                              <ConfirmAction
                                action={rejectMovement.bind(null, m.id)}
                                label="Rejeitar"
                                icon={<X />}
                                variant="danger"
                                title={`Rejeitar pedido de ${m.employees.full_name}?`}
                                description="O RH vê o motivo na movimentação."
                                note={{ label: "Motivo da rejeição", required: true }}
                              />
                              <ConfirmAction
                                action={approveMovement.bind(null, m.id)}
                                label="Aprovar"
                                icon={<Check />}
                                variant="primary"
                                title={`Aprovar ${movementTypeLabel[m.type].toLowerCase()}?`}
                                description={
                                  m.type === "MOVIMENTACAO_CATEGORIA"
                                    ? `O benefício atual vai até ${fmtDate(addDays(nextMonth, -1))} e o novo começa em ${fmtDate(nextMonth)}.`
                                    : m.type === "TROCA_HORARIO"
                                      ? "O novo horário vale a partir de hoje."
                                      : "O benefício é criado e entra na próxima compra complementar."
                                }
                                note={{ label: "Observação (opcional)" }}
                              />
                            </div>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
