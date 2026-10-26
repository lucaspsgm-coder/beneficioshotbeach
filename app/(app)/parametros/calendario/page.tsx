import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMonth, todayBR } from "@/lib/format";
import { addMonths, toISO, parseISO } from "@/lib/calc";
import { PageHeader, Panel, Button, Field, Input, Textarea, Table, Th, Td, Tr, EmptyState, Badge } from "@/components/ui/primitives";
import { FormDialog } from "@/components/action-form";
import { Hidden } from "@/components/fields";
import { saveCalendar } from "../actions";
import type { CalendarMonth } from "@/lib/types";

export default async function CalendarioPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("calendar_months").select("*").order("reference_month", { ascending: false });
  const rows = (data ?? []) as CalendarMonth[];
  const today = todayBR();

  // sugestão para o próximo mês: janela até o dia 20, aprovação no dia 20
  const latest = rows[0]?.reference_month;
  const nextRef = latest ? addMonths(latest, 1) : addMonths(`${today.slice(0, 7)}-01`, 1);
  const prev = parseISO(addMonths(nextRef, -1));
  const suggestion = {
    reference_month: nextRef.slice(0, 7),
    window_open: toISO(prev.y, prev.m, 1),
    window_close: toISO(prev.y, prev.m, 20),
    cutoff_date: toISO(prev.y, prev.m, 20),
    approval_date: toISO(prev.y, prev.m, 20),
  };

  return (
    <>
      <PageHeader
        title="Calendário operacional"
        description="Definido mês a mês. Fora da janela, inclusões mensais, exclusões e alterações cadastrais ficam travadas. O corte é a foto da ocupação usada na compra e no rateio."
        actions={
          <FormDialog trigger={<Button><Plus />Novo mês</Button>} title="Novo mês no calendário" action={saveCalendar} wide>
            <CalendarFields c={suggestion} />
          </FormDialog>
        }
      />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Nenhum mês no calendário.">Sem calendário, o RH não consegue lançar inclusões e exclusões mensais.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Compra de</Th>
                <Th>Janela do RH</Th>
                <Th>Corte</Th>
                <Th>Aprovação das trocas</Th>
                <Th>Compra</Th>
                <Th>Crédito</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = today >= r.window_open && today <= r.window_close;
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium capitalize">
                      {fmtMonth(r.reference_month)}
                      {open && <Badge tone="petrol" className="ml-2 normal-case">Janela aberta</Badge>}
                    </Td>
                    <Td>
                      {fmtDate(r.window_open)} a {fmtDate(r.window_close)}
                    </Td>
                    <Td>{fmtDate(r.cutoff_date)}</Td>
                    <Td>{fmtDate(r.approval_date)}</Td>
                    <Td>{fmtDate(r.purchase_date)}</Td>
                    <Td>{fmtDate(r.credit_date)}</Td>
                    <Td className="text-right">
                      <FormDialog trigger={<Button variant="ghost" size="sm">Editar</Button>} title="Editar mês" action={saveCalendar} wide>
                        <Hidden name="id" value={r.id} />
                        <CalendarFields c={{ ...r, reference_month: r.reference_month.slice(0, 7) }} />
                      </FormDialog>
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

function CalendarFields({ c }: { c: Partial<Omit<CalendarMonth, "reference_month">> & { reference_month: string } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Mês da compra" required className="sm:col-span-2" hint="O mês em que os colaboradores vão usar o benefício.">
        <Input type="month" name="reference_month" defaultValue={c.reference_month} required />
      </Field>
      <Field label="Abertura da janela" required>
        <Input type="date" name="window_open" defaultValue={c.window_open ?? ""} required />
      </Field>
      <Field label="Fechamento da janela" required>
        <Input type="date" name="window_close" defaultValue={c.window_close ?? ""} required />
      </Field>
      <Field label="Corte" required hint="Dia 20 ou o próximo dia útil.">
        <Input type="date" name="cutoff_date" defaultValue={c.cutoff_date ?? ""} required />
      </Field>
      <Field label="Aprovação das trocas e da fila" required hint="O aprovado começa a valer no mês seguinte.">
        <Input type="date" name="approval_date" defaultValue={c.approval_date ?? ""} required />
      </Field>
      <Field label="Data da compra">
        <Input type="date" name="purchase_date" defaultValue={c.purchase_date ?? ""} />
      </Field>
      <Field label="Data do crédito">
        <Input type="date" name="credit_date" defaultValue={c.credit_date ?? ""} />
      </Field>
      <Field label="Observações" className="sm:col-span-2">
        <Textarea name="notes" defaultValue={c.notes ?? ""} />
      </Field>
    </div>
  );
}
