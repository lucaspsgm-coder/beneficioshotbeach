"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { usernameToEmail } from "@/lib/env";
import { fail } from "@/lib/errors";
import { str, bool } from "@/lib/form";
import type { ActionResult } from "@/lib/types";

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,40}$/;

async function adminOnly() {
  const me = await getCurrentUser();
  return me?.role === "ADMIN" ? me : null;
}

export async function createUser(fd: FormData): Promise<ActionResult> {
  const me = await adminOnly();
  if (!me) return fail("Somente o administrador pode criar usuários.");
  const username = (str(fd, "username") ?? "").toLowerCase();
  const fullName = str(fd, "full_name");
  const role = str(fd, "role") === "ADMIN" ? "ADMIN" : "RH_UNIT";
  const unit = str(fd, "business_unit_id");
  const password = String(fd.get("password") ?? "");

  if (!USERNAME.test(username)) return fail("Use de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado. Ex.: maria.souza");
  if (!fullName) return fail("Informe o nome completo.");
  if (role === "RH_UNIT" && !unit) return fail("Escolha a unidade do RH.");
  if (password.length < 8) return fail("A senha inicial precisa ter pelo menos 8 caracteres.");

  const service = createServiceClient();
  const { data, error } = await service.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) {
    return fail(/already/i.test(error?.message ?? "") ? "Esse usuário já existe." : error?.message ?? "Não foi possível criar o usuário.");
  }

  // o perfil é gravado com a sessão do admin, para a auditoria registrar quem criou
  const supabase = await createClient();
  const { error: pErr } = await supabase.from("profiles").insert({
    id: data.user.id,
    username,
    full_name: fullName,
    role,
    business_unit_id: role === "ADMIN" ? null : unit,
  });
  if (pErr) {
    await service.auth.admin.deleteUser(data.user.id);
    return fail(pErr);
  }
  await supabase.rpc("log_event", { p_action: "USUARIO_CRIADO", p_details: { username, role } });
  revalidatePath("/usuarios");
  return { ok: true, message: `Usuário ${username} criado.` };
}

export async function updateUser(fd: FormData): Promise<ActionResult> {
  const me = await adminOnly();
  if (!me) return fail("Somente o administrador pode alterar usuários.");
  const id = str(fd, "id");
  if (!id) return fail("Usuário não encontrado.");
  const role = str(fd, "role") === "ADMIN" ? "ADMIN" : "RH_UNIT";
  const unit = str(fd, "business_unit_id");
  const active = bool(fd, "active");
  if (role === "RH_UNIT" && !unit) return fail("Escolha a unidade do RH.");
  if (id === me.id && (!active || role !== "ADMIN")) return fail("Você não pode desativar nem rebaixar o seu próprio usuário.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: str(fd, "full_name"), role, business_unit_id: role === "ADMIN" ? null : unit, active })
    .eq("id", id);
  if (error) return fail(error);

  // usuário desativado também fica bloqueado no login
  const service = createServiceClient();
  await service.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });

  revalidatePath("/usuarios");
  return { ok: true, message: "Usuário atualizado." };
}

export async function resetPassword(fd: FormData): Promise<ActionResult> {
  const me = await adminOnly();
  if (!me) return fail("Somente o administrador pode redefinir senhas.");
  const id = str(fd, "id");
  const password = String(fd.get("password") ?? "");
  if (!id) return fail("Usuário não encontrado.");
  if (password.length < 8) return fail("A nova senha precisa ter pelo menos 8 caracteres.");

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(id, { password });
  if (error) return fail(error.message);

  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
  await supabase.rpc("log_event", { p_action: "SENHA_REDEFINIDA", p_details: { usuario: p?.username ?? id } });
  return { ok: true, message: "Senha redefinida. Passe a nova senha para o usuário." };
}

/** Qualquer usuário troca a própria senha. */
export async function changeOwnPassword(fd: FormData): Promise<ActionResult> {
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) return fail("A nova senha precisa ter pelo menos 8 caracteres.");
  if (password !== confirm) return fail("As duas senhas não são iguais.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(error.message);
  await supabase.rpc("log_event", { p_action: "SENHA_REDEFINIDA", p_details: { propria: true } });
  return { ok: true, message: "Senha alterada." };
}
