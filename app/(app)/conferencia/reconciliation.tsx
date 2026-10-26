"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, ScanSearch } from "lucide-react";
import { Panel, PanelHeader, Field, Input, Button, Table, Th, Td, Tr, EmptyState, Notice } from "@/components/ui/primitives";
import { runReconciliation, type Divergence } from "./actions";

const GROUPS: { kind: Divergence["kind"]; title: string; description: string }[] = [
  {
    kind: "SEM_NA_FOLHA",
    title: "Com benefício no sistema, sem lançamento na folha",
    description: "Desconto não está sendo feito, ou o colaborador já saiu e a exclusão não foi lançada.",
  },
  {
    kind: "SEM_NO_SISTEMA",
    title: "Lançado na folha, sem benefício no sistema",
    description: "Desconto indevido ou inclusão não lançada.",
  },
  { kind: "CATEGORIA_DIFERENTE", title: "Benefício diferente", description: "A folha e o sistema discordam entre VT e fretado." },
];

export function Reconciliation() {
  const [result, setResult] = React.useState<{ divergences: Divergence[]; checked: number; matched: number } | null>(null);
  const [pending, start] = React.useTransition();

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <form
          className="flex flex-wrap items-end gap-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await runReconciliation(fd);
              if (!r.ok) return void toast.error(r.error);
              setResult(r.data!);
            });
          }}
        >
          <Field label="Ativos da folha (.xlsx)" required className="min-w-[280px] flex-1" hint="Chapas sem os zeros à esquerda também são reconhecidas.">
            <Input type="file" name="file" accept=".xlsx" required className="h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-petrol-50 file:px-3 file:py-1 file:text-petrol-700" />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <ScanSearch />}
            Conferir
          </Button>
        </form>
      </Panel>

      {result && (
        <>
          <Notice tone={result.divergences.length ? "warn" : "ok"}>
            {result.checked} linha(s) na folha, {result.matched} colaborador(es) encontrados no sistema,{" "}
            {result.divergences.length ? `${result.divergences.length} divergência(s).` : "nenhuma divergência."}
          </Notice>
          {GROUPS.map((g) => {
            const list = result.divergences.filter((d) => d.kind === g.kind);
            return (
              <Panel key={g.kind}>
                <PanelHeader title={`${g.title} (${list.length})`} description={g.description} />
                {list.length === 0 ? (
                  <EmptyState title="Nada aqui." />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Colaborador</Th>
                        <Th>No sistema</Th>
                        <Th>Na folha</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((d, i) => (
                        <Tr key={i}>
                          <Td>
                            {d.employeeId ? (
                              <Link href={`/colaboradores/${d.employeeId}`} className="font-medium hover:text-petrol-600">
                                {d.name}
                              </Link>
                            ) : (
                              <span className="font-medium">{d.name}</span>
                            )}
                            <p className="text-xs text-ink-faint">Chapa {d.registration}</p>
                          </Td>
                          <Td>{d.system ?? "Sem benefício"}</Td>
                          <Td>{d.payroll ?? "Não está no arquivo"}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Panel>
            );
          })}
        </>
      )}
    </div>
  );
}
