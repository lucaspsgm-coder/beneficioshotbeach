import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOrg, getCatalog, getUserDirectory, describeOption } from "@/lib/data";
import { fmtDate, fmtDateTime, movementTypeLabel, movementStatusLabel } from "@/lib/format";
import { PageHeader, Panel, Button, Select, Table, Th, Td, Tr, EmptyState, Input } from "@/components/ui/primitives";
import { MovementStatusBadge } from "@/components/status";
import { ConfirmAction } from "@/components/action-form";
import { cancelMovement } from "./actions";
import type { Movement, MovementStatus, MovementType } from "@/lib/types";

type Row = Movement & { employees: { full_name: string; registration: string } };

export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tipo?: string; unidade?: string; de?: string; ate?: string }>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const supabase = await createClient();
  const [org, cat, dir] = await Promise.all([getOrg(), getCatalog(), getUserDirectory()]);

  let q = supabase.from("movements").select("*, employees(full_name, registration)").order("created_at", { ascending: false }).limit(300);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.tipo) q = q.eq("type", sp.tipo);
  if (sp.unidade) q = q.eq("business_unit_id", sp.unidade);
  if (sp.de) q = q.gte("created_at", `${sp.de}T00:00:00-03:00`);
  if (sp.ate) q = q.lte("created_at", `${sp.ate}T23:59:59-03:00`);
  const { data } = await q;
  const rows = (data ?? []) as Row[];
  const who = (uid: string | null) => (uid ? dir.get(uid)?.username ?? "usuário removido" : "sistema");

  return (
    <>
      <PageHeader
        title="Movimentações"
        description="Tudo o que foi pedido, com quem pediu, quem decidiu e quando."
        actions={
          <Button asChild>
            <Link href="/movimentacoes/nova"><Plus />Nova inclusão</Link>
          </Button>
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Select name="status" defaultValue={sp.status ?? ""} className="w-52" aria-label="Situação">
          <option value="">Todas as situações</option>
          {(Object.keys(movementStatusLabel) as MovementStatus[]).map((s) => (
            <option key={s} value={s}>{movementStatusLabel[s]}</option>
          ))}
        </Select>
        <Select name="tipo" defaultValue={sp.tipo ?? ""} className="w-60" aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {(Object.keys(movementTypeLabel) as MovementType[]).map((t) => (
            <option key={t} value={t}>{movementTypeLabel[t]}</option>
          ))}
        </Select>
        {isAdmin && (
          <Select name="unidade" defaultValue={sp.unidade ?? ""} className="w-44" aria-label="Unidade">
            <option value="">Todas as unidades</option>
            {org.units.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        )}
        <Input type="date" name="de" defaultValue={sp.de} className="w-40" aria-label="De" />
        <Input type="date" name="ate" defaultValue={sp.ate} className="w-40" aria-label="Até" />
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Nenhuma movimentação com esses filtros." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Colaborador</Th>
                <Th>Movimentação</Th>
                <Th>Situação</Th>
                <Th>Pedido por</Th>
                <Th>Decidido por</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const target = m.vt_fare_id || m.charter_schedule_id ? describeOption(cat, m) : null;
                const cancelable = !m.purchase_id && (["PENDENTE", "AGUARDANDO_APROVACAO", "FILA_ESPERA"].includes(m.status) || (isAdmin && m.status === "APROVADO"));
                return (
                  <Tr key={m.id}>
                    <Td>
                      <Link href={`/colaboradores/${m.employee_id}`} className="font-medium hover:text-petrol-600">
                        {m.employees?.full_name}
                      </Link>
                      <p className="text-xs text-ink-faint">Chapa {m.employees?.registration}</p>
                    </Td>
                    <Td>
                      <p>{movementTypeLabel[m.type]}</p>
                      {target && (
                        <p className="text-[13px] text-ink-soft">
                          {target.category} · {target.title} {target.detail}
                        </p>
                      )}
                      {m.effective_date && <p className="text-xs text-ink-faint">Vale a partir de {fmtDate(m.effective_date)}</p>}
                    </Td>
                    <Td>
                      <MovementStatusBadge status={m.status} />
                      {m.status === "REJEITADO" && m.decision_note && <p className="mt-1 max-w-[220px] text-xs text-bad">“{m.decision_note}”</p>}
                    </Td>
                    <Td className="text-xs text-ink-soft">
                      {who(m.created_by)}
                      <br />
                      {fmtDateTime(m.created_at)}
                    </Td>
                    <Td className="text-xs text-ink-soft">
                      {m.decided_at ? (
                        <>
                          {who(m.decided_by)}
                          <br />
                          {fmtDateTime(m.decided_at)}
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right">
                      {cancelable && (
                        <ConfirmAction
                          action={cancelMovement.bind(null, m.id)}
                          label="Cancelar"
                          variant="ghost"
                          title="Cancelar esta movimentação?"
                          description="O que ela tinha mudado no benefício volta como estava."
                          confirmLabel="Cancelar movimentação"
                          note={{ label: "Motivo" }}
                        />
                      )}
                    </Td>
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
