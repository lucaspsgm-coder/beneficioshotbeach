"use client";

import * as React from "react";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Panel, PanelHeader, Field, Input, Button, Table, Th, Td, Tr, Badge, Notice } from "@/components/ui/primitives";
import { validateLoad, importLoad, type LoadRow } from "./actions";

export function LoadWizard({ defaultStart }: { defaultStart: string }) {
  const [rows, setRows] = React.useState<LoadRow[] | null>(null);
  const [results, setResults] = React.useState<Map<string, { ok: boolean; error?: string }> | null>(null);
  const [start, setStart] = React.useState(defaultStart);
  const [pending, startTransition] = React.useTransition();

  const valid = rows?.filter((r) => r.ok) ?? [];
  const invalid = rows?.filter((r) => !r.ok) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <PanelHeader title="1. Arquivo" description="A validação não grava nada. Ela confere unidade, razão social, seção, destino, rota, horário, assentos e chapas repetidas." />
        <form
          className="flex flex-wrap items-end gap-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              setResults(null);
              const r = await validateLoad(fd);
              if (!r.ok) return void toast.error(r.error);
              setRows(r.data!.rows);
              if (r.message) toast.message(r.message);
            });
          }}
        >
          <Field label="Planilha de carga (.xlsx)" required className="min-w-[280px] flex-1">
            <Input type="file" name="file" accept=".xlsx" required className="h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-petrol-50 file:px-3 file:py-1 file:text-petrol-700" />
          </Field>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            Validar arquivo
          </Button>
        </form>
      </Panel>

      {rows && (
        <Panel>
          <PanelHeader
            title="2. Conferência"
            description={`${valid.length} linha(s) prontas para importar, ${invalid.length} com problema. Corrija na planilha e valide de novo, ou importe só as válidas.`}
          />
          <div className="flex flex-wrap items-end gap-4 border-b border-line px-5 py-4">
            <Field label="Início dos benefícios" hint="Normalmente o dia 1º do mês do go-live." required>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-44" />
            </Field>
            <Button
              disabled={pending || valid.length === 0 || !!results}
              onClick={() =>
                startTransition(async () => {
                  const r = await importLoad(JSON.stringify(valid.map((v) => v.payload)), start);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(r.message);
                  setResults(new Map(r.data!.results.map((x) => [`${x.sheet}|${x.row}`, x])));
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Importar {valid.length} linha(s) válida(s)
            </Button>
          </div>
          {results && (
            <div className="px-5 pt-4">
              <Notice tone="ok">Importação concluída. Cada linha gravada aparece como movimentação “Carga inicial do go-live”, com o seu usuário.</Notice>
            </div>
          )}
          <Table>
            <thead>
              <tr>
                <Th>Aba / linha</Th>
                <Th>Colaborador</Th>
                <Th>Opção</Th>
                <Th>Resultado</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const res = results?.get(`${r.sheet}|${r.row}`);
                const ok = res ? res.ok : r.ok;
                const error = res ? res.error : r.error;
                return (
                  <Tr key={`${r.sheet}-${r.row}`}>
                    <Td className="whitespace-nowrap text-ink-soft">
                      {r.sheet} · {r.row}
                    </Td>
                    <Td>
                      <p className="font-medium">{r.name || "—"}</p>
                      <p className="text-xs text-ink-faint">Chapa {r.registration || "—"}</p>
                    </Td>
                    <Td className="text-[13px] text-ink-soft">{r.option}</Td>
                    <Td>
                      {ok ? (
                        <Badge tone="ok">
                          <CheckCircle2 className="size-3.5" />
                          {res ? "Importada" : "Pronta"}
                        </Badge>
                      ) : (
                        <span className="flex items-start gap-1.5 text-[13px] text-bad">
                          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                          {error}
                        </span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
