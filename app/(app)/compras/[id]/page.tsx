import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Lock, Unlock, BadgeCheck, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getUserDirectory, traceOf } from "@/lib/data";
import { computePurchase, buildRateio } from "@/lib/purchase-engine";
import { fmtDate, fmtDateTime, fmtMoney, fmtMonth, fmtNumber, purchaseKindLabel } from "@/lib/format";
import { PageHeader, Panel, PanelHeader, Table, Th, Td, Tr, EmptyState, Notice, Button, Trace, Badge } from "@/components/ui/primitives";
import { PurchaseStatusBadge, CategoryBadge } from "@/components/status";
import { ConfirmAction } from "@/components/action-form";
import { closePurchase, reopenPurchase, markPaid, deletePurchase } from "../actions";
import type { Purchase, PurchaseItem } from "@/lib/types";

export default async function CompraPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ver?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { ver = "operadora" } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("purchases").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as Purchase;
  const dir = await getUserDirectory();

  let items: PurchaseItem[];
  let warnings: string[] = [];
  let movementCount = 0;
  if (p.status === "ABERTA") {
    const r = await computePurchase(p);
    items = r.items;
    warnings = r.warnings;
    movementCount = r.movementIds.length;
  } else {
    const { data: it } = await supabase.from("purchase_items").select("*").eq("purchase_id", id).order("operator_name").order("employee_name");
    items = ((it ?? []) as PurchaseItem[]).map((i) => ({ ...i, total: Number(i.total), quantity: i.quantity === null ? null : Number(i.quantity), unit_value: i.unit_value === null ? null : Number(i.unit_value) }));
    const { count } = await supabase.from("movements").select("id", { count: "exact", head: true }).eq("purchase_id", id);
    movementCount = count ?? 0;
  }

  const total = items.reduce((s, i) => s + i.total, 0);
  const byOperator = new Map<string, { category: string; n: number; qty: number; total: number }>();
  items.forEach((i) => {
    const k = `${i.category_code}|${i.operator_name ?? "—"}`;
    const row = byOperator.get(k) ?? { category: i.category_code, n: 0, qty: 0, total: 0 };
    row.n += i.employee_id ? 1 : 0;
    row.qty += Number(i.quantity ?? 0);
    row.total += i.total;
    byOperator.set(k, row);
  });
  const rateio = buildRateio(items);
  const title = `${purchaseKindLabel[p.kind]} · ${fmtMonth(p.reference_month)}`;
  const exportBase = `/api/compras/${p.id}/exportar`;
  const closed = p.status !== "ABERTA";

  return (
    <>
      <PageHeader
        back={
          <Button asChild variant="link" size="sm">
            <Link href="/compras">Compras</Link>
          </Button>
        }
        title={title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PurchaseStatusBadge status={p.status} />
            {p.kind !== "MENSAL" && (
              <span>
                Período {fmtDate(p.period_start)} a {fmtDate(p.period_end)}
              </span>
            )}
            {p.status === "ABERTA" && <span>Prévia calculada agora; muda conforme as movimentações até o fechamento.</span>}
          </span>
        }
        actions={
          <>
            {p.status === "ABERTA" && (
              <>
                <ConfirmAction
                  action={deletePurchase.bind(null, p.id)}
                  label="Excluir"
                  icon={<Trash2 />}
                  variant="ghost"
                  title="Excluir esta compra aberta?"
                  description="Nenhuma movimentação é afetada."
                />
                <ConfirmAction
                  action={closePurchase.bind(null, p.id)}
                  label="Fechar compra"
                  icon={<Lock />}
                  variant="primary"
                  size="md"
                  title="Fechar a compra?"
                  description={`Grava a foto com ${items.length} item(ns), total de ${fmtMoney(total)}, e marca ${movementCount} movimentação(ões) como processadas. Depois, só reabrindo.`}
                />
              </>
            )}
            {p.status === "FECHADA" && (
              <>
                <ConfirmAction
                  action={reopenPurchase.bind(null, p.id)}
                  label="Reabrir"
                  icon={<Unlock />}
                  title="Reabrir a compra?"
                  description="Os itens são apagados e as movimentações voltam a ser editáveis. O motivo fica registrado."
                  note={{ label: "Motivo da reabertura", required: true }}
                />
                <ConfirmAction
                  action={markPaid.bind(null, p.id)}
                  label="Marcar como paga"
                  icon={<BadgeCheck />}
                  variant="primary"
                  size="md"
                  title="Marcar como paga?"
                  description="A compra fica travada. Ajustes depois disso vão para a compra seguinte."
                />
              </>
            )}
          </>
        }
      />

      {warnings.length > 0 && (
        <Notice tone="warn" className="mb-6">
          <p className="mb-1 font-medium">Confira antes de fechar</p>
          <ul className="list-disc pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <Kpi label="Total" value={fmtMoney(total)} strong />
        <Kpi label="Colaboradores" value={String(new Set(items.filter((i) => i.employee_id).map((i) => i.employee_id)).size)} />
        <Kpi label="Itens" value={String(items.length)} />
        <Kpi label="Movimentações processadas" value={String(movementCount)} />
      </dl>

      <Panel className="mb-6">
        <PanelHeader
          title="Arquivos"
          description={closed ? "Gerados a partir da foto gravada no fechamento. Cada download fica registrado na auditoria." : "Disponíveis depois do fechamento."}
        />
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {[
            ["vt", "Compra de VT por operadora"],
            ["fretado", "Passageiros de fretado por operadora"],
            ["folha", "Lista para a folha"],
            ["rateio", "Rateio por unidade, CNPJ e seção"],
          ].map(([k, label]) =>
            closed ? (
              <Button key={k} asChild variant="secondary" size="sm">
                <a href={`${exportBase}?tipo=${k}`}>
                  <Download />
                  {label}
                </a>
              </Button>
            ) : (
              <Button key={k} variant="secondary" size="sm" disabled>
                <Download />
                {label}
              </Button>
            ),
          )}
        </div>
      </Panel>

      <div className="mb-3 flex gap-1 rounded-md border border-line bg-surface p-0.5 text-[13px] w-fit">
        {[
          ["operadora", "Por operadora"],
          ["rateio", "Rateio"],
          ["itens", "Itens"],
        ].map(([k, label]) => (
          <Link key={k} href={`?ver=${k}`} className={`rounded px-3 py-1 ${ver === k ? "bg-petrol-600 text-white" : "text-ink-soft hover:text-ink"}`}>
            {label}
          </Link>
        ))}
      </div>

      <Panel>
        {items.length === 0 ? (
          <EmptyState title="Nenhum item nesta compra.">
            {p.kind === "MENSAL"
              ? "Não há ninguém com benefício ativo no dia 1º do mês."
              : "Não há inclusões no período. Confira as datas do período."}
          </EmptyState>
        ) : ver === "rateio" ? (
          <Table>
            <thead>
              <tr>
                <Th>Unidade</Th>
                <Th>Razão social</Th>
                <Th>Seção</Th>
                <Th className="text-right">VT</Th>
                <Th className="text-right">Fretado</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {rateio.map((r, i) => (
                <Tr key={i}>
                  <Td className="font-medium">{r.unit}</Td>
                  <Td className="text-ink-soft">{r.entity}</Td>
                  <Td className="text-ink-soft">{r.section}</Td>
                  <Td className="text-right">{fmtMoney(r.vt)}</Td>
                  <Td className="text-right">{fmtMoney(r.fretado)}</Td>
                  <Td className="text-right font-medium">{fmtMoney(r.total)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : ver === "itens" ? (
          <Table>
            <thead>
              <tr>
                <Th>Colaborador</Th>
                <Th>Benefício</Th>
                <Th className="text-right">Qtde</Th>
                <Th className="text-right">Valor</Th>
                <Th>Observação</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, idx) => (
                <Tr key={idx}>
                  <Td>
                    <p className="font-medium">{i.employee_name ?? i.business_unit_name}</p>
                    <p className="text-xs text-ink-faint">
                      {i.registration ? `Chapa ${i.registration} · ` : ""}
                      {i.legal_entity_name ?? ""} {i.section_name ? `· ${i.section_name}` : ""}
                    </p>
                  </Td>
                  <Td className="text-[13px]">
                    <CategoryBadge code={i.category_code} /> {i.item_kind !== "NORMAL" && <Badge tone="warn">{i.item_kind.toLowerCase()}</Badge>}
                    <p className="mt-1 text-ink-soft">{i.description}</p>
                    <p className="text-xs text-ink-faint">{i.operator_name}</p>
                  </Td>
                  <Td className="text-right">{i.quantity === null ? "—" : fmtNumber(i.quantity)}</Td>
                  <Td className="text-right font-medium">{fmtMoney(i.total)}</Td>
                  <Td className="max-w-[260px] text-xs text-ink-soft">
                    {i.notes}
                    {i.category_code === "VT" && !i.vt_card_number && <span className="block text-bad">Sem número de cartão</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Operadora</Th>
                <Th>Benefício</Th>
                <Th className="text-right">Colaboradores</Th>
                <Th className="text-right">Passagens</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {[...byOperator.entries()].map(([k, r]) => (
                <Tr key={k}>
                  <Td className="font-medium">{k.split("|")[1]}</Td>
                  <Td>
                    <CategoryBadge code={r.category} />
                  </Td>
                  <Td className="text-right">{r.n}</Td>
                  <Td className="text-right">{r.category === "VT" ? fmtNumber(r.qty) : "—"}</Td>
                  <Td className="text-right font-medium">{fmtMoney(r.total)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <div className="mt-4 flex flex-col gap-1">
        <Trace {...await traceOf(p)} />
        {p.closed_at && (
          <p className="text-xs text-ink-faint">
            Fechada por {p.closed_by ? dir.get(p.closed_by)?.username : "—"} em {fmtDateTime(p.closed_at)}
            {p.paid_at && `. Paga por ${p.paid_by ? dir.get(p.paid_by)?.username : "—"} em ${fmtDateTime(p.paid_at)}`}
          </p>
        )}
        {p.notes && <p className="whitespace-pre-line text-xs text-ink-soft">{p.notes}</p>}
      </div>
    </>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-[13px] text-ink-soft">{label}</dt>
      <dd className={`mt-1 text-[22px] font-semibold tracking-[-0.01em] ${strong ? "text-petrol-700" : ""}`}>{value}</dd>
    </div>
  );
}
