import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, getOrg, type Catalog } from "@/lib/data";
import { addMonths, monthBounds, proportionalDays, shareContract } from "@/lib/calc";
import { fmtDate } from "@/lib/format";
import type { Employee, EmployeeBenefit, Purchase, PurchaseItem, Movement, CostModel } from "@/lib/types";

type BenefitRow = EmployeeBenefit & { employees: Employee };

export interface PurchaseComputation {
  items: PurchaseItem[];
  movementIds: string[];
  warnings: string[];
}

/**
 * Calcula os itens de uma compra (prévia ou fechamento).
 * MENSAL: quem está ativo no dia 1 do mês (VT: dias-base × passagens; fretado: por assento ou rateio do contrato)
 *         + acerto do fretado por assento para quem entrou no mês anterior e ainda não foi cobrado.
 * ADMISSIONAL / COMPLEMENTAR: inclusões do período, com proporcional.
 */
export async function computePurchase(p: Purchase): Promise<PurchaseComputation> {
  const supabase = await createClient();
  const [cat, org] = await Promise.all([getCatalog(), getOrg()]);
  const ctx = new Ctx(cat, org);
  const warnings: string[] = [];
  const items: PurchaseItem[] = [];
  let movementIds: string[] = [];

  if (p.kind === "MENSAL") {
    const { first } = monthBounds(p.reference_month);
    const prev = monthBounds(addMonths(p.reference_month, -1));

    const { data: bens } = await supabase
      .from("employee_benefits")
      .select("*, employees(*)")
      .eq("canceled", false)
      .lte("start_date", first)
      .or(`end_date.is.null,end_date.gte.${first}`);
    let active = ((bens ?? []) as BenefitRow[]).filter((b) => !b.end_date || b.end_date >= b.start_date);

    // admissões e pedidos complementares que começam no dia 1º são cobrados no próprio lote, não aqui
    const startsToday = active.filter((b) => b.start_date === first && b.origin_movement_id).map((b) => b.origin_movement_id!);
    if (startsToday.length) {
      const { data: origin } = await supabase.from("movements").select("id, type").in("id", startsToday);
      const ownLot = new Set(
        (origin ?? []).filter((m: { type: string }) => m.type === "INCLUSAO_ADMISSIONAL" || m.type === "PEDIDO_COMPLEMENTAR").map((m: { id: string }) => m.id),
      );
      active = active.filter((b) => !(b.start_date === first && b.origin_movement_id && ownLot.has(b.origin_movement_id)));
    }

    // VT
    for (const b of active.filter((x) => x.vt_fare_id)) {
      const base = ctx.category("VT");
      items.push(ctx.vtItem(b, base.base_days, "NORMAL", base.base_days * base.passes_per_day));
    }

    // Fretado: agrupa ocupantes por contrato
    const byContract = new Map<string, BenefitRow[]>();
    for (const b of active.filter((x) => x.charter_schedule_id)) {
      const c = ctx.contractOf(b.charter_schedule_id!);
      if (!c) {
        warnings.push(`${b.employees.full_name}: horário de fretado sem contrato ativo; não entrou na compra.`);
        continue;
      }
      byContract.set(c.id, [...(byContract.get(c.id) ?? []), b]);
    }
    for (const [contractId, occ] of byContract) {
      const c = cat.contracts.find((x) => x.id === contractId)!;
      if (c.cost_model === "POR_ASSENTO") {
        for (const b of occ) {
          const route = ctx.routeOf(b.charter_schedule_id!);
          if (route?.seat_price == null) warnings.push(`Rota ${route?.name ?? ""} sem valor de assento cadastrado.`);
          items.push(ctx.charterItem(b, Number(route?.seat_price ?? 0), "NORMAL"));
        }
      } else {
        const r = shareContract(
          c.cost_model,
          Number(c.monthly_value ?? 0),
          occ.map((b) => ({ key: b.id, unitId: b.employees.business_unit_id })),
          cat.subsidies
            .filter((s) => s.contract_id === c.id)
            .map((s) => ({ unitId: s.business_unit_id, type: s.subsidy_type, value: Number(s.value), joinsRateio: s.joins_rateio })),
        );
        for (const b of occ) items.push(ctx.charterItem(b, r.perOccupant.get(b.id) ?? 0, "NORMAL", `Rateio do contrato entre ${occ.length} assento(s) ocupado(s)`));
        for (const s of r.unallocatedSubsidies) items.push(ctx.subsidyItem(c.id, s.unitId, s.amount));
        if (r.unallocatedRemainder > 0) {
          warnings.push(`Contrato ${c.name}: ${r.unallocatedRemainder.toFixed(2)} sem ocupantes para dividir (todas as unidades estão fora do rateio).`);
        }
      }
    }
    // contratos fechados sem nenhum ocupante continuam custando
    for (const c of cat.contracts.filter((x) => x.active && x.cost_model !== "POR_ASSENTO" && !byContract.has(x.id))) {
      warnings.push(`Contrato ${c.name} não tem ocupantes no dia 1º: o valor de ${Number(c.monthly_value ?? 0).toFixed(2)} não foi distribuído.`);
    }

    // Acerto: entrou no mês anterior e ainda não foi cobrado
    const { data: late } = await supabase
      .from("employee_benefits")
      .select("*, employees(*)")
      .eq("canceled", false)
      .gte("start_date", prev.first)
      .lte("start_date", prev.last);
    const lateRows = ((late ?? []) as BenefitRow[]).filter((b) => !b.end_date || b.end_date >= b.start_date);
    if (lateRows.length) {
      const { data: billed } = await supabase.from("purchase_items").select("benefit_id").in("benefit_id", lateRows.map((b) => b.id));
      const billedSet = new Set((billed ?? []).map((x: { benefit_id: string }) => x.benefit_id));
      for (const b of lateRows.filter((x) => !billedSet.has(x.id))) {
        if (b.charter_schedule_id) {
          const c = ctx.contractOf(b.charter_schedule_id);
          if (c?.cost_model !== "POR_ASSENTO") continue; // contrato fechado: só conta a partir do mês seguinte
          const route = ctx.routeOf(b.charter_schedule_id)!;
          const op = cat.operators.find((o) => o.id === c.operator_id);
          const base = ctx.category("FRETADO").base_days;
          if (op?.entry_billing === "PROPORCIONAL") {
            const days = proportionalDays(b.start_date, base);
            items.push(ctx.charterItem(b, (Number(route.seat_price ?? 0) * days) / base, "ACERTO", `Acerto proporcional: entrou em ${fmtDate(b.start_date)} (${days} dias)`, days));
          } else {
            items.push(ctx.charterItem(b, Number(route.seat_price ?? 0), "ACERTO", `Acerto do mês cheio: entrou em ${fmtDate(b.start_date)}`));
          }
        } else {
          warnings.push(`${b.employees.full_name} começou o VT em ${fmtDate(b.start_date)} e não está em nenhuma compra. Confira o lote admissional ou complementar.`);
        }
      }
    }

    const { data: movs } = await supabase
      .from("movements")
      .select("id, type, status")
      // inclui pendências de meses anteriores que ficaram sem compra (ex.: aprovadas depois de um fechamento)
      .lte("effective_date", p.reference_month)
      .is("purchase_id", null)
      .or("and(status.eq.PENDENTE,type.in.(INCLUSAO_MENSAL,EXCLUSAO_MENSAL)),and(status.eq.APROVADO,type.eq.MOVIMENTACAO_CATEGORIA)");
    movementIds = (movs ?? []).map((m: { id: string }) => m.id);
  } else {
    const type = p.kind === "ADMISSIONAL" ? "INCLUSAO_ADMISSIONAL" : "PEDIDO_COMPLEMENTAR";
    const status = p.kind === "ADMISSIONAL" ? "PENDENTE" : "APROVADO";
    const { data: movs } = await supabase
      .from("movements")
      .select("*")
      .eq("type", type)
      .eq("status", status)
      .is("purchase_id", null)
      .gte("effective_date", p.period_start!)
      .lte("effective_date", p.period_end!);
    const list = (movs ?? []) as Movement[];
    movementIds = list.map((m) => m.id);
    const benefitIds = list.map((m) => m.benefit_id).filter(Boolean) as string[];
    const { data: bens } = benefitIds.length ? await supabase.from("employee_benefits").select("*, employees(*)").in("id", benefitIds) : { data: [] };
    const byId = new Map(((bens ?? []) as BenefitRow[]).map((b) => [b.id, b]));

    for (const m of list) {
      const b = m.benefit_id ? byId.get(m.benefit_id) : undefined;
      if (!b || b.canceled) continue;
      if (b.vt_fare_id) {
        const vt = ctx.category("VT");
        const days = vt.admission_proportional ? proportionalDays(b.start_date, vt.base_days) : vt.base_days;
        items.push(ctx.vtItem(b, days, days < vt.base_days ? "PROPORCIONAL" : "NORMAL", days * vt.passes_per_day, m.id));
      } else if (b.charter_schedule_id) {
        const c = ctx.contractOf(b.charter_schedule_id);
        const route = ctx.routeOf(b.charter_schedule_id);
        if (!c || !route) continue;
        if (c.cost_model !== "POR_ASSENTO") {
          items.push(ctx.charterItem(b, 0, "NORMAL", "Contrato fechado: entra no rateio a partir do mês seguinte", null, m.id));
          continue;
        }
        const op = cat.operators.find((o) => o.id === c.operator_id);
        const base = ctx.category("FRETADO").base_days;
        if (op?.entry_billing === "PROPORCIONAL") {
          const days = proportionalDays(b.start_date, base);
          items.push(ctx.charterItem(b, (Number(route.seat_price ?? 0) * days) / base, "PROPORCIONAL", `${days} dia(s) no mês`, days, m.id));
        } else {
          items.push(ctx.charterItem(b, Number(route.seat_price ?? 0), "NORMAL", "Mês cheio", null, m.id));
        }
      }
    }
  }

  const noCard = items.filter((i) => i.category_code === "VT" && !i.vt_card_number).length;
  if (noCard) warnings.unshift(`${noCard} colaborador(es) de VT sem número de cartão.`);
  return { items, movementIds, warnings };
}

class Ctx {
  constructor(
    private cat: Catalog,
    private org: Awaited<ReturnType<typeof getOrg>>,
  ) {}

  category(code: string) {
    const c = this.cat.categories.find((x) => x.code === code);
    return c ?? { base_days: 26, passes_per_day: code === "VT" ? 2 : 0, admission_proportional: true };
  }
  routeOf(scheduleId: string) {
    const s = this.cat.schedules.find((x) => x.id === scheduleId);
    return this.cat.routes.find((r) => r.id === s?.route_id);
  }
  contractOf(scheduleId: string) {
    const r = this.routeOf(scheduleId);
    return this.cat.contracts.find((c) => c.id === r?.contract_id);
  }

  private base(b: BenefitRow, movementId?: string | null): Omit<PurchaseItem, "item_kind" | "category_code" | "operator_id" | "operator_name" | "contract_id" | "contract_name" | "cost_model" | "description" | "days" | "quantity" | "unit_value" | "total" | "notes"> {
    const e = b.employees;
    return {
      employee_id: e.id,
      benefit_id: b.id,
      movement_id: movementId ?? b.origin_movement_id ?? null,
      registration: e.registration,
      employee_name: e.full_name,
      vt_card_number: e.vt_card_number,
      business_unit_id: e.business_unit_id,
      business_unit_name: this.org.units.find((u) => u.id === e.business_unit_id)?.name ?? null,
      legal_entity_id: e.legal_entity_id,
      legal_entity_name: this.org.entities.find((u) => u.id === e.legal_entity_id)?.name ?? null,
      section_id: e.section_id,
      section_name: this.org.sections.find((u) => u.id === e.section_id)?.name ?? null,
    };
  }

  vtItem(b: BenefitRow, days: number, kind: PurchaseItem["item_kind"], quantity: number, movementId?: string | null): PurchaseItem {
    const f = this.cat.fares.find((x) => x.id === b.vt_fare_id)!;
    const op = this.cat.operators.find((o) => o.id === f?.operator_id);
    const fare = Number(f?.fare ?? 0);
    return {
      ...this.base(b, movementId),
      item_kind: kind,
      category_code: "VT",
      operator_id: op?.id ?? null,
      operator_name: op?.name ?? null,
      contract_id: null,
      contract_name: null,
      cost_model: null,
      description: f ? `${f.line_name} · ${f.origin} → ${f.destination}` : "Destino removido",
      days,
      quantity,
      unit_value: fare,
      total: round2(fare * quantity),
      notes: kind === "PROPORCIONAL" ? `Proporcional: ${days} dia(s) a partir de ${fmtDate(b.start_date)}` : null,
    };
  }

  charterItem(b: BenefitRow, total: number, kind: PurchaseItem["item_kind"], notes?: string | null, days?: number | null, movementId?: string | null): PurchaseItem {
    const s = this.cat.schedules.find((x) => x.id === b.charter_schedule_id);
    const r = this.routeOf(b.charter_schedule_id!);
    const c = this.contractOf(b.charter_schedule_id!);
    const op = this.cat.operators.find((o) => o.id === c?.operator_id);
    return {
      ...this.base(b, movementId),
      item_kind: kind,
      category_code: "FRETADO",
      operator_id: op?.id ?? null,
      operator_name: op?.name ?? null,
      contract_id: c?.id ?? null,
      contract_name: c?.name ?? null,
      cost_model: (c?.cost_model ?? null) as CostModel | null,
      description: `${r?.name ?? "Rota"} · ${s ? `${s.arrival_time} / ${s.departure_time}` : ""}`,
      days: days ?? null,
      quantity: 1,
      unit_value: round2(total),
      total: round2(total),
      notes: notes ?? null,
    };
  }

  subsidyItem(contractId: string, unitId: string, amount: number): PurchaseItem {
    const c = this.cat.contracts.find((x) => x.id === contractId);
    const op = this.cat.operators.find((o) => o.id === c?.operator_id);
    return {
      item_kind: "SUBSIDIO",
      category_code: "FRETADO",
      employee_id: null,
      benefit_id: null,
      movement_id: null,
      registration: null,
      employee_name: null,
      vt_card_number: null,
      business_unit_id: unitId,
      business_unit_name: this.org.units.find((u) => u.id === unitId)?.name ?? null,
      legal_entity_id: null,
      legal_entity_name: null,
      section_id: null,
      section_name: null,
      operator_id: op?.id ?? null,
      operator_name: op?.name ?? null,
      contract_id: contractId,
      contract_name: c?.name ?? null,
      cost_model: c?.cost_model ?? null,
      description: "Subsídio da unidade sem ocupantes no contrato",
      days: null,
      quantity: null,
      unit_value: amount,
      total: amount,
      notes: null,
    };
  }
}

function round2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Rateio: unidade → razão social → seção. */
export function buildRateio(items: Pick<PurchaseItem, "business_unit_name" | "legal_entity_name" | "section_name" | "category_code" | "total">[]) {
  const map = new Map<string, { unit: string; entity: string; section: string; vt: number; fretado: number; total: number; people: number }>();
  for (const i of items) {
    const unit = i.business_unit_name ?? "Sem unidade";
    const entity = i.legal_entity_name ?? "(sem razão social)";
    const section = i.section_name ?? "(subsídio da unidade)";
    const key = `${unit}|${entity}|${section}`;
    const row = map.get(key) ?? { unit, entity, section, vt: 0, fretado: 0, total: 0, people: 0 };
    const t = Number(i.total);
    if (i.category_code === "VT") row.vt = round2(row.vt + t);
    else row.fretado = round2(row.fretado + t);
    row.total = round2(row.total + t);
    row.people += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.unit.localeCompare(b.unit) || a.entity.localeCompare(b.entity) || a.section.localeCompare(b.section));
}
