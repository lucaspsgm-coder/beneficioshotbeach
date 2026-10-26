"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrg, getCatalog, getAvailability } from "@/lib/data";
import { readSheet } from "@/lib/xlsx";
import { fail } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export interface LoadRow {
  sheet: "VT" | "Fretado";
  row: number;
  name: string;
  registration: string;
  option: string;
  ok: boolean;
  error?: string;
  payload?: Record<string, unknown>;
}

const EXAMPLES = new Set(["maria aparecida da silva|001420", "joao pereira santos|000987"]);
const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
const normTime = (v: unknown) => norm(v).replace(/\s/g, "");

function toISO(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") {
    const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  if (typeof v === "number") {
    // número serial do Excel
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export async function validateLoad(fd: FormData): Promise<ActionResult<{ rows: LoadRow[] }>> {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN") return fail("Somente o administrador faz a carga inicial.");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Escolha o arquivo da carga (.xlsx).");
  const buf = await file.arrayBuffer();

  const [org, cat, avail] = await Promise.all([getOrg(), getCatalog(), getAvailability()]);
  let vtSheet, frSheet;
  try {
    vtSheet = await readSheet(buf, "Carga VT");
    frSheet = await readSheet(buf, "Carga Fretado");
  } catch {
    return fail("Não consegui ler o arquivo. Use o modelo de carga; se ele foi editado em outro programa, abra no Excel, salve como .xlsx e tente de novo.");
  }
  if (!vtSheet && !frSheet) return fail("O arquivo não tem as abas “Carga VT” e “Carga Fretado” do modelo.");

  const rows: LoadRow[] = [];
  const seen = new Map<string, LoadRow[]>();
  const seatUse = new Map<string, LoadRow[]>();

  const resolveOrg = (v: Record<string, unknown>) => {
    const unit = org.units.find((u) => norm(u.name) === norm(v["Unidade"]));
    if (!unit) return { error: `Unidade “${v["Unidade"] ?? ""}” não cadastrada.` };
    const ent = org.entities.find((e) => e.business_unit_id === unit.id && norm(e.name) === norm(v["Razão social (CNPJ)"]));
    if (!ent) return { error: `Razão social “${v["Razão social (CNPJ)"] ?? ""}” não existe na unidade ${unit.name}.` };
    const sec = org.sections.find((s) => s.legal_entity_id === ent.id && norm(s.name) === norm(v["Seção"]));
    if (!sec) return { error: `Seção “${v["Seção"] ?? ""}” não existe em ${ent.name}.` };
    return { unit, ent, sec };
  };

  const base = (sheet: "VT" | "Fretado", r: { row: number; values: Record<string, unknown> }) => {
    const v = r.values;
    const registration = String(v["Chapa"] ?? "").trim();
    const name = String(v["Nome completo"] ?? "").trim();
    return { v, registration, name, row: r.row, sheet };
  };

  const pushRow = (lr: LoadRow, key?: string) => {
    rows.push(lr);
    if (key) seen.set(key, [...(seen.get(key) ?? []), lr]);
  };

  for (const r of vtSheet?.rows ?? []) {
    const b = base("VT", r);
    if (!b.name && !b.registration) continue; // linha vazia (o modelo já traz a origem preenchida)
    if (EXAMPLES.has(`${norm(b.name)}|${b.registration}`)) continue;
    const lr: LoadRow = { sheet: "VT", row: b.row, name: b.name, registration: b.registration, option: String(b.v["Destino"] ?? ""), ok: false };
    if (!b.name || !b.registration) {
      pushRow({ ...lr, error: "Nome completo e chapa são obrigatórios." });
      continue;
    }
    const o = resolveOrg(b.v);
    if ("error" in o) {
      pushRow({ ...lr, error: o.error });
      continue;
    }
    const origin = norm(b.v["Origem"] || "Olímpia");
    const fare = cat.fares.find((f) => f.active && norm(f.origin) === origin && norm(f.destination) === norm(b.v["Destino"]));
    if (!fare) {
      pushRow({ ...lr, error: `Destino “${b.v["Destino"] ?? ""}” não cadastrado em Vale-transporte.` }, `${b.registration}|${o.ent.id}`);
      continue;
    }
    pushRow(
      {
        ...lr,
        option: `${fare.origin} → ${fare.destination}`,
        ok: true,
        payload: {
          sheet: "VT",
          row: b.row,
          registration: b.registration,
          full_name: b.name,
          birth_date: toISO(b.v["Data de nascimento"]),
          admission_date: toISO(b.v["Data de admissão"]),
          mother_name: b.v["Nome da mãe"] ?? null,
          address: b.v["Endereço"] ?? null,
          business_unit_id: o.unit.id,
          legal_entity_id: o.ent.id,
          section_id: o.sec.id,
          vt_card_number: b.v["Nº do cartão VT (opcional)"] ? String(b.v["Nº do cartão VT (opcional)"]) : null,
          category_code: "VT",
          vt_fare_id: fare.id,
        },
      },
      `${b.registration}|${o.ent.id}`,
    );
  }

  for (const r of frSheet?.rows ?? []) {
    const b = base("Fretado", r);
    if (!b.name && !b.registration) continue;
    if (EXAMPLES.has(`${norm(b.name)}|${b.registration}`)) continue;
    const label = `${b.v["Rota"] ?? ""} · ${b.v["Horário (desembarque / embarque)"] ?? ""}`;
    const lr: LoadRow = { sheet: "Fretado", row: b.row, name: b.name, registration: b.registration, option: label, ok: false };
    if (!b.name || !b.registration) {
      pushRow({ ...lr, error: "Nome completo e chapa são obrigatórios." });
      continue;
    }
    const o = resolveOrg(b.v);
    if ("error" in o) {
      pushRow({ ...lr, error: o.error });
      continue;
    }
    const op = cat.operators.find((x) => x.category_code === "FRETADO" && norm(x.name) === norm(b.v["Operadora"]));
    const contracts = cat.contracts.filter((c) => c.operator_id === op?.id).map((c) => c.id);
    const route = cat.routes.find((x) => contracts.includes(x.contract_id) && norm(x.name) === norm(b.v["Rota"]));
    const sched = cat.schedules.find(
      (s) => s.route_id === route?.id && `${normTime(s.arrival_time)}/${normTime(s.departure_time)}` === normTime(b.v["Horário (desembarque / embarque)"]),
    );
    if (!op || !route || !sched) {
      pushRow(
        {
          ...lr,
          error: !op
            ? `Operadora “${b.v["Operadora"] ?? ""}” não cadastrada.`
            : !route
              ? `Rota “${b.v["Rota"] ?? ""}” não existe na operadora ${op.name}.`
              : `Horário “${b.v["Horário (desembarque / embarque)"] ?? ""}” não existe na rota ${route.name}.`,
        },
        `${b.registration}|${o.ent.id}`,
      );
      continue;
    }
    const ok: LoadRow = {
      ...lr,
      ok: true,
      payload: {
        sheet: "Fretado",
        row: b.row,
        registration: b.registration,
        full_name: b.name,
        birth_date: toISO(b.v["Data de nascimento"]),
        admission_date: toISO(b.v["Data de admissão"]),
        mother_name: b.v["Nome da mãe"] ?? null,
        address: b.v["Endereço"] ?? null,
        business_unit_id: o.unit.id,
        legal_entity_id: o.ent.id,
        section_id: o.sec.id,
        category_code: "FRETADO",
        charter_schedule_id: sched.id,
      },
    };
    pushRow(ok, `${b.registration}|${o.ent.id}`);
    seatUse.set(sched.id, [...(seatUse.get(sched.id) ?? []), ok]);
  }

  // benefício único dentro do arquivo
  for (const list of seen.values()) {
    if (list.length > 1) {
      list.forEach((lr) => {
        lr.ok = false;
        lr.error = `Chapa repetida no arquivo (${list.map((x) => `${x.sheet} linha ${x.row}`).join(", ")}). Benefício único: deixe só uma linha.`;
      });
    }
  }
  // capacidade dos horários
  for (const [sid, list] of seatUse) {
    const a = avail.get(sid);
    const seats = a?.seats ?? cat.schedules.find((s) => s.id === sid)?.seats ?? null;
    if (seats === null) continue;
    const valid = list.filter((x) => x.ok);
    const free = seats - (a?.taken ?? 0);
    valid.slice(Math.max(free, 0)).forEach((lr) => {
      lr.ok = false;
      lr.error = `Horário com ${seats} assentos já completo (${valid.length} pessoas no arquivo). Ajuste a capacidade ou a lista.`;
    });
  }

  rows.sort((a, b) => Number(a.ok) - Number(b.ok) || a.sheet.localeCompare(b.sheet) || a.row - b.row);
  return { ok: true, message: rows.length ? "" : "O arquivo não tem linhas para importar.", data: { rows } };
}

export async function importLoad(payloadJson: string, startDate: string): Promise<ActionResult<{ results: { sheet: string; row: number; ok: boolean; error?: string }[] }>> {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN") return fail("Somente o administrador faz a carga inicial.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return fail("Informe a data de início dos benefícios.");
  const rows = JSON.parse(payloadJson) as Record<string, unknown>[];
  if (!rows.length) return fail("Nenhuma linha válida para importar.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_initial_load", { p_rows: rows, p_start: startDate });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  const results = (data ?? []) as { sheet: string; row: number; ok: boolean; error?: string }[];
  const ok = results.filter((r) => r.ok).length;
  return { ok: true, message: `${ok} de ${results.length} linha(s) importada(s).`, data: { results } };
}
