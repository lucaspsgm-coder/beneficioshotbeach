"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/env";
import type { ActionResult } from "@/lib/types";

export async function login(fd: FormData): Promise<ActionResult> {
  const username = String(fd.get("username") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!username || !password) return { ok: false, error: "Informe usuário e senha." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error || !data.user) return { ok: false, error: "Usuário ou senha incorretos." };

  const { data: profile } = await supabase.from("profiles").select("active").eq("id", data.user.id).maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return { ok: false, error: "Seu usuário está desativado. Fale com o administrador de benefícios." };
  }

  await supabase.rpc("log_event", { p_action: "LOGIN", p_details: {} });
  return { ok: true, message: "" };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "LOGOUT", p_details: {} });
  await supabase.auth.signOut();
  redirect("/login");
}
