import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { buildWorkbook, type SheetSpec } from "@/lib/xlsx";
import { buildRateio } from "@/lib/purchase-engine";
import { monthBounds } from "@/lib/calc";
import { purchaseKindLabel, movementTypeLabel } from "@/lib/format";
import type { Purchase, PurchaseItem, Movement, EmployeeBenefit } from "@/lib/types";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN") return NextResponse.json({ error: "Somente o administrador exporta compras." }, { status: 403 });
  const { id } = await params;
  const tipo = request.nextUrl.searchParams.get("tipo") ?? "rateio";
  const supabase = await createClient();

  const { data: pData } = await supabase.from("purchases").select("*").eq("id", id).maybeSingle();
  if (!pData) return NextResponse.json({ error: "Compra não encontrada." }, { status: 404 });
  const p = pData as Purchase;
  if (p.status === "ABERTA") return NextResponse.json({ error: "Feche a compra antes de exportar." }, { status: 409 });

  const { data: itData } = await supabase.from("purchase_items").select("*").eq("purchase_id", id).order("employee_name");
  const items = (itData ?? []) as PurchaseItem[];
  const label = `${purchaseKindLabel[p.kind]} ${p.reference_month.slice(0, 7)}`;
  let sheets: SheetSpec[] = [];
  let fileName = "";

  if (tipo === "vt") {
    const vt = items.filter((i) => i.category_code === "VT");
    const empIds = [...new Set(vt.map((i) => i.employee_id).filter(Boolean))] as string[];
    const { data: emps } = empIds.length
      ? await supabase.from("employees").select("id, birth_date, mother_name, address").in("id", empIds)
      : { data: [] };
    const extra = new Map((emps ?? []).map((e: { id: string; birth_date: string; mother_name: string; address: string }) => [e.id, e]));
    const byOp = groupBy(vt, (i) => i.operator_name ?? "Sem operadora");
    sheets = [...byOp.entries()].map(([op, list]) => ({
      name: op,
      columns: [
        { header: "Chapa", key: "registration", type: "text", width: 12 },
        { header: "Nome", key: "employee_name", width: 34 },
        { header: "Nascimento", key: "birth_date", type: "date", width: 13 },
        { header: "Nome da mãe", key: "mother_name", width: 30 },
        { header: "Endereço", key: "address", width: 36 },
        { header: "Nº do cartão", key: "vt_card_number", type: "text", width: 16 },
        { header: "Linha / destino", key: "description", width: 38 },
        { header: "Dias", key: "days", type: "int", width: 8 },
        { header: "Passagens", key: "quantity", type: "int", width: 11 },
        { header: "Tarifa", key: "unit_value", type: "money", width: 11 },
        { header: "Total", key: "total", type: "money", width: 13 },
        { header: "Razão social", key: "legal_entity_name", width: 20 },
        { header: "Observação", key: "notes", width: 36 },
      ],
      rows: list.map((i) => ({ ...i, ...(i.employee_id ? extra.get(i.employee_id) : {}) })),
      totals: ["quantity", "total"],
    }));
    fileName = `Compra VT - ${label}.xlsx`;
  } else if (tipo === "fretado") {
    const fr = items.filter((i) => i.category_code === "FRETADO" && i.employee_id);
    const benIds = fr.map((i) => i.benefit_id).filter(Boolean) as string[];
    const { data: bens } = benIds.length ? await supabase.from("employee_benefits").select("id, start_date").in("id", benIds) : { data: [] };
    const start = new Map((bens ?? []).map((b: { id: string; start_date: string }) => [b.id, b.start_date]));
    const { first, last } = monthBounds(p.reference_month);
    const byOp = groupBy(fr, (i) => i.operator_name ?? "Sem operadora");
    sheets = [...byOp.entries()].map(([op, list]) => ({
      name: op,
      columns: [
        { header: "Rota e horário", key: "description", width: 40 },
        { header: "Situação", key: "situacao", width: 14 },
        { header: "Chapa", key: "registration", type: "text", width: 12 },
        { header: "Nome", key: "employee_name", width: 34 },
        { header: "Unidade", key: "business_unit_name", width: 14 },
        { header: "Razão social", key: "legal_entity_name", width: 20 },
        { header: "Seção", key: "section_name", width: 20 },
        { header: "Valor", key: "total", type: "money", width: 13 },
      ],
      rows: list
        .map((i) => {
          const s = i.benefit_id ? start.get(i.benefit_id) : undefined;
          const situacao = i.item_kind === "ACERTO" ? "Acerto" : s && s >= first && s <= last ? "Inclusão" : p.kind === "MENSAL" ? "Mantido" : "Inclusão";
          return { ...i, situacao };
        })
        .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? "") || (a.employee_name ?? "").localeCompare(b.employee_name ?? "")),
      totals: ["total"],
    }));

    // exclusões e saídas do fretado processadas nesta compra
    const { data: movs } = await supabase.from("movements").select("*, employees(full_name, registration)").eq("purchase_id", id);
    const prevIds = ((movs ?? []) as Movement[]).map((m) => m.previous_benefit_id ?? (m.type === "EXCLUSAO_MENSAL" ? m.benefit_id : null)).filter(Boolean) as string[];
    const { data: prevB } = prevIds.length ? await supabase.from("employee_benefits").select("*").in("id", prevIds) : { data: [] };
    const prevMap = new Map(((prevB ?? []) as EmployeeBenefit[]).map((b) => [b.id, b]));
    const { data: sched } = await supabase.from("charter_schedules").select("id, arrival_time, departure_time, charter_routes(name)");
    const schedName = new Map(
      (sched ?? []).map((s: { id: string; arrival_time: string; departure_time: string; charter_routes: { name: string } | { name: string }[] | null }) => {
        const r = Array.isArray(s.charter_routes) ? s.charter_routes[0] : s.charter_routes;
        return [s.id, `${r?.name ?? ""} · ${s.arrival_time} / ${s.departure_time}`];
      }),
    );
    const exits = ((movs ?? []) as (Movement & { employees: { full_name: string; registration: string } })[])
      .map((m) => {
        const b = prevMap.get(m.type === "EXCLUSAO_MENSAL" ? m.benefit_id ?? "" : m.previous_benefit_id ?? "");
        if (!b?.charter_schedule_id) return null;
        return {
          description: schedName.get(b.charter_schedule_id) ?? "",
          registration: m.employees.registration,
          employee_name: m.employees.full_name,
          motivo: movementTypeLabel[m.type],
          ate: b.end_date,
        };
      })
      .filter(Boolean) as Record<string, unknown>[];
    sheets.push({
      name: "Exclusões",
      columns: [
        { header: "Rota e horário", key: "description", width: 40 },
        { header: "Chapa", key: "registration", type: "text", width: 12 },
        { header: "Nome", key: "employee_name", width: 34 },
        { header: "Motivo", key: "motivo", width: 26 },
        { header: "Último dia", key: "ate", type: "date", width: 13 },
      ],
      rows: exits,
    });
    fileName = `Fretado - ${label}.xlsx`;
  } else if (tipo === "folha") {
    const { data: movs } = await supabase.from("movements").select("*, employees(full_name, registration, legal_entity_id)").eq("purchase_id", id);
    const list = (movs ?? []) as (Movement & { employees: { full_name: string; registration: string; legal_entity_id: string } })[];
    const benIds = list.flatMap((m) => [m.benefit_id, m.previous_benefit_id]).filter(Boolean) as string[];
    const { data: bens } = benIds.length ? await supabase.from("employee_benefits").select("*").in("id", benIds) : { data: [] };
    const bmap = new Map(((bens ?? []) as EmployeeBenefit[]).map((b) => [b.id, b]));
    const { data: ents } = await supabase.from("legal_entities").select("id, name");
    const ent = new Map((ents ?? []).map((e: { id: string; name: string }) => [e.id, e.name]));
    const catName = (c?: string | null) => (c === "VT" ? "Vale-transporte" : c === "FRETADO" ? "Fretado" : c ?? "");
    const rows: Record<string, unknown>[] = [];
    for (const m of list) {
      const base = { registration: m.employees.registration, employee_name: m.employees.full_name, legal_entity: ent.get(m.employees.legal_entity_id) ?? "" };
      if (["INCLUSAO_ADMISSIONAL", "INCLUSAO_MENSAL", "PEDIDO_COMPLEMENTAR"].includes(m.type)) {
        rows.push({ ...base, movimento: "Entrada", categoria: catName(m.category_code), desde: m.effective_date });
      } else if (m.type === "EXCLUSAO_MENSAL") {
        const b = m.benefit_id ? bmap.get(m.benefit_id) : undefined;
        rows.push({ ...base, movimento: "Saída", categoria: catName(b?.category_code ?? m.category_code), desde: m.effective_date });
      } else if (m.type === "MOVIMENTACAO_CATEGORIA") {
        const prev = m.previous_benefit_id ? bmap.get(m.previous_benefit_id) : undefined;
        if (prev && prev.category_code !== m.category_code) {
          rows.push({ ...base, movimento: "Saída", categoria: catName(prev.category_code), desde: m.effective_date });
          rows.push({ ...base, movimento: "Entrada", categoria: catName(m.category_code), desde: m.effective_date });
        }
      }
    }
    sheets = [
      {
        name: "Folha",
        columns: [
          { header: "Chapa", key: "registration", type: "text", width: 12 },
          { header: "Nome", key: "employee_name", width: 34 },
          { header: "Razão social", key: "legal_entity", width: 22 },
          { header: "Benefício", key: "categoria", width: 18 },
          { header: "Movimento", key: "movimento", width: 12 },
          { header: "A partir de", key: "desde", type: "date", width: 13 },
        ],
        rows,
      },
    ];
    fileName = `Folha - ${label}.xlsx`;
  } else {
    const rateio = buildRateio(items);
    sheets = [
      {
        name: "Resumo",
        columns: [
          { header: "Unidade", key: "unit", width: 16 },
          { header: "Razão social", key: "entity", width: 24 },
          { header: "Seção", key: "section", width: 26 },
          { header: "VT", key: "vt", type: "money", width: 14 },
          { header: "Fretado", key: "fretado", type: "money", width: 14 },
          { header: "Total", key: "total", type: "money", width: 14 },
        ],
        rows: rateio,
        totals: ["vt", "fretado", "total"],
      },
      {
        name: "Detalhe",
        columns: [
          { header: "Unidade", key: "business_unit_name", width: 14 },
          { header: "Razão social", key: "legal_entity_name", width: 22 },
          { header: "Seção", key: "section_name", width: 22 },
          { header: "Chapa", key: "registration", type: "text", width: 12 },
          { header: "Nome", key: "employee_name", width: 32 },
          { header: "Benefício", key: "category_code", width: 11 },
          { header: "Operadora", key: "operator_name", width: 22 },
          { header: "Contrato", key: "contract_name", width: 22 },
          { header: "Descrição", key: "description", width: 36 },
          { header: "Tipo", key: "item_kind", width: 13 },
          { header: "Valor", key: "total", type: "money", width: 13 },
          { header: "Observação", key: "notes", width: 36 },
        ],
        rows: items as unknown as Record<string, unknown>[],
        totals: ["total"],
      },
    ];
    fileName = `Rateio - ${label}.xlsx`;
  }

  const buffer = await buildWorkbook(sheets, { title: fileName, by: me.username });
  await supabase.rpc("log_event", { p_action: "EXPORTACAO", p_details: { compra: id, tipo, arquivo: fileName } });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

function groupBy<T>(list: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  list.forEach((x) => m.set(key(x), [...(m.get(key(x)) ?? []), x]));
  return m;
}
