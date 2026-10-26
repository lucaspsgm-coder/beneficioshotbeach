"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { computePurchase } from "@/lib/purchase-engine";
import { fail } from "@/lib/errors";
import { str } from "@/lib/form";
import type { ActionResult, Purchase } from "@/lib/types";

async function admin() {
  const me = await getCurrentUser();
  return me?.role === "ADMIN";
}

export async function createPurchase(fd: FormData): Promise<ActionResult<{ id: string }>> {
  if (!(await admin())) return fail("Somente o administrador cria compras.");
  const kind = str(fd, "kind");
  const month = str(fd, "reference_month");
  const start = str(fd, "period_start");
  const end = str(fd, "period_end");
  if (!kind) return fail("Escolha o tipo da compra.");

  let reference = month ? `${month.slice(0, 7)}-01` : null;
  if (kind !== "MENSAL") {
    if (!start || !end) return fail("Informe o período da compra.");
    if (end < start) return fail("O fim do período não pode ser antes do início.");
    reference = `${start.slice(0, 7)}-01`;
  }
  if (!reference) return fail("Informe o mês da compra.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchases")
    .insert({ kind, reference_month: reference, period_start: kind === "MENSAL" ? null : start, period_end: kind === "MENSAL" ? null : end, notes: str(fd, "notes") })
    .select("id")
    .single();
  if (error) return fail(error.code === "23505" ? "Já existe uma compra mensal para esse mês." : error);
  revalidatePath("/compras");
  return { ok: true, message: "Compra criada. Confira a prévia antes de fechar.", data: { id: data.id } };
}

export async function closePurchase(id: string): Promise<ActionResult> {
  if (!(await admin())) return fail("Somente o administrador fecha compras.");
  const supabase = await createClient();
  const { data: p } = await supabase.from("purchases").select("*").eq("id", id).single();
  if (!p) return fail("Compra não encontrada.");
  const { items, movementIds } = await computePurchase(p as Purchase);
  const { error } = await supabase.rpc("close_purchase", { p_id: id, p_items: items, p_movement_ids: movementIds });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { ok: true, message: `Compra fechada com ${items.length} item(ns). Os arquivos já podem ser exportados.` };
}

export async function reopenPurchase(id: string, fd: FormData): Promise<ActionResult> {
  if (!(await admin())) return fail("Somente o administrador reabre compras.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_purchase", { p_id: id, p_note: str(fd, "note") });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Compra reaberta. As movimentações voltaram a ser editáveis." };
}

export async function markPaid(id: string): Promise<ActionResult> {
  if (!(await admin())) return fail("Somente o administrador marca compras como pagas.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_purchase_paid", { p_id: id });
  if (error) return fail(error);
  revalidatePath("/compras");
  revalidatePath(`/compras/${id}`);
  return { ok: true, message: "Compra marcada como paga. A partir de agora ela fica travada." };
}

export async function deletePurchase(id: string): Promise<ActionResult> {
  if (!(await admin())) return fail("Somente o administrador exclui compras.");
  const supabase = await createClient();
  const { data: p } = await supabase.from("purchases").select("status").eq("id", id).single();
  if (p?.status !== "ABERTA") return fail("Só uma compra aberta pode ser excluída.");
  const { error } = await supabase.from("purchases").delete().eq("id", id);
  if (error) return fail(error);
  revalidatePath("/compras");
  return { ok: true, message: "Compra excluída." };
}
