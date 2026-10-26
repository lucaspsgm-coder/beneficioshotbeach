import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWindow, getUserDirectory } from "@/lib/data";
import { fmtDate, fmtMonth, fmtDateTime, todayBR, movementTypeLabel, tableLabel, actionLabel } from "@/lib/format";
import { Panel, PanelHeader, Table, Th, Td, Tr, EmptyState, Button, PageHeader } from "@/components/ui/primitives";
import { MovementStatusBadge } from "@/components/status";
import type { Movement, CalendarMonth, AuditRow } from "@/lib/types";

export default async function Home() {
  const user = await requireUser();
  const supabase = await createClient();
  const today = todayBR();
  const isAdmin = user.role === "ADMIN";

  const [win, next, active, awaiting, queue, recent, dir] = await Promise.all([
    getCurrentWindow(),
    supabase.from("calendar_months").select("*").gt("window_open", today).order("window_open").limit(1).maybeSingle(),
    supabase
      .from("employee_benefits")
      .select("category_code")
      .eq("canceled", false)
      .lte("start_date", today)
      .or(`end_date.is.null,end_date.gte.${today}`),
    supabase.from("movements").select("id", { count: "exact", head: true }).in("status", ["AGUARDANDO_APROVACAO"]),
    supabase.from("waitlist").select("id", { count: "exact", head: true }).eq("status", "AGUARDANDO"),
    supabase
      .from("movements")
      .select("id, employee_id, type, status, created_at, created_by, employees(full_name, registration)")
      .order("created_at", { ascending: false })
      .limit(8),
    getUserDirectory(),
  ]);

  const counts = { VT: 0, FRETADO: 0 } as Record<string, number>;
  (active.data ?? []).forEach((b: { category_code: string }) => (counts[b.category_code] = (counts[b.category_code] ?? 0) + 1));

  let noCard = 0;
  let openPurchases = 0;
  let activity: AuditRow[] = [];
  if (isAdmin) {
    const [nc, op, au] = await Promise.all([
      supabase
        .from("employee_benefits")
        .select("employee_id, employees!inner(vt_card_number)", { count: "exact", head: true })
        .eq("category_code", "VT")
        .eq("canceled", false)
        .is("end_date", null)
        .is("employees.vt_card_number", null),
      supabase.from("purchases").select("id", { count: "exact", head: true }).eq("status", "ABERTA"),
      supabase.from("audit_log").select("*").order("occurred_at", { ascending: false }).limit(8),
    ]);
    noCard = nc.count ?? 0;
    openPurchases = op.count ?? 0;
    activity = (au.data ?? []) as AuditRow[];
  }

  const nextWin = next.data as CalendarMonth | null;

  return (
    <>
      <PageHeader
        title={isAdmin ? "Visão geral" : `RH ${user.unit_name ?? ""}`}
        description={isAdmin ? "Todas as unidades." : "Colaboradores e movimentações da sua unidade."}
        actions={
          <Button asChild>
            <Link href="/movimentacoes/nova">Nova inclusão</Link>
          </Button>
        }
      />

      <WindowBanner win={win} next={nextWin} />

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <Stat label="Usam vale-transporte" value={counts.VT ?? 0} href="/colaboradores?categoria=VT" />
        <Stat label="Usam fretado" value={counts.FRETADO ?? 0} href="/colaboradores?categoria=FRETADO" />
        <Stat
          label="Aguardando aprovação"
          value={awaiting.count ?? 0}
          href={isAdmin ? "/aprovacoes" : "/movimentacoes?status=AGUARDANDO_APROVACAO"}
          attention={(awaiting.count ?? 0) > 0}
        />
        <Stat label="Na fila de espera" value={queue.count ?? 0} href="/fila" />
        {isAdmin && (
          <>
            <Stat label="Compras abertas" value={openPurchases} href="/compras" />
            <Stat label="VT sem número de cartão" value={noCard} href="/relatorios" attention={noCard > 0} />
          </>
        )}
      </dl>

      <div className={isAdmin ? "mt-8 grid gap-6 xl:grid-cols-2" : "mt-8"}>
        <Panel>
          <PanelHeader
            title="Últimas movimentações"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/movimentacoes">Ver todas</Link>
              </Button>
            }
          />
          {(recent.data ?? []).length === 0 ? (
            <EmptyState title="Nenhuma movimentação ainda.">Comece por uma inclusão admissional ou mensal.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Colaborador</Th>
                  <Th>Tipo</Th>
                  <Th>Situação</Th>
                </tr>
              </thead>
              <tbody>
                {(recent.data as unknown as (Movement & { employees: { full_name: string; registration: string } })[]).map((m) => (
                  <Tr key={m.id}>
                    <Td>
                      <Link href={`/colaboradores/${m.employee_id ?? ""}`} className="font-medium hover:text-petrol-600">
                        {m.employees?.full_name}
                      </Link>
                      <p className="text-xs text-ink-faint">
                        {m.created_by ? dir.get(m.created_by)?.username : "sistema"} em {fmtDateTime(m.created_at)}
                      </p>
                    </Td>
                    <Td className="text-ink-soft">{movementTypeLabel[m.type]}</Td>
                    <Td>
                      <MovementStatusBadge status={m.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        {isAdmin && (
          <Panel>
            <PanelHeader
              title="Atividade recente"
              description="Tudo o que foi feito no sistema, com usuário e horário."
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/auditoria">Abrir auditoria</Link>
                </Button>
              }
            />
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{a.username ?? "sistema"}</span>{" "}
                    <span className="text-ink-soft">
                      {(actionLabel[a.action] ?? a.action).toLowerCase()}
                      {a.table_name ? ` · ${tableLabel[a.table_name] ?? a.table_name}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">{fmtDateTime(a.occurred_at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, href, attention }: { label: string; value: number; href: string; attention?: boolean }) {
  return (
    <Link href={href} className="group bg-surface px-5 py-4 transition-colors hover:bg-petrol-50/50">
      <dt className="text-[13px] text-ink-soft">{label}</dt>
      <dd className={`mt-1 text-[28px] font-semibold tracking-[-0.02em] ${attention ? "text-petrol-600" : "text-ink"}`}>{value}</dd>
    </Link>
  );
}

function WindowBanner({ win, next }: { win: CalendarMonth | null; next: CalendarMonth | null }) {
  if (win) {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-petrol-100 bg-petrol-50 px-5 py-4 text-sm text-petrol-800">
        <span className="flex items-center gap-2 font-medium">
          <span className="size-2 rounded-full bg-petrol-600" />
          Janela mensal aberta até {fmtDate(win.window_close)}
        </span>
        <span>Compra de {fmtMonth(win.reference_month)}</span>
        <span>Corte em {fmtDate(win.cutoff_date)}</span>
        <span>Aprovação das trocas em {fmtDate(win.approval_date)}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-surface px-5 py-4 text-sm text-ink-soft">
      <span className="flex items-center gap-2 font-medium text-ink">
        <span className="size-2 rounded-full bg-ink-faint" />
        Janela mensal fechada
      </span>
      <span>
        {next
          ? `Próxima abertura em ${fmtDate(next.window_open)}, para a compra de ${fmtMonth(next.reference_month)}.`
          : "O administrador ainda não definiu a próxima janela no calendário."}
      </span>
      <span>Admissões, trocas e pedidos complementares continuam liberados.</span>
    </div>
  );
}
