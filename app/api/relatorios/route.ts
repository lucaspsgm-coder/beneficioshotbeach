import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getCatalog, getOrg, getAvailability, describeOption } from "@/lib/data";
import { buildWorkbook, type SheetSpec } from "@/lib/xlsx";
import { todayBR } from "@/lib/format";
import type { EmployeeBenefit, Employee } from "@/lib/types";

export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN") return NextResponse.json({ error: "Somente o administrador." }, { status: 403 });
  const tipo = request.nextUrl.searchParams.get("tipo") ?? "base";
  const supabase = await createClient();
  const today = todayBR();
  const [cat, org] = await Promise.all([getCatalog(), getOrg()]);
  let sheet: SheetSpec;
  let fileName: string;

  if (tipo === "ocupacao") {
    const avail = await getAvailability();
    sheet = {
      name: "Ocupação",
      columns: [
        { header: "Operadora", key: "op", width: 22 },
        { header: "Contrato", key: "contract", width: 24 },
        { header: "Rota", key: "route", width: 28 },
        { header: "Horário", key: "time", width: 16 },
        { header: "Assentos", key: "seats", type: "int", width: 10 },
        { header: "Ocupados", key: "taken", type: "int", width: 10 },
        { header: "Livres", key: "free", type: "int", width: 10 },
      ],
      rows: cat.schedules.map((s) => {
        const r = cat.routes.find((x) => x.id === s.route_id);
        const c = cat.contracts.find((x) => x.id === r?.contract_id);
        const a = avail.get(s.id) ?? { seats: s.seats, taken: 0 };
        return {
          op: cat.operators.find((o) => o.id === c?.operator_id)?.name,
          contract: c?.name,
          route: r?.name,
          time: `${s.arrival_time} / ${s.departure_time}`,
          seats: a.seats ?? "",
          taken: a.taken,
          free: a.seats === null ? "" : a.seats - a.taken,
        };
      }),
      totals: ["taken"],
    };
    fileName = `Ocupação do fretado ${today}.xlsx`;
  } else {
    const { data } = await supabase
      .from("employee_benefits")
      .select("*, employees(*)")
      .eq("canceled", false)
      .lte("start_date", today)
      .or(`end_date.is.null,end_date.gte.${today}`);
    const rows = ((data ?? []) as (EmployeeBenefit & { employees: Employee })[]).map((b) => {
      const o = describeOption(cat, b);
      const e = b.employees;
      return {
        registration: e.registration,
        name: e.full_name,
        unit: org.units.find((u) => u.id === e.business_unit_id)?.name,
        entity: org.entities.find((u) => u.id === e.legal_entity_id)?.name,
        section: org.sections.find((u) => u.id === e.section_id)?.name,
        category: o.category,
        option: `${o.title} ${o.detail}`,
        operator: o.operator,
        since: b.start_date,
        card: e.vt_card_number,
      };
    });
    sheet = {
      name: "Base ativa",
      columns: [
        { header: "Chapa", key: "registration", type: "text", width: 12 },
        { header: "Nome", key: "name", width: 34 },
        { header: "Unidade", key: "unit", width: 14 },
        { header: "Razão social", key: "entity", width: 22 },
        { header: "Seção", key: "section", width: 22 },
        { header: "Benefício", key: "category", width: 16 },
        { header: "Opção", key: "option", width: 38 },
        { header: "Operadora", key: "operator", width: 22 },
        { header: "Desde", key: "since", type: "date", width: 12 },
        { header: "Cartão VT", key: "card", type: "text", width: 16 },
      ],
      rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
    };
    fileName = `Base ativa ${today}.xlsx`;
  }

  const buffer = await buildWorkbook([sheet], { title: fileName, by: me.username });
  await supabase.rpc("log_event", { p_action: "EXPORTACAO", p_details: { relatorio: tipo, arquivo: fileName } });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
