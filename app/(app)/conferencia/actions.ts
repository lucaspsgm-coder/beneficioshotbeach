"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { readSheet } from "@/lib/xlsx";
import { chapaKey } from "@/lib/calc";
import { todayBR } from "@/lib/format";
import { fail } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export interface Divergence {
  kind: "SEM_NA_FOLHA" | "SEM_NO_SISTEMA" | "CATEGORIA_DIFERENTE";
  registration: string;
  name: string;
  system: string | null;
  payroll: string | null;
  employeeId?: string;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function category(v: unknown): "VT" | "FRETADO" | null {
  const s = norm(v);
  if (!s) return null;
  if (s.includes("fret")) return "FRETADO";
  if (s === "vt" || s.includes("vale") || s.includes("transporte")) return "VT";
  return null;
}
const label = (c: string | null) => (c === "VT" ? "Vale-transporte" : c === "FRETADO" ? "Fretado" : "—");

export async function runReconciliation(fd: FormData): Promise<ActionResult<{ divergences: Divergence[]; checked: number; matched: number }>> {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN") return fail("Somente o administrador roda a conferência.");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Escolha o arquivo de ativos da folha (.xlsx).");

  let sheet;
  try {
    sheet = await readSheet(await file.arrayBuffer());
  } catch {
    return fail("Não consegui ler o arquivo. Envie um .xlsx.");
  }
  if (!sheet) return fail("O arquivo está vazio.");
  const find = (want: string) => sheet.headers.find((h) => norm(h).startsWith(want));
  const hName = find("nome");
  const hChapa = find("chapa") ?? find("matricula");
  const hCat = find("categoria") ?? find("beneficio");
  if (!hName || !hChapa || !hCat) return fail("O arquivo precisa das colunas Nome, Chapa e Categoria de benefício.");

  const supabase = await createClient();
  const today = todayBR();
  const { data } = await supabase
    .from("employee_benefits")
    .select("category_code, employee_id, employees(full_name, registration)")
    .eq("canceled", false)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`);
  type B = { category_code: string; employee_id: string; employees: { full_name: string; registration: string } };
  const active = ((data ?? []) as unknown as B[]).filter((b) => b.employees);

  const byChapa = new Map<string, B[]>();
  active.forEach((b) => byChapa.set(chapaKey(b.employees.registration), [...(byChapa.get(chapaKey(b.employees.registration)) ?? []), b]));

  const divergences: Divergence[] = [];
  const matchedIds = new Set<string>();
  for (const r of sheet.rows) {
    const chapa = String(r.values[hChapa] ?? "").trim();
    if (!chapa) continue;
    const name = String(r.values[hName] ?? "").trim();
    const cat = category(r.values[hCat]);
    let candidates = byChapa.get(chapaKey(chapa)) ?? [];
    if (candidates.length > 1) candidates = candidates.filter((c) => norm(c.employees.full_name) === norm(name));
    const match = candidates[0];
    if (!match) {
      if (cat) divergences.push({ kind: "SEM_NO_SISTEMA", registration: chapa, name, system: null, payroll: label(cat) });
      continue;
    }
    matchedIds.add(match.employee_id);
    if (cat && cat !== match.category_code) {
      divergences.push({ kind: "CATEGORIA_DIFERENTE", registration: match.employees.registration, name: match.employees.full_name, system: label(match.category_code), payroll: label(cat), employeeId: match.employee_id });
    } else if (!cat) {
      divergences.push({ kind: "SEM_NA_FOLHA", registration: match.employees.registration, name: match.employees.full_name, system: label(match.category_code), payroll: "Sem benefício", employeeId: match.employee_id });
    }
  }
  for (const b of active) {
    if (!matchedIds.has(b.employee_id)) {
      divergences.push({ kind: "SEM_NA_FOLHA", registration: b.employees.registration, name: b.employees.full_name, system: label(b.category_code), payroll: null, employeeId: b.employee_id });
    }
  }

  await supabase.rpc("log_event", {
    p_action: "CONFERENCIA_FOLHA",
    p_details: { arquivo: file.name, linhas: sheet.rows.length, divergencias: divergences.length },
  });
  return { ok: true, message: "", data: { divergences, checked: sheet.rows.length, matched: matchedIds.size } };
}
