import { Plus, Pencil } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getOrg } from "@/lib/data";
import { PageHeader, Panel, PanelHeader, Button, Field, Input, Select, Badge, EmptyState } from "@/components/ui/primitives";
import { FormDialog } from "@/components/action-form";
import { ActiveField, Hidden } from "@/components/fields";
import { saveUnit, saveEntity, saveSection } from "../actions";
import type { BusinessUnit, LegalEntity, Section } from "@/lib/types";

export default async function EstruturaPage() {
  await requireAdmin();
  const { units, entities, sections } = await getOrg();

  return (
    <>
      <PageHeader
        title="Estrutura"
        description="Unidade, razão social (CNPJ) e seção. É a cascata que o RH usa no formulário e a base do rateio de custos."
        actions={
          <FormDialog trigger={<Button><Plus />Nova unidade</Button>} title="Nova unidade" action={saveUnit}>
            <Field label="Nome da unidade" required>
              <Input name="name" placeholder="Ex.: HBS" required />
            </Field>
          </FormDialog>
        }
      />

      {units.length === 0 ? (
        <Panel>
          <EmptyState title="Nenhuma unidade cadastrada.">Cadastre as unidades primeiro. Depois, as razões sociais de cada uma e as seções.</EmptyState>
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          {units.map((u) => (
            <UnitPanel
              key={u.id}
              unit={u}
              entities={entities.filter((e) => e.business_unit_id === u.id)}
              sections={sections}
              allUnits={units}
            />
          ))}
        </div>
      )}
    </>
  );
}

function UnitPanel({ unit, entities, sections, allUnits }: { unit: BusinessUnit; entities: LegalEntity[]; sections: Section[]; allUnits: BusinessUnit[] }) {
  return (
    <Panel>
      <PanelHeader
        title={unit.name}
        description={`${entities.length} razão(ões) social(is)`}
        actions={
          <>
            {!unit.active && <Badge>Inativa</Badge>}
            <FormDialog trigger={<Button variant="ghost" size="sm"><Pencil />Editar</Button>} title="Editar unidade" action={saveUnit}>
              <Hidden name="id" value={unit.id} />
              <Field label="Nome da unidade" required>
                <Input name="name" defaultValue={unit.name} required />
              </Field>
              <ActiveField defaultChecked={unit.active} />
            </FormDialog>
            <FormDialog trigger={<Button variant="secondary" size="sm"><Plus />Razão social</Button>} title={`Nova razão social em ${unit.name}`} action={saveEntity}>
              <Hidden name="business_unit_id" value={unit.id} />
              <Field label="Razão social" required>
                <Input name="name" placeholder="Ex.: HB Tour HBS" required />
              </Field>
              <Field label="CNPJ">
                <Input name="cnpj" placeholder="00.000.000/0000-00" />
              </Field>
            </FormDialog>
          </>
        }
      />
      {entities.length === 0 ? (
        <EmptyState title="Sem razões sociais nesta unidade." />
      ) : (
        <ul className="divide-y divide-line">
          {entities.map((e) => {
            const secs = sections.filter((s) => s.legal_entity_id === e.id);
            return (
              <li key={e.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{e.name}</p>
                    {!e.active && <Badge>Inativa</Badge>}
                  </div>
                  <p className="text-xs text-ink-faint">{e.cnpj ?? "CNPJ não informado"}</p>
                  <div className="mt-2 flex gap-1">
                    <FormDialog trigger={<Button variant="link" size="sm">Editar</Button>} title="Editar razão social" action={saveEntity}>
                      <Hidden name="id" value={e.id} />
                      <Field label="Unidade" required>
                        <Select name="business_unit_id" defaultValue={e.business_unit_id}>
                          {allUnits.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Razão social" required>
                        <Input name="name" defaultValue={e.name} required />
                      </Field>
                      <Field label="CNPJ">
                        <Input name="cnpj" defaultValue={e.cnpj ?? ""} />
                      </Field>
                      <ActiveField defaultChecked={e.active} />
                    </FormDialog>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {secs.map((s) => (
                    <FormDialog
                      key={s.id}
                      trigger={
                        <button className={`rounded-full border px-2.5 py-1 text-[13px] transition-colors hover:border-petrol-200 hover:bg-petrol-50 ${s.active ? "border-line text-ink" : "border-dashed border-line text-ink-faint"}`}>
                          {s.name}
                        </button>
                      }
                      title="Editar seção"
                      action={saveSection}
                    >
                      <Hidden name="id" value={s.id} />
                      <Hidden name="legal_entity_id" value={s.legal_entity_id} />
                      <Field label="Seção" required>
                        <Input name="name" defaultValue={s.name} required />
                      </Field>
                      <ActiveField defaultChecked={s.active} />
                    </FormDialog>
                  ))}
                  <FormDialog
                    trigger={<button className="inline-flex items-center gap-1 rounded-full border border-dashed border-petrol-200 px-2.5 py-1 text-[13px] text-petrol-600 hover:bg-petrol-50"><Plus className="size-3.5" />Seção</button>}
                    title={`Nova seção em ${e.name}`}
                    action={saveSection}
                  >
                    <Hidden name="legal_entity_id" value={e.id} />
                    <Field label="Nome da seção" required>
                      <Input name="name" placeholder="Ex.: Recepção" required />
                    </Field>
                  </FormDialog>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
