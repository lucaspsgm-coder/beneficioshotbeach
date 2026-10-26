import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export interface CurrentUser extends Profile {
  unit_name: string | null;
}

/** Usuário logado + perfil (uma vez por requisição). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*, business_units(name)")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || !data.active) return null;
  const { business_units, ...profile } = data as Profile & { business_units: { name: string } | null };
  return { ...profile, unit_name: business_units?.name ?? null };
});

export async function requireUser() {
  const user = await getCurrentUser();
  // sessão sem perfil ativo: encerra a sessão para não ficar em ciclo de redirecionamento
  if (!user) redirect("/sair?motivo=sem-acesso");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
