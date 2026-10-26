"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { str } from "@/lib/form";
import type { ActionResult } from "@/lib/types";

function refresh(employeeId?: string | null) {
  revalidatePath("/", "layout");
  if (employeeId) revalidatePath(`/colaboradores/${employeeId}`);
}

/** Inclusão admissional, inclusão mensal ou pedido complementar. */
export async function submitInclusion(fd: FormData): Promise<ActionResult<{ employeeId: string }>> {
  const type = str(fd, "type");
  const employeeId = str(fd, "employee_id");
  const payload = {
    type,
    employee_id: employeeId,
    employee: employeeId
      ? undefined
      : {
          registration: str(fd, "registration"),
          full_name: str(fd, "full_name"),
          birth_date: str(fd, "birth_date"),
          admission_date: str(fd, "admission_date"),
          mother_name: str(fd, "mother_name"),
          address: str(fd, "address"),
          business_unit_id: str(fd, "business_unit_id"),
          legal_entity_id: str(fd, "legal_entity_id"),
          section_id: str(fd, "section_id"),
          vt_card_number: str(fd, "vt_card_number"),
        },
    category_code: str(fd, "category_code"),
    vt_fare_id: str(fd, "vt_fare_id"),
    charter_schedule_id: str(fd, "charter_schedule_id"),
    waitlist_schedule_id: str(fd, "waitlist_schedule_id"),
    start_date: str(fd, "start_date"),
    justification: str(fd, "justification"),
  };
  if (!payload.category_code) return fail("Escolha o benefício: vale-transporte ou fretado.");
  if (payload.category_code === "VT" && !payload.vt_fare_id) return fail("Escolha o destino do vale-transporte.");
  if (payload.category_code === "FRETADO" && !payload.charter_schedule_id) return fail("Escolha a rota e o horário do fretado.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_inclusion", { p: payload });
  if (error) {
    if (error.hint === "SEM_VAGA" && type === "INCLUSAO_ADMISSIONAL") {
      return fail("Esse horário lotou enquanto você preenchia. Cadastre no vale-transporte e marque a fila de espera do horário.");
    }
    return fail(error);
  }
  const { data: mov } = await supabase.from("movements").select("employee_id").eq("id", data).maybeSingle();
  refresh(mov?.employee_id);
  const msg =
    type === "PEDIDO_COMPLEMENTAR"
      ? "Pedido complementar enviado para aprovação."
      : payload.waitlist_schedule_id
        ? "Inclusão registrada no vale-transporte e colaborador colocado na fila de espera."
        : "Inclusão registrada.";
  return { ok: true, message: msg, data: { employeeId: mov?.employee_id ?? "" } };
}

export async function submitExclusion(fd: FormData): Promise<ActionResult> {
  const employeeId = str(fd, "employee_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_exclusion", {
    p_employee: employeeId,
    p_reason: str(fd, "reason") ?? "OUTRO",
    p_note: str(fd, "note"),
  });
  if (error) return fail(error);
  refresh(employeeId);
  return { ok: true, message: "Exclusão registrada. O colaborador sai na próxima compra." };
}

export async function submitCategoryChange(fd: FormData): Promise<ActionResult> {
  const employeeId = str(fd, "employee_id");
  const category = str(fd, "category_code");
  if (!category) return fail("Escolha o novo benefício.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_category_change", {
    p_employee: employeeId,
    p_category: category,
    p_fare: str(fd, "vt_fare_id"),
    p_schedule: str(fd, "charter_schedule_id"),
    p_note: str(fd, "note"),
  });
  if (error) return fail(error);
  const { data: m } = await supabase.from("movements").select("status").eq("id", data).maybeSingle();
  refresh(employeeId);
  return {
    ok: true,
    message:
      m?.status === "FILA_ESPERA"
        ? "Sem vaga no horário: o pedido entrou na fila de espera."
        : "Troca enviada para aprovação. Se aprovada, vale a partir do mês seguinte.",
  };
}

export async function submitScheduleSwap(fd: FormData): Promise<ActionResult> {
  const employeeId = str(fd, "employee_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_schedule_swap", {
    p_employee: employeeId,
    p_schedule: str(fd, "charter_schedule_id"),
    p_note: str(fd, "note"),
  });
  if (error) return fail(error);
  refresh(employeeId);
  return { ok: true, message: "Troca de horário enviada para aprovação." };
}

export async function submitEmployeeUpdate(fd: FormData): Promise<ActionResult> {
  const employeeId = str(fd, "employee_id");
  const fields: Record<string, string | null> = {};
  ["registration", "full_name", "birth_date", "admission_date", "mother_name", "address", "business_unit_id", "legal_entity_id", "section_id", "vt_card_number"].forEach(
    (k) => {
      if (fd.has(k)) fields[k] = str(fd, k);
    },
  );
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_employee_update", { p_employee: employeeId, p_fields: fields, p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh(employeeId);
  return { ok: true, message: "Alteração cadastral registrada." };
}

/** Admin: lança o número do cartão de VT direto (fica na auditoria). */
export async function updateCardNumber(fd: FormData): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN") return fail("Somente o administrador lança o número do cartão.");
  const employeeId = str(fd, "employee_id");
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ vt_card_number: str(fd, "vt_card_number") }).eq("id", employeeId);
  if (error) return fail(error);
  refresh(employeeId);
  return { ok: true, message: "Número do cartão salvo." };
}

export async function cancelMovement(id: string, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_movement", { p_id: id, p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh();
  return { ok: true, message: "Movimentação cancelada." };
}

export async function approveMovement(id: string, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_movement", { p_id: id, p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh();
  return { ok: true, message: "Aprovado." };
}

export async function rejectMovement(id: string, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_movement", { p_id: id, p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh();
  return { ok: true, message: "Rejeitado. O RH vê o motivo na movimentação." };
}

export async function approveWaitlist(id: string, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_waitlist", { p_id: id, p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh();
  return { ok: true, message: "Saída da fila aprovada. A troca vale a partir do mês seguinte." };
}

export async function cancelWaitlist(id: string, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_waitlist", { p_id: id, p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh();
  return { ok: true, message: "Retirado da fila." };
}
