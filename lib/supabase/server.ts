import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Cliente com a sessão do usuário logado: respeita as regras de acesso (RLS). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // chamado de um Server Component: o middleware renova a sessão
        }
      },
    },
  });
}

/** Cliente de serviço: só para criar usuários e redefinir senhas. Nunca vai ao navegador. */
export function createServiceClient() {
  return createPlainClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
