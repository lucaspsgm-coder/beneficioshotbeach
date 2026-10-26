// Cria o banco no Supabase sem usar o SQL Editor.
// Uso: npm run db:setup   (lê DATABASE_URL do .env.local)
//
// Roda os arquivos de supabase/migrations em ordem, cada um numa transação,
// e anota o que já foi aplicado: pode rodar de novo sem duplicar nada.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "Defina DATABASE_URL no .env.local.\n" +
      "No Supabase: botão Connect (topo da página) → Session pooler → copie a URI e troque [YOUR-PASSWORD] pela senha do banco.",
  );
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false } });
try {
  await client.connect();
} catch (e) {
  console.error("Não consegui conectar ao banco:", e.message);
  console.error("Confira a senha na DATABASE_URL e use a URI do Session pooler (porta 5432).");
  process.exit(1);
}

await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`);
await client.query(`alter table public._migrations enable row level security`);
const { rows } = await client.query(`select name from public._migrations`);
const done = new Set(rows.map((r) => r.name));

let applied = 0;
for (const f of files) {
  if (done.has(f)) {
    console.log(`  já aplicado  ${f}`);
    continue;
  }
  const sql = readFileSync(join(dir, f), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public._migrations (name) values ($1)", [f]);
    await client.query("commit");
    console.log(`  aplicado     ${f}`);
    applied++;
  } catch (e) {
    await client.query("rollback");
    console.error(`\nErro em ${f}: ${e.message}`);
    console.error("Nada deste arquivo foi gravado. Corrija e rode de novo; os anteriores não são repetidos.");
    await client.end();
    process.exit(1);
  }
}
await client.end();
console.log(applied ? `\nBanco pronto (${applied} arquivo(s) aplicado(s)).` : "\nO banco já estava atualizado.");
