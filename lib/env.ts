function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não configurada. Veja o arquivo .env.example.`);
  }
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  authEmailDomain: () => process.env.AUTH_EMAIL_DOMAIN || "central-beneficios.local",
};

/** Login por usuário: o Supabase Auth exige e-mail, então o usuário vira usuario@dominio. */
export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${env.authEmailDomain()}`;
}
