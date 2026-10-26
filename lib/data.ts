import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { todayBR, fmtDateTime } from "@/lib/format";
import type {
  BusinessUnit,
  LegalEntity,
  Section,
  BenefitCategory,
  BenefitGroup,
  Operator,
  VtFare,
  CharterContract,
  CharterRoute,
  CharterSchedule,
  CharterSubsidy,
  CalendarMonth,
} from "@/lib/types";

export const getOrg = cache(async () => {
  const supabase = await createClient();
  const [u, l, s] = await Promise.all([
    supabase.from("business_units").select("*").order("name"),
    supabase.from("legal_entities").select("*").order("name"),
    supabase.from("sections").select("*").order("name"),
  ]);
  return {
    units: (u.data ?? []) as BusinessUnit[],
    entities: (l.data ?? []) as LegalEntity[],
    sections: (s.data ?? []) as Section[],
  };
});

export interface Catalog {
  groups: BenefitGroup[];
  categories: BenefitCategory[];
  operators: Operator[];
  fares: VtFare[];
  contracts: CharterContract[];
  subsidies: CharterSubsidy[];
  routes: CharterRoute[];
  schedules: CharterSchedule[];
}

export const getCatalog = cache(async (): Promise<Catalog> => {
  const supabase = await createClient();
  const [g, c, o, f, ct, sb, r, s] = await Promise.all([
    supabase.from("benefit_groups").select("*").order("code"),
    supabase.from("benefit_categories").select("*").order("code", { ascending: false }),
    supabase.from("operators").select("*").order("name"),
    supabase.from("vt_fares").select("*").order("destination"),
    supabase.from("charter_contracts").select("*").order("name"),
    supabase.from("charter_subsidies").select("*"),
    supabase.from("charter_routes").select("*").order("name"),
    supabase.from("charter_schedules").select("*").order("arrival_time"),
  ]);
  const num = <T extends object>(rows: T[] | null, keys: (keyof T)[]) =>
    (rows ?? []).map((row) => {
      const out = { ...row };
      keys.forEach((k) => {
        const v = out[k] as unknown;
        if (v !== null && v !== undefined) (out as Record<string, unknown>)[k as string] = Number(v);
      });
      return out;
    });
  return {
    groups: (g.data ?? []) as BenefitGroup[],
    categories: (c.data ?? []) as BenefitCategory[],
    operators: (o.data ?? []) as Operator[],
    fares: num((f.data ?? []) as VtFare[], ["fare"]),
    contracts: num((ct.data ?? []) as CharterContract[], ["monthly_value"]),
    subsidies: num((sb.data ?? []) as CharterSubsidy[], ["value"]),
    routes: num((r.data ?? []) as CharterRoute[], ["seat_price"]),
    schedules: (s.data ?? []) as CharterSchedule[],
  };
});

/** Assentos ocupados por horário a partir de uma data (inclui reservas futuras). */
export async function getAvailability(from?: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("schedule_availability", { p_from: from ?? todayBR() });
  const map = new Map<string, { seats: number | null; taken: number }>();
  (data ?? []).forEach((r: { schedule_id: string; seats: number | null; taken: number }) =>
    map.set(r.schedule_id, { seats: r.seats, taken: r.taken }),
  );
  return map;
}

/** id → usuário, para mostrar quem fez cada coisa. */
export const getUserDirectory = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("user_directory");
  const map = new Map<string, { username: string; full_name: string }>();
  (data ?? []).forEach((r: { id: string; username: string; full_name: string }) => map.set(r.id, r));
  return map;
});

export async function traceOf(row: { created_by: string | null; created_at: string; updated_by: string | null; updated_at: string }) {
  const dir = await getUserDirectory();
  return {
    createdBy: row.created_by ? dir.get(row.created_by)?.username ?? "usuário removido" : "sistema",
    createdAt: fmtDateTime(row.created_at),
    updatedBy: row.updated_by ? dir.get(row.updated_by)?.username ?? "usuário removido" : "sistema",
    updatedAt: fmtDateTime(row.updated_at),
  };
}

export async function getCurrentWindow() {
  const supabase = await createClient();
  const today = todayBR();
  const { data } = await supabase
    .from("calendar_months")
    .select("*")
    .lte("window_open", today)
    .gte("window_close", today)
    .order("reference_month")
    .limit(1)
    .maybeSingle();
  return (data ?? null) as CalendarMonth | null;
}

export async function getCalendarFor(referenceMonth: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("calendar_months").select("*").eq("reference_month", referenceMonth).maybeSingle();
  return (data ?? null) as CalendarMonth | null;
}

/** Descrição legível de uma opção de benefício. */
export function describeOption(
  cat: Catalog,
  opt: { vt_fare_id: string | null; charter_schedule_id: string | null },
): { category: string; title: string; detail: string; operator: string; routeId?: string } {
  if (opt.vt_fare_id) {
    const f = cat.fares.find((x) => x.id === opt.vt_fare_id);
    const op = cat.operators.find((o) => o.id === f?.operator_id);
    return {
      category: "Vale-transporte",
      title: f ? `${f.origin} → ${f.destination}` : "Destino removido",
      detail: f ? `${f.line_name}` : "",
      operator: op?.name ?? "—",
    };
  }
  const s = cat.schedules.find((x) => x.id === opt.charter_schedule_id);
  const r = cat.routes.find((x) => x.id === s?.route_id);
  const c = cat.contracts.find((x) => x.id === r?.contract_id);
  const op = cat.operators.find((o) => o.id === c?.operator_id);
  return {
    category: "Fretado",
    title: r ? r.name : "Rota removida",
    detail: s ? `${s.arrival_time} / ${s.departure_time}` : "",
    operator: op?.name ?? "—",
    routeId: r?.id,
  };
}
