import type { Catalog } from "@/lib/data";

/** Dados enxutos para o seletor de benefício (vai para o navegador). */
export interface PickerData {
  fares: { id: string; label: string; line: string; operator: string; fare: number }[];
  routes: {
    id: string;
    name: string;
    operator: string;
    schedules: { id: string; label: string; seats: number | null; taken: number }[];
  }[];
}

export function buildPickerData(cat: Catalog, avail: Map<string, { seats: number | null; taken: number }>): PickerData {
  const activeOps = new Map(cat.operators.filter((o) => o.active).map((o) => [o.id, o]));
  const activeContracts = new Map(cat.contracts.filter((c) => c.active && activeOps.has(c.operator_id)).map((c) => [c.id, c]));
  return {
    fares: cat.fares
      .filter((f) => f.active && activeOps.has(f.operator_id))
      .map((f) => ({
        id: f.id,
        label: `${f.origin} → ${f.destination}`,
        line: f.line_name,
        operator: activeOps.get(f.operator_id)!.name,
        fare: f.fare,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    routes: cat.routes
      .filter((r) => r.active && activeContracts.has(r.contract_id))
      .map((r) => {
        const c = activeContracts.get(r.contract_id)!;
        return {
          id: r.id,
          name: r.name,
          operator: activeOps.get(c.operator_id)!.name,
          schedules: cat.schedules
            .filter((s) => s.active && s.route_id === r.id)
            .map((s) => {
              const a = avail.get(s.id);
              return { id: s.id, label: `${s.arrival_time} / ${s.departure_time}`, seats: a?.seats ?? s.seats, taken: a?.taken ?? 0 };
            }),
        };
      })
      .filter((r) => r.schedules.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}
