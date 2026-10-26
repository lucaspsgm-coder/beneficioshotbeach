import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getUserDirectory } from "@/lib/data";
import { fmtDate, fmtDateTime, fmtMoney, fmtMonth, purchaseKindLabel, todayBR } from "@/lib/format";
import { addMonths } from "@/lib/calc";
import { PageHeader, Panel, Table, Th, Td, Tr, EmptyState } from "@/components/ui/primitives";
import { PurchaseStatusBadge } from "@/components/status";
import { NewPurchaseDialog } from "./new-purchase";
import type { Purchase } from "@/lib/types";

export default async function ComprasPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data }, { data: totals }, dir] = await Promise.all([
    supabase.from("purchases").select("*").order("reference_month", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("purchase_totals").select("purchase_id, items, total"),
    getUserDirectory(),
  ]);
  const rows = (data ?? []) as Purchase[];
  const sum = new Map<string, { total: number; n: number }>();
  (totals ?? []).forEach((t: { purchase_id: string; items: number; total: number }) => sum.set(t.purchase_id, { total: Number(t.total), n: t.items }));
  const today = todayBR();

  return (
    <>
      <PageHeader
        title="Compras"
        description="Mensal (todos os ativos no dia 1º), admissional (admissões do período, com proporcional) e complementar (pedidos aprovados). Ao fechar, a compra vira uma foto: dá para reabrir até ser marcada como paga."
        actions={<NewPurchaseDialog defaultMonth={addMonths(`${today.slice(0, 7)}-01`, 1).slice(0, 7)} today={today} trigger={<><Plus />Nova compra</>} />}
      />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Nenhuma compra ainda.">Crie a compra mensal do próximo mês para ver a prévia com os valores.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Compra</Th>
                <Th>Situação</Th>
                <Th className="text-right">Itens</Th>
                <Th className="text-right">Total</Th>
                <Th>Fechamento</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const s = sum.get(p.id);
                return (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/compras/${p.id}`} className="font-medium hover:text-petrol-600">
                        {purchaseKindLabel[p.kind]} · <span className="capitalize">{fmtMonth(p.reference_month)}</span>
                      </Link>
                      {p.kind !== "MENSAL" && (
                        <p className="text-xs text-ink-faint">
                          {fmtDate(p.period_start)} a {fmtDate(p.period_end)}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <PurchaseStatusBadge status={p.status} />
                    </Td>
                    <Td className="text-right">{p.status === "ABERTA" ? "prévia" : s?.n ?? 0}</Td>
                    <Td className="text-right font-medium">{p.status === "ABERTA" ? "—" : fmtMoney(s?.total ?? 0)}</Td>
                    <Td className="text-xs text-ink-soft">
                      {p.closed_at ? (
                        <>
                          {p.closed_by ? dir.get(p.closed_by)?.username : "—"} em {fmtDateTime(p.closed_at)}
                          {p.paid_at && (
                            <>
                              <br />
                              Paga por {p.paid_by ? dir.get(p.paid_by)?.username : "—"} em {fmtDateTime(p.paid_at)}
                            </>
                          )}
                        </>
                      ) : (
                        "—"
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
