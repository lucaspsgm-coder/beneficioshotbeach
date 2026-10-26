function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não configurada. Veja o arquivo .env.example.`);
  }
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  // chave publicável (nova) ou anon (antiga, desativada pelo Supabase até o fim de 2026)
  supabaseAnonKey: () =>
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  // chave secreta (nova) ou service_role (antiga); só no servidor
  serviceRoleKey: () => required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  authEmailDomain: () => process.env.AUTH_EMAIL_DOMAIN || "central-beneficios.local",
};

/** Login por usuário: o Supabase Auth exige e-mail, então o usuário vira usuario@dominio. */
export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${env.authEmailDomain()}`;
}
