import { requireAdmin } from "@/lib/auth";
import { getCatalog, traceOf } from "@/lib/data";
import { PageHeader, Panel, PanelHeader, Field, Input, Checkbox, Trace } from "@/components/ui/primitives";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Hidden } from "@/components/fields";
import { saveCategory, saveGroup } from "../actions";

export default async function RegrasPage() {
  await requireAdmin();
  const cat = await getCatalog();

  return (
    <>
      <PageHeader
        title="Regras"
        description="Parâmetros por grupo e por categoria. As regras por operadora e por contrato ficam em Vale-transporte e Fretado."
      />
      <div className="flex flex-col gap-6">
        {await Promise.all(
          cat.groups.map(async (g) => (
            <Panel key={g.code}>
              <PanelHeader
                title={`Grupo ${g.name}`}
                description="Quantos benefícios deste grupo um colaborador pode ter ao mesmo tempo. Hoje a regra é benefício único."
              />
              <ActionForm action={saveGroup} className="flex flex-wrap items-end gap-4 px-5 py-4">
                <Hidden name="code" value={g.code} />
                <Field label="Nome">
                  <Input name="name" defaultValue={g.name} className="w-56" />
                </Field>
                <Field label="Benefícios ativos por colaborador">
                  <Input name="max_active" type="number" min={1} defaultValue={g.max_active} className="w-32" />
                </Field>
                <SubmitButton variant="secondary">Salvar</SubmitButton>
                <Trace className="basis-full" {...await traceOf(g)} />
              </ActionForm>
            </Panel>
          )),
        )}

        {await Promise.all(
          cat.categories.map(async (c) => (
            <Panel key={c.code}>
              <PanelHeader
                title={c.name}
                description={
                  c.code === "VT"
                    ? "A compra mensal usa os dias-base × passagens por dia. Na admissão, o proporcional conta os dias restantes do mês (com o dia da admissão), menos os domingos."
                    : "No fretado, a cobrança por assento ou por contrato vem do cadastro do contrato; a entrada no meio do mês segue a regra de cada operadora."
                }
              />
              <ActionForm action={saveCategory} className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <Hidden name="code" value={c.code} />
                <Field label="Nome">
                  <Input name="name" defaultValue={c.name} />
                </Field>
                <Field label="Dias-base da compra">
                  <Input name="base_days" type="number" min={1} max={31} defaultValue={c.base_days} className="w-32" />
                </Field>
                <Field label="Passagens por dia">
                  <Input name="passes_per_day" type="number" min={0} defaultValue={c.passes_per_day} className="w-32" />
                </Field>
                <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
                  <Checkbox name="admission_proportional" label="Admissão proporcional" defaultChecked={c.admission_proportional} />
                  <SubmitButton variant="secondary">Salvar</SubmitButton>
                </div>
                <Trace className="sm:col-span-3" {...await traceOf(c)} />
              </ActionForm>
            </Panel>
          )),
        )}
      </div>
    </>
  );
}
