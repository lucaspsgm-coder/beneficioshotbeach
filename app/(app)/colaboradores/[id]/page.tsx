import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOrg, getCatalog, getAvailability, getCurrentWindow, getUserDirectory, describeOption, traceOf } from "@/lib/data";
import { buildPickerData } from "@/lib/picker";
import { fmtDate, fmtDateTime, fmtMonth, todayBR, movementTypeLabel, exclusionReasonLabel, tableLabel, actionLabel } from "@/lib/format";
import { addMonths } from "@/lib/calc";
import { PageHeader, Panel, PanelHeader, Button, Badge, Table, Th, Td, Tr, EmptyState, Trace, Field, Input } from "@/components/ui/primitives";
import { MovementStatusBadge, CategoryBadge } from "@/components/status";
import { ConfirmAction, FormDialog } from "@/components/action-form";
import { CategoryChangeDialog, ScheduleSwapDialog, ExclusionDialog, EmployeeUpdateDialog } from "./dialogs";
import { cancelMovement, updateCardNumber } from "../../movimentacoes/actions";
import type { Employee, EmployeeBenefit, Movement, Waitlist, AuditRow } from "@/lib/types";

export default async function ColaboradorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const supabase = await createClient();
  const today = todayBR();

  const { data: emp } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  if (!emp) notFound();
  const e = emp as Employee;

  const [benefitsRes, movementsRes, waitRes, org, cat, avail, win, dir] = await Promise.all([
    supabase.from("employee_benefits").select("*").eq("employee_id", id).order("start_date", { ascending: false }),
    supabase.from("movements").select("*").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("waitlist").select("*").eq("employee_id", id).order("requested_at", { ascending: false }),
    getOrg(),
    getCatalog(),
    getAvailability(),
    getCurrentWindow(),
    getUserDirectory(),
  ]);
  const benefits = (benefitsRes.data ?? []) as EmployeeBenefit[];
  const movements = (movementsRes.data ?? []) as Movement[];
  const waits = (waitRes.data ?? []) as Waitlist[];

  const live = benefits.filter((b) => !b.canceled && !(b.end_date && b.end_date < b.start_date));
  const current = live.find((b) => b.start_date <= today && (!b.end_date || b.end_date >= today));
  const upcoming = live.find((b) => b.start_date > today);
  const open = live.find((b) => !b.end_date);
  const pendingChange = movements.some(
    (m) => ["MOVIMENTACAO_CATEGORIA", "TROCA_HORARIO", "PEDIDO_COMPLEMENTAR"].includes(m.type) && ["AGUARDANDO_APROVACAO", "FILA_ESPERA"].includes(m.status),
  );
  const pendingExclusion = movements.some((m) => m.type === "EXCLUSAO_MENSAL" && m.status === "PENDENTE");
  const picker = buildPickerData(cat, avail);
  const vt = cat.categories.find((c) => c.code === "VT");
  const passesPerMonth = (vt?.base_days ?? 26) * (vt?.passes_per_day ?? 2);
  const nextMonth = addMonths(`${today.slice(0, 7)}-01`, 1);
  const who = (uid: string | null) => (uid ? dir.get(uid)?.username ?? "usuário removido" : "sistema");

  const openOpt = open ? describeOption(cat, open) : null;
  const sameRoute = open?.charter_schedule_id ? picker.routes.find((r) => r.schedules.some((s) => s.id === open.charter_schedule_id)) : undefined;

  let audit: AuditRow[] = [];
  if (isAdmin) {
    const ids = [id, ...benefits.map((b) => b.id), ...movements.map((m) => m.id), ...waits.map((w) => w.id)];
    const { data } = await supabase.from("audit_log").select("*").in("record_id", ids).order("occurred_at", { ascending: false }).limit(200);
    audit = (data ?? []) as AuditRow[];
  }

  const name = (list: { id: string; name: string }[], v: string) => list.find((x) => x.id === v)?.name ?? "—";

  return (
    <>
      <PageHeader
        back={
          <Button asChild variant="link" size="sm">
            <Link href="/colaboradores">Colaboradores</Link>
          </Button>
        }
        title={e.full_name}
        description={
          <>
            Chapa {e.registration} · {name(org.units, e.business_unit_id)} · {name(org.entities, e.legal_entity_id)} · {name(org.sections, e.section_id)}
            {!e.active && <Badge className="ml-2">Inativo</Badge>}
          </>
        }
        actions={
          <EmployeeUpdateDialog
            employee={e}
            isAdmin={isAdmin}
            units={org.units.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))}
            entities={org.entities.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, unit: x.business_unit_id }))}
            sections={org.sections.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, entity: x.legal_entity_id }))}
          />
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelHeader
              title="Benefício de mobilidade"
              actions={
                open && !pendingExclusion && e.active ? (
                  <>
                    {!pendingChange && sameRoute && open.charter_schedule_id && (
                      <ScheduleSwapDialog employeeId={e.id} route={sameRoute} currentScheduleId={open.charter_schedule_id} />
                    )}
                    {!pendingChange && !(upcoming && upcoming.origin_movement_id) && (
                      <CategoryChangeDialog
                        employeeId={e.id}
                        picker={picker}
                        passesPerMonth={passesPerMonth}
                        current={{ fareId: open.vt_fare_id, scheduleId: open.charter_schedule_id }}
                        nextMonthLabel={fmtMonth(nextMonth)}
                      />
                    )}
                    <ExclusionDialog employeeId={e.id} windowOpen={!!win} referenceLabel={win ? fmtMonth(win.reference_month) : null} />
                  </>
                ) : !open && e.active ? (
                  <Button asChild size="sm">
                    <Link href={`/movimentacoes/nova?colaborador=${e.id}`}>Incluir benefício</Link>
                  </Button>
                ) : null
              }
            />
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <BenefitCard title="Hoje" b={current} cat={cat} />
              <BenefitCard title="Próximo" b={upcoming} cat={cat} emptyText="Nenhuma mudança programada." />
            </div>
            {pendingChange && (
              <p className="border-t border-line px-5 py-3 text-[13px] text-warn">Há uma troca aguardando aprovação ou na fila. Novas trocas ficam bloqueadas até a decisão.</p>
            )}
            {pendingExclusion && (
              <p className="border-t border-line px-5 py-3 text-[13px] text-warn">Exclusão lançada: o colaborador sai na próxima compra.</p>
            )}
            {openOpt?.category === "Vale-transporte" && !e.vt_card_number && (
              <p className="border-t border-line px-5 py-3 text-[13px] text-bad">Sem número de cartão de VT. A compra não sai sem ele.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Movimentações" description="Quem pediu, quem decidiu e quando." />
            {movements.length === 0 ? (
              <EmptyState title="Nenhuma movimentação." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Movimentação</Th>
                    <Th>Situação</Th>
                    <Th>Pedido</Th>
                    <Th>Decisão</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const target = m.vt_fare_id || m.charter_schedule_id ? describeOption(cat, m) : null;
                    const cancelable = !m.purchase_id && (["PENDENTE", "AGUARDANDO_APROVACAO", "FILA_ESPERA"].includes(m.status) || (isAdmin && m.status === "APROVADO"));
                    return (
                      <Tr key={m.id}>
                        <Td>
                          <p className="font-medium">{movementTypeLabel[m.type]}</p>
                          {target && (
                            <p className="text-[13px] text-ink-soft">
                              {target.category} · {target.title} {target.detail}
                            </p>
                          )}
                          {m.exclusion_reason && <p className="text-[13px] text-ink-soft">{exclusionReasonLabel[m.exclusion_reason]}</p>}
                          {m.effective_date && <p className="text-xs text-ink-faint">Vale a partir de {fmtDate(m.effective_date)}</p>}
                          {m.changes && m.type === "ALTERACAO_CADASTRAL" && <ChangesList changes={m.changes} />}
                          {m.justification && <p className="mt-1 text-xs text-ink-soft">“{m.justification}”</p>}
                        </Td>
                        <Td>
                          <MovementStatusBadge status={m.status} />
                        </Td>
                        <Td className="text-xs text-ink-soft">
                          {who(m.created_by)}
                          <br />
                          {fmtDateTime(m.created_at)}
                        </Td>
                        <Td className="text-xs text-ink-soft">
                          {m.decided_at ? (
                            <>
                              {who(m.decided_by)}
                              <br />
                              {fmtDateTime(m.decided_at)}
                              {m.decision_note && <p className="mt-1 text-ink">“{m.decision_note}”</p>}
                            </>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td className="text-right">
                          {cancelable && (
                            <ConfirmAction
                              action={cancelMovement.bind(null, m.id)}
                              label="Cancelar"
                              variant="ghost"
                              title="Cancelar esta movimentação?"
                              description="O que ela tinha mudado no benefício volta como estava."
                              confirmLabel="Cancelar movimentação"
                              note={{ label: "Motivo" }}
                            />
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Histórico de benefícios" />
            {benefits.length === 0 ? (
              <EmptyState title="Nenhum benefício registrado." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Benefício</Th>
                    <Th>Período</Th>
                    <Th>Registro</Th>
                  </tr>
                </thead>
                <tbody>
                  {benefits.map((b) => {
                    const o = describeOption(cat, b);
                    return (
                      <Tr key={b.id} className={b.canceled ? "text-ink-faint line-through decoration-ink-faint/40" : ""}>
                        <Td>
                          <CategoryBadge code={b.category_code} />
                          <p className="mt-1 text-[13px]">
                            {o.title} <span className="text-ink-faint">{o.detail}</span>
                          </p>
                          <p className="text-xs text-ink-faint">{o.operator}</p>
                        </Td>
                        <Td className="text-[13px]">
                          {fmtDate(b.start_date)} a {b.end_date ? fmtDate(b.end_date) : "hoje"}
                          {b.canceled && <span className="ml-1 no-underline">(cancelado)</span>}
                        </Td>
                        <Td className="text-xs text-ink-soft">
                          {who(b.created_by)}
                          <br />
                          {fmtDateTime(b.created_at)}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Dados cadastrais" />
            <dl className="flex flex-col gap-3 px-5 py-4 text-[13px]">
              <Item label="Data de nascimento" value={fmtDate(e.birth_date)} />
              <Item label="Data de admissão" value={fmtDate(e.admission_date)} />
              <Item label="Nome da mãe" value={e.mother_name ?? "—"} />
              <Item label="Endereço" value={e.address ?? "—"} />
              <Item label="Cartão VT" value={e.vt_card_number ?? "Não informado"} />
            </dl>
            {isAdmin && (
              <div className="border-t border-line px-5 py-3">
                <FormDialog trigger={<Button variant="link" size="sm">Lançar número do cartão</Button>} title="Número do cartão de VT" action={updateCardNumber}>
                  <input type="hidden" name="employee_id" value={e.id} />
                  <Field label="Número do cartão">
                    <Input name="vt_card_number" defaultValue={e.vt_card_number ?? ""} inputMode="numeric" />
                  </Field>
                </FormDialog>
              </div>
            )}
            <div className="border-t border-line px-5 py-3">
              <Trace {...await traceOf(e)} />
            </div>
          </Panel>

          {waits.length > 0 && (
            <Panel>
              <PanelHeader title="Fila de espera" />
              <ul className="divide-y divide-line">
                {waits.map((w) => {
                  const o = describeOption(cat, { vt_fare_id: null, charter_schedule_id: w.charter_schedule_id });
                  return (
                    <li key={w.id} className="px-5 py-3 text-[13px]">
                      <p className="font-medium">
                        {o.title} · {o.detail}
                      </p>
                      <p className="text-xs text-ink-faint">
                        Pedido em {fmtDateTime(w.requested_at)} ·{" "}
                        {w.status === "AGUARDANDO" ? "aguardando vaga" : w.status === "APROVADO" ? "aprovado" : "cancelado"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          {isAdmin && (
            <Panel>
              <PanelHeader title="Trilha de auditoria" description="Toda alteração neste colaborador, nos benefícios e nas movimentações." />
              {audit.length === 0 ? (
                <EmptyState title="Sem registros." />
              ) : (
                <ol className="flex flex-col gap-3 px-5 py-4">
                  {audit.map((a) => (
                    <li key={a.id} className="relative border-l border-line pl-4 text-[13px]">
                      <span className="absolute -left-[3.5px] top-1.5 size-1.5 rounded-full bg-petrol-500" />
                      <p>
                        <span className="font-medium">{a.username}</span>{" "}
                        <span className="text-ink-soft">
                          {(actionLabel[a.action] ?? a.action).toLowerCase()} · {tableLabel[a.table_name ?? ""] ?? a.table_name}
                        </span>
                      </p>
                      {a.changed && a.changed.length > 0 && <p className="text-xs text-ink-faint">Campos: {a.changed.join(", ")}</p>}
                      <p className="text-xs text-ink-faint">{fmtDateTime(a.occurred_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function BenefitCard({ title, b, cat, emptyText = "Sem benefício." }: { title: string; b?: EmployeeBenefit; cat: Awaited<ReturnType<typeof getCatalog>>; emptyText?: string }) {
  if (!b) {
    return (
      <div className="rounded-md border border-dashed border-line px-4 py-3">
        <p className="text-xs text-ink-faint">{title}</p>
        <p className="mt-1 text-sm text-ink-soft">{emptyText}</p>
      </div>
    );
  }
  const o = describeOption(cat, b);
  return (
    <div className="rounded-md border border-line px-4 py-3">
      <p className="text-xs text-ink-faint">{title}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <CategoryBadge code={b.category_code} />
        <span className="text-xs text-ink-faint">{o.operator}</span>
      </div>
      <p className="mt-2 text-[15px] font-medium">{o.title}</p>
      <p className="text-[13px] text-ink-soft">{o.detail}</p>
      <p className="mt-2 text-xs text-ink-faint">
        {b.start_date > todayBR() ? "Começa em" : "Desde"} {fmtDate(b.start_date)}
        {b.end_date && ` · até ${fmtDate(b.end_date)}`}
      </p>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const fieldLabel: Record<string, string> = {
  registration: "Chapa",
  full_name: "Nome",
  birth_date: "Nascimento",
  admission_date: "Admissão",
  mother_name: "Nome da mãe",
  address: "Endereço",
  business_unit_id: "Unidade",
  legal_entity_id: "Razão social",
  section_id: "Seção",
  vt_card_number: "Cartão VT",
};

function ChangesList({ changes }: { changes: Record<string, unknown> }) {
  const entries = Object.entries(changes).filter(([k]) => k in fieldLabel);
  if (!entries.length) return null;
  return (
    <ul className="mt-1 text-xs text-ink-soft">
      {entries.map(([k, v]) => {
        const c = v as { de: unknown; para: unknown };
        const isId = k.endsWith("_id");
        return (
          <li key={k}>
            {fieldLabel[k]}: {isId ? "alterado" : `${String(c.de ?? "—")} → ${String(c.para ?? "—")}`}
          </li>
        );
      })}
    </ul>
  );
}
