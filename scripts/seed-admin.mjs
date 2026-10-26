// Cria (ou atualiza) o primeiro administrador do sistema.
// Uso: npm run seed:admin   (lê o .env.local)
// Defina ADMIN_USERNAME, ADMIN_FULL_NAME e ADMIN_PASSWORD no .env.local (nunca no código).
// Troque a senha no primeiro acesso em "Minha conta".
import { createClient } from "@supabase/supabase-js";

const ADMIN = {
  username: process.env.ADMIN_USERNAME || "lucas.pereira",
  password: process.env.ADMIN_PASSWORD,
  fullName: process.env.ADMIN_FULL_NAME || "Lucas Pereira",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.AUTH_EMAIL_DOMAIN || "central-beneficios.local";
if (!ADMIN.password) {
  console.error("Defina ADMIN_PASSWORD no .env.local antes de rodar.");
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local antes de rodar.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const email = `${ADMIN.username}@${domain}`;

let userId;
const created = await supabase.auth.admin.createUser({
  email,
  password: ADMIN.password,
  email_confirm: true,
  user_metadata: { username: ADMIN.username },
});
if (created.error) {
  if (!/already/i.test(created.error.message)) {
    console.error("Erro ao criar usuário:", created.error.message);
    process.exit(1);
  }
  // já existe: localiza e redefine a senha
  let page = 1;
  while (!userId) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email === email)?.id;
    if (data.users.length < 200) break;
    page++;
  }
  if (!userId) {
    console.error("Usuário existe mas não foi encontrado na listagem.");
    process.exit(1);
  }
  await supabase.auth.admin.updateUserById(userId, { password: ADMIN.password, ban_duration: "none" });
} else {
  userId = created.data.user.id;
}

const { error } = await supabase
  .from("profiles")
  .upsert({ id: userId, username: ADMIN.username, full_name: ADMIN.fullName, role: "ADMIN", business_unit_id: null, active: true });
if (error) {
  console.error("Erro ao gravar o perfil:", error.message);
  process.exit(1);
}
console.log(`Administrador pronto: ${ADMIN.username}`);
