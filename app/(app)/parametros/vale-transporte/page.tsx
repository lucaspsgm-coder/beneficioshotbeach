import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getCatalog } from "@/lib/data";
import { fmtMoney } from "@/lib/format";
import { PageHeader, Panel, PanelHeader, Button, Field, Input, Select, Badge, EmptyState, Table, Th, Td, Tr, Textarea } from "@/components/ui/primitives";
import { FormDialog } from "@/components/action-form";
import { ActiveField, Hidden } from "@/components/fields";
import { saveOperator, saveFare } from "../actions";
import type { Operator, VtFare } from "@/lib/types";

export default async function ValeTransportePage() {
  await requireAdmin();
  const cat = await getCatalog();
  const operators = cat.operators.filter((o) => o.category_code === "VT");
  const fares = cat.fares;
  const vt = cat.categories.find((c) => c.code === "VT");
  const passesMonth = (vt?.base_days ?? 26) * (vt?.passes_per_day ?? 2);

  return (
    <>
      <PageHeader
        title="Vale-transporte"
        description="Cada destino resolve sozinho a linha, a operadora e a tarifa. O RH só escolhe o destino."
      />

      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHeader
            title="Operadoras"
            actions={
              <FormDialog trigger={<Button variant="secondary" size="sm"><Plus />Operadora</Button>} title="Nova operadora de VT" action={saveOperator}>
                <OperatorFields />
              </FormDialog>
            }
          />
          {operators.length === 0 ? (
            <EmptyState title="Nenhuma operadora de VT cadastrada." />
          ) : (
            <ul className="divide-y divide-line">
              {operators.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <p className="font-medium">
                      {o.name} {!o.active && <Badge className="ml-2">Inativa</Badge>}
                    </p>
                    <p className="text-xs text-ink-faint">{fares.filter((f) => f.operator_id === o.id && f.active).length} destino(s) ativo(s)</p>
                  </div>
                  <FormDialog trigger={<Button variant="ghost" size="sm">Editar</Button>} title="Editar operadora" action={saveOperator}>
                    <Hidden name="id" value={o.id} />
                    <OperatorFields op={o} />
                    <ActiveField defaultChecked={o.active} />
                  </FormDialog>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Destinos e tarifas"
            description="Um destino ativo por par origem → destino. Se o destino é uma parada no meio de uma linha, informe a linha completa e a tarifa até a parada."
            actions={
              operators.length > 0 && (
                <FormDialog trigger={<Button size="sm"><Plus />Destino</Button>} title="Novo destino de VT" action={saveFare}>
                  <FareFields operators={operators} />
                </FormDialog>
              )
            }
          />
          {fares.length === 0 ? (
            <EmptyState title="Nenhum destino cadastrado.">Cadastre uma operadora e depois os destinos que ela atende.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Origem → destino</Th>
                  <Th>Linha</Th>
                  <Th>Operadora</Th>
                  <Th className="text-right">Passagem</Th>
                  <Th className="text-right">Por mês ({passesMonth} passagens)</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {fares.map((f) => (
                  <Tr key={f.id} className={f.active ? "" : "text-ink-faint"}>
                    <Td className="font-medium">
                      {f.origin} → {f.destination} {!f.active && <Badge className="ml-2">Inativo</Badge>}
                    </Td>
                    <Td className="text-ink-soft">{f.line_name}</Td>
                    <Td className="text-ink-soft">{operators.find((o) => o.id === f.operator_id)?.name ?? "—"}</Td>
                    <Td className="text-right">{fmtMoney(f.fare)}</Td>
                    <Td className="text-right text-ink-soft">{fmtMoney(f.fare * passesMonth)}</Td>
                    <Td className="text-right">
                      <FormDialog trigger={<Button variant="ghost" size="sm">Editar</Button>} title="Editar destino" action={saveFare}>
                        <Hidden name="id" value={f.id} />
                        <FareFields operators={operators} fare={f} />
                        <ActiveField defaultChecked={f.active} />
                      </FormDialog>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}

function OperatorFields({ op }: { op?: Operator }) {
  return (
    <>
      <Hidden name="category_code" value="VT" />
      <Field label="Nome" required>
        <Input name="name" defaultValue={op?.name} required />
      </Field>
      <Field label="Observações" hint="Ex.: contato, layout do arquivo de compra.">
        <Textarea name="notes" defaultValue={op?.notes ?? ""} />
      </Field>
    </>
  );
}

function FareFields({ operators, fare }: { operators: Operator[]; fare?: VtFare }) {
  return (
    <>
      <Field label="Operadora" required>
        <Select name="operator_id" defaultValue={fare?.operator_id} required>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Origem" required>
          <Input name="origin" defaultValue={fare?.origin ?? "Olímpia"} required />
        </Field>
        <Field label="Destino" required>
          <Input name="destination" defaultValue={fare?.destination} placeholder="Ex.: Cidade B" required />
        </Field>
      </div>
      <Field label="Linha" required hint="Nome da linha comprada, ex.: Olímpia × Cidade F.">
        <Input name="line_name" defaultValue={fare?.line_name} required />
      </Field>
      <Field label="Valor da passagem (R$)" required>
        <Input name="fare" inputMode="decimal" defaultValue={fare ? String(fare.fare).replace(".", ",") : ""} placeholder="0,00" required />
      </Field>
    </>
  );
}
