// Roda um arquivo .sql no banco do Supabase (ex.: dados de exemplo).
// Uso: npm run db:demo
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
const url = process.env.DATABASE_URL;
if (!file || !url) {
  console.error("Uso: node scripts/run-sql.mjs arquivo.sql (com DATABASE_URL no .env.local)");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  await client.query(readFileSync(file, "utf8"));
  await client.query("commit");
  console.log(`Pronto: ${file}`);
} catch (e) {
  await client.query("rollback");
  console.error(`Erro: ${e.message}\nNada foi gravado.`);
  process.exitCode = 1;
} finally {
  await client.end();
}
