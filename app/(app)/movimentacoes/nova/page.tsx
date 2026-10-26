import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOrg, getCatalog, getAvailability, getCurrentWindow } from "@/lib/data";
import { buildPickerData } from "@/lib/picker";
import { todayBR } from "@/lib/format";
import { PageHeader, Button } from "@/components/ui/primitives";
import { InclusionForm } from "./inclusion-form";

export default async function NovaInclusaoPage({ searchParams }: { searchParams: Promise<{ colaborador?: string; tipo?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayBR();
  const [org, cat, avail, win] = await Promise.all([getOrg(), getCatalog(), getAvailability(), getCurrentWindow()]);

  // colaboradores sem benefício aberto (para inclusão mensal / complementar de quem já existe)
  let q = supabase
    .from("employees")
    .select("id, full_name, registration, business_unit_id, employee_benefits(id, end_date, canceled)")
    .order("full_name")
    .limit(2000);
  if (user.role !== "ADMIN" && user.business_unit_id) q = q.eq("business_unit_id", user.business_unit_id);
  const { data: emps } = await q;
  const withoutBenefit = (emps ?? [])
    .filter((e: { employee_benefits: { end_date: string | null; canceled: boolean }[] }) =>
      !e.employee_benefits.some((b) => !b.canceled && (b.end_date === null || b.end_date >= today)),
    )
    .map((e: { id: string; full_name: string; registration: string }) => ({ id: e.id, label: `${e.full_name} · ${e.registration}` }));

  const units = user.role === "ADMIN" ? org.units.filter((u) => u.active) : org.units.filter((u) => u.id === user.business_unit_id);
  const vt = cat.categories.find((c) => c.code === "VT");

  return (
    <>
      <PageHeader
        title="Nova inclusão"
        description="Admissão, inclusão na compra mensal ou pedido complementar. Para trocar o benefício de quem já tem, abra o colaborador."
        back={
          <Button asChild variant="link" size="sm">
            <Link href="/movimentacoes">Movimentações</Link>
          </Button>
        }
      />
      <InclusionForm
        initialType={(sp.tipo as "INCLUSAO_ADMISSIONAL" | "INCLUSAO_MENSAL" | "PEDIDO_COMPLEMENTAR") ?? (sp.colaborador ? "INCLUSAO_MENSAL" : "INCLUSAO_ADMISSIONAL")}
        initialEmployee={sp.colaborador ?? ""}
        window={win ? { reference: win.reference_month, close: win.window_close } : null}
        units={units.map((u) => ({ id: u.id, name: u.name }))}
        entities={org.entities.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name, unit: e.business_unit_id }))}
        sections={org.sections.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, entity: s.legal_entity_id }))}
        employees={withoutBenefit}
        picker={buildPickerData(cat, avail)}
        passesPerMonth={(vt?.base_days ?? 26) * (vt?.passes_per_day ?? 2)}
        today={today}
      />
    </>
  );
}
