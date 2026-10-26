"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { str, reqStr, num, int, bool, FieldError } from "@/lib/form";
import type { ActionResult } from "@/lib/types";

type Values = Record<string, unknown>;

/** Formulários de edição mandam "has_active"; os de criação não (nasce ativo). */
function activeOf(fd: FormData) {
  return fd.has("has_active") ? bool(fd, "active") : true;
}

async function save(table: string, id: string | null, values: Values, paths: string[], message: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN") return fail("Somente o administrador pode alterar os parâmetros.");
  const supabase = await createClient();
  const query = id ? supabase.from(table).update(values).eq(table === "benefit_categories" || table === "benefit_groups" ? "code" : "id", id) : supabase.from(table).insert(values);
  const { error } = await query;
  if (error) return fail(error);
  paths.forEach((p) => revalidatePath(p));
  return { ok: true, message };
}

function guard(fn: (fd: FormData) => Promise<ActionResult>) {
  return async (fd: FormData): Promise<ActionResult> => {
    try {
      return await fn(fd);
    } catch (e) {
      if (e instanceof FieldError) return fail(e.message);
      throw e;
    }
  };
}

const EST = ["/parametros/estrutura"];
const VT = ["/parametros/vale-transporte"];
const FR = ["/parametros/fretado"];

/* ---------------------------------------------------------- Estrutura */
export const saveUnit = guard(async (fd) =>
  save("business_units", str(fd, "id"), { name: reqStr(fd, "name", "Nome"), active: activeOf(fd) }, EST, "Unidade salva."),
);

export const saveEntity = guard(async (fd) =>
  save(
    "legal_entities",
    str(fd, "id"),
    {
      business_unit_id: reqStr(fd, "business_unit_id", "Unidade"),
      name: reqStr(fd, "name", "Razão social"),
      cnpj: str(fd, "cnpj"),
      active: activeOf(fd),
    },
    EST,
    "Razão social salva.",
  ),
);

export const saveSection = guard(async (fd) =>
  save(
    "sections",
    str(fd, "id"),
    { legal_entity_id: reqStr(fd, "legal_entity_id", "Razão social"), name: reqStr(fd, "name", "Seção"), active: activeOf(fd) },
    EST,
    "Seção salva.",
  ),
);

/* ---------------------------------------------------------- Operadoras */
export const saveOperator = guard(async (fd) => {
  const cat = reqStr(fd, "category_code", "Categoria");
  return save(
    "operators",
    str(fd, "id"),
    {
      category_code: cat,
      name: reqStr(fd, "name", "Nome"),
      entry_billing: str(fd, "entry_billing") ?? "MES_CHEIO",
      notes: str(fd, "notes"),
      active: activeOf(fd),
    },
    cat === "VT" ? VT : FR,
    "Operadora salva.",
  );
});

/* ---------------------------------------------------------- Vale-transporte */
export const saveFare = guard(async (fd) => {
  const fare = num(fd, "fare");
  if (fare === null) throw new FieldError("Informe o valor da passagem.");
  return save(
    "vt_fares",
    str(fd, "id"),
    {
      operator_id: reqStr(fd, "operator_id", "Operadora"),
      line_name: reqStr(fd, "line_name", "Linha"),
      origin: str(fd, "origin") ?? "Olímpia",
      destination: reqStr(fd, "destination", "Destino"),
      fare,
      active: activeOf(fd),
    },
    VT,
    "Destino salvo.",
  );
});

/* ---------------------------------------------------------- Fretado */
export const saveContract = guard(async (fd) => {
  const model = reqStr(fd, "cost_model", "Modelo de custo");
  const value = num(fd, "monthly_value");
  if (model !== "POR_ASSENTO" && value === null) throw new FieldError("Informe o valor mensal do contrato.");
  return save(
    "charter_contracts",
    str(fd, "id"),
    {
      operator_id: reqStr(fd, "operator_id", "Operadora"),
      name: reqStr(fd, "name", "Nome do contrato"),
      cost_model: model,
      monthly_value: model === "POR_ASSENTO" ? null : value,
      active: activeOf(fd),
    },
    FR,
    "Contrato salvo.",
  );
});

export const saveSubsidy = guard(async (fd) => {
  const value = num(fd, "value");
  if (value === null) throw new FieldError("Informe o valor do subsídio.");
  return save(
    "charter_subsidies",
    str(fd, "id"),
    {
      contract_id: reqStr(fd, "contract_id", "Contrato"),
      business_unit_id: reqStr(fd, "business_unit_id", "Unidade"),
      subsidy_type: str(fd, "subsidy_type") ?? "VALOR",
      value,
      joins_rateio: bool(fd, "joins_rateio"),
    },
    FR,
    "Subsídio salvo.",
  );
});

export async function deleteSubsidy(id: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN") return fail("Somente o administrador pode alterar os parâmetros.");
  const supabase = await createClient();
  const { error } = await supabase.from("charter_subsidies").delete().eq("id", id);
  if (error) return fail(error);
  revalidatePath("/parametros/fretado");
  return { ok: true, message: "Subsídio removido." };
}

export const saveRoute = guard(async (fd) =>
  save(
    "charter_routes",
    str(fd, "id"),
    {
      contract_id: reqStr(fd, "contract_id", "Contrato"),
      name: reqStr(fd, "name", "Rota"),
      seat_price: num(fd, "seat_price"),
      active: activeOf(fd),
    },
    FR,
    "Rota salva.",
  ),
);

export const saveSchedule = guard(async (fd) => {
  const seats = int(fd, "seats");
  if (seats !== null && seats < 1) throw new FieldError("A quantidade de assentos deve ser maior que zero, ou deixe em branco para ilimitado.");
  return save(
    "charter_schedules",
    str(fd, "id"),
    {
      route_id: reqStr(fd, "route_id", "Rota"),
      arrival_time: reqStr(fd, "arrival_time", "Desembarque"),
      departure_time: reqStr(fd, "departure_time", "Embarque"),
      seats,
      active: activeOf(fd),
    },
    FR,
    "Horário salvo.",
  );
});

/* ---------------------------------------------------------- Calendário */
export const saveCalendar = guard(async (fd) => {
  const month = reqStr(fd, "reference_month", "Mês da compra"); // YYYY-MM
  return save(
    "calendar_months",
    str(fd, "id"),
    {
      reference_month: `${month.slice(0, 7)}-01`,
      window_open: reqStr(fd, "window_open", "Abertura da janela"),
      window_close: reqStr(fd, "window_close", "Fechamento da janela"),
      cutoff_date: reqStr(fd, "cutoff_date", "Data de corte"),
      approval_date: reqStr(fd, "approval_date", "Dia de aprovação"),
      purchase_date: str(fd, "purchase_date"),
      credit_date: str(fd, "credit_date"),
      notes: str(fd, "notes"),
    },
    ["/parametros/calendario", "/"],
    "Calendário salvo.",
  );
});

/* ---------------------------------------------------------- Regras */
export const saveCategory = guard(async (fd) => {
  const base = int(fd, "base_days");
  const passes = int(fd, "passes_per_day");
  if (base === null || base < 1 || base > 31) throw new FieldError("Dias-base deve ficar entre 1 e 31.");
  return save(
    "benefit_categories",
    reqStr(fd, "code", "Categoria"),
    { name: reqStr(fd, "name", "Nome"), base_days: base, passes_per_day: passes ?? 0, admission_proportional: bool(fd, "admission_proportional") },
    ["/parametros/regras"],
    "Categoria salva.",
  );
});

export const saveGroup = guard(async (fd) => {
  const max = int(fd, "max_active");
  if (max === null || max < 1) throw new FieldError("O limite deve ser pelo menos 1.");
  return save("benefit_groups", reqStr(fd, "code", "Grupo"), { name: reqStr(fd, "name", "Nome"), max_active: max }, ["/parametros/regras"], "Regra salva.");
});
