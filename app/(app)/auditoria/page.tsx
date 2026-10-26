import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, tableLabel, actionLabel } from "@/lib/format";
import { PageHeader, Panel, Table, Th, Td, Tr, EmptyState, Select, Input, Button } from "@/components/ui/primitives";
import type { AuditRow, Profile } from "@/lib/types";

const PAGE = 100;
const HIDDEN = new Set(["created_at", "created_by", "updated_at", "updated_by"]);

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ usuario?: string; acao?: string; tabela?: string; de?: string; ate?: string; registro?: string; pagina?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina ?? 1));
  const supabase = await createClient();

  let q = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.usuario) q = q.eq("username", sp.usuario);
  if (sp.acao) q = q.eq("action", sp.acao);
  if (sp.tabela) q = q.eq("table_name", sp.tabela);
  if (sp.registro) q = q.eq("record_id", sp.registro);
  if (sp.de) q = q.gte("occurred_at", `${sp.de}T00:00:00-03:00`);
  if (sp.ate) q = q.lte("occurred_at", `${sp.ate}T23:59:59-03:00`);
  const [{ data, count }, { data: users }] = await Promise.all([q, supabase.from("profiles").select("username").order("username")]);
  const rows = (data ?? []) as AuditRow[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "pagina") as [string, string][]);
    u.set("pagina", String(p));
    return `?${u}`;
  };

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Registro de tudo o que acontece no sistema: quem fez, o quê, em qual registro, com data e hora e o antes e depois de cada campo. Não pode ser alterado nem apagado pela aplicação."
      />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Select name="usuario" defaultValue={sp.usuario ?? ""} className="w-44" aria-label="Usuário">
          <option value="">Todos os usuários</option>
          <option value="sistema">sistema</option>
          {((users ?? []) as Pick<Profile, "username">[]).map((u) => (
            <option key={u.username} value={u.username}>{u.username}</option>
          ))}
        </Select>
        <Select name="acao" defaultValue={sp.acao ?? ""} className="w-48" aria-label="Ação">
          <option value="">Todas as ações</option>
          {Object.entries(actionLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Select name="tabela" defaultValue={sp.tabela ?? ""} className="w-52" aria-label="Cadastro">
          <option value="">Todos os cadastros</option>
          {Object.entries(tableLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Input type="date" name="de" defaultValue={sp.de} className="w-40" aria-label="De" />
        <Input type="date" name="ate" defaultValue={sp.ate} className="w-40" aria-label="Até" />
        {sp.registro && <input type="hidden" name="registro" value={sp.registro} />}
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Nenhum registro com esses filtros." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[170px]">Data e hora</Th>
                <Th>Usuário</Th>
                <Th>O que aconteceu</Th>
                <Th>Detalhes</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <Tr key={a.id}>
                  <Td className="whitespace-nowrap text-[13px] tabular-nums text-ink-soft">{fmtDateTime(a.occurred_at)}</Td>
                  <Td className="font-medium">{a.username ?? "sistema"}</Td>
                  <Td className="text-[13px]">
                    {actionLabel[a.action] ?? a.action}
                    {a.table_name && (
                      <>
                        {" · "}
                        <Link href={`?registro=${a.record_id}`} className="text-petrol-600 hover:underline" title="Ver todo o histórico deste registro">
                          {tableLabel[a.table_name] ?? a.table_name}
                        </Link>
                      </>
                    )}
                    {a.changed && a.changed.length > 0 && <p className="text-xs text-ink-faint">Campos: {a.changed.filter((c) => !HIDDEN.has(c)).join(", ")}</p>}
                  </Td>
                  <Td className="text-xs">
                    <Details a={a} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[13px] text-ink-soft">
          <span>
            Página {page} de {pages} · {count} registro(s)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild variant="secondary" size="sm">
                <Link href={qs(page - 1)}>Anterior</Link>
              </Button>
            )}
            {page < pages && (
              <Button asChild variant="secondary" size="sm">
                <Link href={qs(page + 1)}>Próxima</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function short(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

function Details({ a }: { a: AuditRow }) {
  if (a.details && !a.table_name) {
    return <span className="text-ink-soft">{Object.entries(a.details).map(([k, v]) => `${k}: ${short(v)}`).join(" · ") || "—"}</span>;
  }
  if (a.action === "UPDATE" && a.changed) {
    const keys = a.changed.filter((c) => !HIDDEN.has(c));
    return (
      <details>
        <summary className="cursor-pointer text-petrol-600">Antes e depois</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {keys.map((k) => (
            <div key={k} className="contents">
              <dt className="text-ink-faint">{k}</dt>
              <dd>
                <span className="text-bad line-through decoration-bad/40">{short(a.old_data?.[k])}</span> → <span className="text-ok">{short(a.new_data?.[k])}</span>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    );
  }
  const data = a.new_data ?? a.old_data;
  if (!data) return <span>—</span>;
  return (
    <details>
      <summary className="cursor-pointer text-petrol-600">Ver registro</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {Object.entries(data)
          .filter(([k]) => !HIDDEN.has(k))
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-faint">{k}</dt>
              <dd>{short(v)}</dd>
            </div>
          ))}
      </dl>
    </details>
  );
}
