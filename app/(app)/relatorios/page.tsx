import Link from "next/link";
import { Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, getAvailability, getOrg } from "@/lib/data";
import { todayBR } from "@/lib/format";
import { PageHeader, Panel, PanelHeader, Table, Th, Td, Tr, EmptyState, Button } from "@/components/ui/primitives";
import { SeatMeter } from "@/components/seat-mark";

export default async function RelatoriosPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = todayBR();
  const [cat, avail, org, wl, noCard] = await Promise.all([
    getCatalog(),
    getAvailability(),
    getOrg(),
    supabase.from("waitlist").select("charter_schedule_id").eq("status", "AGUARDANDO"),
    supabase
      .from("employee_benefits")
      .select("employee_id, employees!inner(id, full_name, registration, business_unit_id, vt_card_number)")
      .eq("category_code", "VT")
      .eq("canceled", false)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .is("employees.vt_card_number", null),
  ]);
  const queue = new Map<string, number>();
  (wl.data ?? []).forEach((w: { charter_schedule_id: string }) => queue.set(w.charter_schedule_id, (queue.get(w.charter_schedule_id) ?? 0) + 1));
  const missing = ((noCard.data ?? []) as unknown as { employees: { id: string; full_name: string; registration: string; business_unit_id: string } }[]).map((r) => r.employees);

  const rows = cat.schedules
    .filter((s) => s.active)
    .map((s) => {
      const r = cat.routes.find((x) => x.id === s.route_id);
      const c = cat.contracts.find((x) => x.id === r?.contract_id);
      const op = cat.operators.find((x) => x.id === c?.operator_id);
      const a = avail.get(s.id) ?? { seats: s.seats, taken: 0 };
      return { s, r, c, op, a, q: queue.get(s.id) ?? 0 };
    })
    .sort((x, y) => (x.op?.name ?? "").localeCompare(y.op?.name ?? "") || (x.r?.name ?? "").localeCompare(y.r?.name ?? ""));

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Arquivos da compra (VT, fretado, folha e rateio) ficam dentro de cada compra fechada."
        actions={
          <>
            <Button asChild variant="secondary">
              <a href="/api/relatorios?tipo=base">
                <Download />
                Base ativa hoje
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href="/api/relatorios?tipo=ocupacao">
                <Download />
                Ocupação do fretado
              </a>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHeader title="Ocupação do fretado" description="Assentos comprometidos a partir de hoje, incluindo trocas já aprovadas para o mês seguinte." />
          {rows.length === 0 ? (
            <EmptyState title="Nenhum horário de fretado cadastrado." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Operadora</Th>
                  <Th>Rota e horário</Th>
                  <Th>Assentos</Th>
                  <Th className="text-right">Na fila</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, r, op, a, q }) => (
                  <Tr key={s.id}>
                    <Td className="text-ink-soft">{op?.name}</Td>
                    <Td>
                      <p className="font-medium">{r?.name}</p>
                      <p className="text-xs text-ink-faint">
                        {s.arrival_time} / {s.departure_time}
                      </p>
                    </Td>
                    <Td className="min-w-[220px]">
                      <SeatMeter seats={a.seats} taken={a.taken} compact />
                    </Td>
                    <Td className="text-right">{q ? <Link href="/fila" className="font-medium text-petrol-600">{q}</Link> : "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel>
          <PanelHeader title={`VT sem número de cartão (${missing.length})`} description="A compra de VT não sai sem o número. Lance na página do colaborador." />
          {missing.length === 0 ? (
            <EmptyState title="Todos com cartão." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Colaborador</Th>
                  <Th>Unidade</Th>
                </tr>
              </thead>
              <tbody>
                {missing.map((e) => (
                  <Tr key={e.id}>
                    <Td>
                      <Link href={`/colaboradores/${e.id}`} className="font-medium hover:text-petrol-600">
                        {e.full_name}
                      </Link>
                      <p className="text-xs text-ink-faint">Chapa {e.registration}</p>
                    </Td>
                    <Td className="text-ink-soft">{org.units.find((u) => u.id === e.business_unit_id)?.name}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}
