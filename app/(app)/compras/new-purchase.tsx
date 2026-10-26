"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createPurchase } from "./actions";

export function NewPurchaseDialog({ defaultMonth, today, trigger }: { defaultMonth: string; today: string; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState("MENSAL");
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{trigger}</Button>
      </DialogTrigger>
      <DialogContent title="Nova compra" description="A compra começa aberta, com a prévia calculada na hora.">
        <ActionForm
          action={createPurchase}
          onSuccess={(r) => {
            setOpen(false);
            if (r.ok && r.data) router.push(`/compras/${(r.data as { id: string }).id}`);
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Tipo" required>
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="MENSAL">Mensal</option>
              <option value="ADMISSIONAL">Admissional (semanal)</option>
              <option value="COMPLEMENTAR">Complementar (exceções aprovadas)</option>
            </Select>
          </Field>
          {kind === "MENSAL" ? (
            <Field label="Mês de uso" required>
              <Input type="month" name="reference_month" defaultValue={defaultMonth} required />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início do período" required hint="Data de início do benefício.">
                <Input type="date" name="period_start" defaultValue={today} required />
              </Field>
              <Field label="Fim do período" required>
                <Input type="date" name="period_end" defaultValue={today} required />
              </Field>
            </div>
          )}
          <Field label="Observações">
            <Textarea name="notes" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <SubmitButton>Criar compra</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
