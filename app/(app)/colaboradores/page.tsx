import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOrg, getCatalog, describeOption } from "@/lib/data";
import { fmtDate, todayBR } from "@/lib/format";
import { PageHeader, Panel, Button, Input, Select, Table, Th, Td, Tr, EmptyState, Badge } from "@/components/ui/primitives";
import { CategoryBadge } from "@/components/status";
import type { Employee, EmployeeBenefit } from "@/lib/types";

type Row = Employee & { employee_benefits: EmployeeBenefit[]; movements: { status: string }[] };

export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; unidade?: string; situacao?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const [org, cat] = await Promise.all([getOrg(), getCatalog()]);
  const today = todayBR();

  let q = supabase
    .from("employees")
    .select("*, employee_benefits(*), movements(status)")
    .order("full_name")
    .limit(500);
  if (sp.q) {
    const term = sp.q.replace(/[%,()]/g, " ").trim();
    q = q.or(`full_name.ilike.%${term}%,registration.ilike.%${term}%`);
  }
  if (sp.unidade) q = q.eq("business_unit_id", sp.unidade);
  if (sp.situacao !== "inativos") q = q.eq("active", true);
  const { data, error } = await q;

  const rows = ((data ?? []) as Row[])
    .map((e) => {
      const current = e.employee_benefits
        .filter((b) => !b.canceled && b.start_date <= today && (!b.end_date || b.end_date >= today))
        .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
      const upcoming = e.employee_benefits.find((b) => !b.canceled && b.start_date > today);
      const pending = e.movements.filter((m) => ["AGUARDANDO_APROVACAO", "FILA_ESPERA", "PENDENTE"].includes(m.status)).length;
      return { e, current, upcoming, pending };
    })
    .filter((r) => {
      if (sp.categoria === "sem") return !r.current && !r.upcoming;
      if (sp.categoria) return r.current?.category_code === sp.categoria || r.upcoming?.category_code === sp.categoria;
      return true;
    });

  const unitName = (id: string) => org.units.find((u) => u.id === id)?.name ?? "—";
  const entityName = (id: string) => org.entities.find((u) => u.id === id)?.name ?? "—";
  const sectionName = (id: string) => org.sections.find((u) => u.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Colaboradores"
        description={user.role === "ADMIN" ? "Todas as unidades." : `Unidade ${user.unit_name ?? ""}.`}
        actions={
          <Button asChild>
            <Link href="/movimentacoes/nova"><Plus />Nova inclusão</Link>
          </Button>
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input name="q" defaultValue={sp.q} placeholder="Nome ou chapa" className="pl-9" aria-label="Buscar por nome ou chapa" />
        </div>
        <Select name="categoria" defaultValue={sp.categoria ?? ""} className="w-48" aria-label="Benefício">
          <option value="">Todos os benefícios</option>
          <option value="VT">Vale-transporte</option>
          <option value="FRETADO">Fretado</option>
          <option value="sem">Sem benefício</option>
        </Select>
        {user.role === "ADMIN" && (
          <Select name="unidade" defaultValue={sp.unidade ?? ""} className="w-44" aria-label="Unidade">
            <option value="">Todas as unidades</option>
            {org.units.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        )}
        <Select name="situacao" defaultValue={sp.situacao ?? ""} className="w-40" aria-label="Situação">
          <option value="">Ativos</option>
          <option value="inativos">Incluir inativos</option>
        </Select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <Panel>
        {error ? (
          <EmptyState title="Não foi possível carregar os colaboradores.">{error.message}</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum colaborador encontrado.">Ajuste a busca ou cadastre pela nova inclusão.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Colaborador</Th>
                <Th>Lotação</Th>
                <Th>Benefício</Th>
                <Th>Desde</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, current, upcoming, pending }) => {
                const opt = current ? describeOption(cat, current) : null;
                const next = upcoming ? describeOption(cat, upcoming) : null;
                return (
                  <Tr key={e.id}>
                    <Td>
                      <Link href={`/colaboradores/${e.id}`} className="font-medium hover:text-petrol-600">
                        {e.full_name}
                      </Link>
                      <p className="text-xs text-ink-faint">
                        Chapa {e.registration}
                        {!e.active && " · inativo"}
                      </p>
                    </Td>
                    <Td className="text-[13px] text-ink-soft">
                      {unitName(e.business_unit_id)} · {entityName(e.legal_entity_id)}
                      <br />
                      {sectionName(e.section_id)}
                    </Td>
                    <Td>
                      {opt ? (
                        <div className="flex flex-col items-start gap-1">
                          <CategoryBadge code={current!.category_code} />
                          <span className="text-[13px]">
                            {opt.title} <span className="text-ink-faint">{opt.detail}</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-[13px] text-ink-faint">Sem benefício</span>
                      )}
                      {next && (
                        <p className="mt-1 text-xs text-petrol-600">
                          A partir de {fmtDate(upcoming!.start_date)}: {next.category} · {next.title} {next.detail}
                        </p>
                      )}
                      {pending > 0 && <Badge tone="warn" className="mt-1">{pending} em andamento</Badge>}
                    </Td>
                    <Td className="text-[13px] text-ink-soft">{current ? fmtDate(current.start_date) : "—"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
