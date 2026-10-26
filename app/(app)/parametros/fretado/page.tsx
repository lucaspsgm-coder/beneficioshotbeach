import { Plus, Pencil } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getCatalog, getOrg, getAvailability } from "@/lib/data";
import { fmtMoney, costModelLabel } from "@/lib/format";
import { PageHeader, Panel, PanelHeader, Button, Field, Input, Select, Badge, EmptyState, Textarea, Checkbox, Notice } from "@/components/ui/primitives";
import { FormDialog, ConfirmAction } from "@/components/action-form";
import { ActiveField, Hidden } from "@/components/fields";
import { SeatMeter } from "@/components/seat-mark";
import { saveOperator, saveContract, saveSubsidy, deleteSubsidy, saveRoute, saveSchedule } from "../actions";
import type { Operator, CharterContract, CharterRoute, CharterSchedule, BusinessUnit, CharterSubsidy } from "@/lib/types";

export default async function FretadoPage() {
  await requireAdmin();
  const [cat, org, avail] = await Promise.all([getCatalog(), getOrg(), getAvailability()]);
  const operators = cat.operators.filter((o) => o.category_code === "FRETADO");

  return (
    <>
      <PageHeader
        title="Fretado"
        description="Operadora → contrato → rota → horário. O contrato define como o custo é calculado e dividido entre as unidades."
        actions={
          <FormDialog trigger={<Button variant="secondary"><Plus />Operadora</Button>} title="Nova operadora de fretado" action={saveOperator}>
            <OperatorFields />
          </FormDialog>
        }
      />

      {operators.length === 0 ? (
        <Panel>
          <EmptyState title="Nenhuma operadora de fretado cadastrada.">Cadastre a operadora, depois os contratos, as rotas e os horários com a quantidade de assentos.</EmptyState>
        </Panel>
      ) : (
        <div className="flex flex-col gap-8">
          {operators.map((op) => {
            const contracts = cat.contracts.filter((c) => c.operator_id === op.id);
            return (
              <section key={op.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-[17px] font-semibold">
                      {op.name} {!op.active && <Badge>Inativa</Badge>}
                    </h2>
                    <p className="text-[13px] text-ink-soft">
                      Entrada no meio do mês: {op.entry_billing === "MES_CHEIO" ? "cobra o mês cheio" : "cobra proporcional"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <FormDialog trigger={<Button variant="ghost" size="sm"><Pencil />Editar operadora</Button>} title="Editar operadora" action={saveOperator}>
                      <Hidden name="id" value={op.id} />
                      <OperatorFields op={op} />
                      <ActiveField defaultChecked={op.active} />
                    </FormDialog>
                    <FormDialog trigger={<Button size="sm"><Plus />Contrato</Button>} title={`Novo contrato · ${op.name}`} action={saveContract}>
                      <Hidden name="operator_id" value={op.id} />
                      <ContractFields />
                    </FormDialog>
                  </div>
                </div>
                {contracts.length === 0 ? (
                  <Panel>
                    <EmptyState title="Sem contratos para esta operadora." />
                  </Panel>
                ) : (
                  <div className="flex flex-col gap-4">
                    {contracts.map((c) => (
                      <ContractPanel
                        key={c.id}
                        contract={c}
                        routes={cat.routes.filter((r) => r.contract_id === c.id)}
                        schedules={cat.schedules}
                        subsidies={cat.subsidies.filter((s) => s.contract_id === c.id)}
                        units={org.units}
                        avail={avail}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function ContractPanel({
  contract: c,
  routes,
  schedules,
  subsidies,
  units,
  avail,
}: {
  contract: CharterContract;
  routes: CharterRoute[];
  schedules: CharterSchedule[];
  subsidies: CharterSubsidy[];
  units: BusinessUnit[];
  avail: Map<string, { seats: number | null; taken: number }>;
}) {
  const desc =
    c.cost_model === "POR_ASSENTO"
      ? "Cada rota tem o valor do seu assento."
      : `${fmtMoney(c.monthly_value)} por mês, divididos pelos assentos ocupados no corte.`;
  return (
    <Panel>
      <PanelHeader
        title={c.name}
        description={
          <>
            <span className="font-medium text-ink">{costModelLabel[c.cost_model]}</span> · {desc}
          </>
        }
        actions={
          <>
            {!c.active && <Badge>Inativo</Badge>}
            <FormDialog trigger={<Button variant="ghost" size="sm">Editar</Button>} title="Editar contrato" action={saveContract}>
              <Hidden name="id" value={c.id} />
              <Hidden name="operator_id" value={c.operator_id} />
              <ContractFields contract={c} />
              <ActiveField defaultChecked={c.active} />
            </FormDialog>
            <FormDialog trigger={<Button variant="secondary" size="sm"><Plus />Rota</Button>} title={`Nova rota · ${c.name}`} action={saveRoute}>
              <Hidden name="contract_id" value={c.id} />
              <RouteFields contract={c} />
            </FormDialog>
          </>
        }
      />

      {c.cost_model === "MISTO" && (
        <div className="border-b border-line bg-paper/50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-medium">Subsídios:</span>
            {subsidies.length === 0 && <span className="text-ink-soft">nenhum. Sem subsídio, o misto funciona como contrato fechado.</span>}
            {subsidies.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-0.5 pl-2.5 pr-1">
                {units.find((u) => u.id === s.business_unit_id)?.name}: {s.subsidy_type === "VALOR" ? fmtMoney(s.value) : `${s.value}%`}
                {s.joins_rateio ? " + rateio" : " (fora do rateio)"}
                <ConfirmAction
                  action={deleteSubsidy.bind(null, s.id)}
                  label="×"
                  variant="ghost"
                  size="icon"
                  title="Remover subsídio?"
                  description="O próximo fechamento já usa a nova regra."
                  confirmLabel="Remover"
                />
              </span>
            ))}
            <FormDialog trigger={<Button variant="link" size="sm"><Plus />Subsídio</Button>} title="Novo subsídio" action={saveSubsidy}>
              <Hidden name="contract_id" value={c.id} />
              <Field label="Unidade que subsidia" required>
                <Select name="business_unit_id" required>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo" required>
                  <Select name="subsidy_type" defaultValue="VALOR">
                    <option value="VALOR">Valor fixo (R$)</option>
                    <option value="PERCENTUAL">Percentual do contrato (%)</option>
                  </Select>
                </Field>
                <Field label="Valor" required>
                  <Input name="value" inputMode="decimal" placeholder="0,00" required />
                </Field>
              </div>
              <Checkbox name="joins_rateio" label="A unidade também entra no rateio do saldo" defaultChecked />
              <Notice>
                Exemplo: contrato de R$ 30.000, a unidade A subsidia R$ 10.000 e entra no rateio. Os R$ 20.000 restantes são divididos pelos assentos
                ocupados de todas as unidades.
              </Notice>
            </FormDialog>
          </div>
        </div>
      )}

      {routes.length === 0 ? (
        <EmptyState title="Sem rotas neste contrato." />
      ) : (
        <ul className="divide-y divide-line">
          {routes.map((r) => {
            const sch = schedules.filter((s) => s.route_id === r.id);
            return (
              <li key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {r.name}
                    {c.cost_model === "POR_ASSENTO" && <span className="ml-2 font-normal text-ink-soft">{fmtMoney(r.seat_price)} por assento</span>}
                    {!r.active && <Badge className="ml-2">Inativa</Badge>}
                  </p>
                  <div className="flex gap-1">
                    <FormDialog trigger={<Button variant="ghost" size="sm">Editar rota</Button>} title="Editar rota" action={saveRoute}>
                      <Hidden name="id" value={r.id} />
                      <Hidden name="contract_id" value={r.contract_id} />
                      <RouteFields contract={c} route={r} />
                      <ActiveField defaultChecked={r.active} />
                    </FormDialog>
                    <FormDialog trigger={<Button variant="secondary" size="sm"><Plus />Horário</Button>} title={`Novo horário · ${r.name}`} action={saveSchedule}>
                      <Hidden name="route_id" value={r.id} />
                      <ScheduleFields />
                    </FormDialog>
                  </div>
                </div>
                {sch.length > 0 && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {sch.map((s) => {
                      const a = avail.get(s.id) ?? { seats: s.seats, taken: 0 };
                      return (
                        <FormDialog
                          key={s.id}
                          trigger={
                            <button className={`flex flex-col gap-2 rounded-md border px-3 py-2.5 text-left transition-colors hover:border-petrol-200 hover:bg-petrol-50/40 ${s.active ? "border-line" : "border-dashed border-line opacity-60"}`}>
                              <span className="text-sm font-medium">
                                {s.arrival_time} <span className="text-ink-faint">/</span> {s.departure_time}
                              </span>
                              <SeatMeter seats={a.seats} taken={a.taken} />
                            </button>
                          }
                          title="Editar horário"
                          action={saveSchedule}
                        >
                          <Hidden name="id" value={s.id} />
                          <Hidden name="route_id" value={s.route_id} />
                          <ScheduleFields schedule={s} />
                          <ActiveField defaultChecked={s.active} />
                        </FormDialog>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function OperatorFields({ op }: { op?: Operator }) {
  return (
    <>
      <Hidden name="category_code" value="FRETADO" />
      <Field label="Nome" required>
        <Input name="name" defaultValue={op?.name} required />
      </Field>
      <Field label="Quem entra no meio do mês" hint="Vale para inclusões após o corte e admissões.">
        <Select name="entry_billing" defaultValue={op?.entry_billing ?? "MES_CHEIO"}>
          <option value="MES_CHEIO">Cobra o mês cheio</option>
          <option value="PROPORCIONAL">Cobra proporcional aos dias</option>
        </Select>
      </Field>
      <Field label="Observações">
        <Textarea name="notes" defaultValue={op?.notes ?? ""} />
      </Field>
    </>
  );
}

function ContractFields({ contract }: { contract?: CharterContract }) {
  return (
    <>
      <Field label="Nome do contrato" required>
        <Input name="name" defaultValue={contract?.name} placeholder="Ex.: Contrato 2026 – 4 rotas" required />
      </Field>
      <Field label="Modelo de custo" required>
        <Select name="cost_model" defaultValue={contract?.cost_model ?? "POR_ASSENTO"}>
          <option value="POR_ASSENTO">Por assento (valor em cada rota)</option>
          <option value="FECHADO">Contrato fechado (valor ÷ assentos ocupados)</option>
          <option value="MISTO">Misto (subsídio de unidade + rateio do saldo)</option>
        </Select>
      </Field>
      <Field label="Valor mensal do contrato (R$)" hint="Obrigatório para fechado e misto. Deixe em branco no modelo por assento.">
        <Input name="monthly_value" inputMode="decimal" defaultValue={contract?.monthly_value ? String(contract.monthly_value).replace(".", ",") : ""} placeholder="0,00" />
      </Field>
    </>
  );
}

function RouteFields({ contract, route }: { contract: CharterContract; route?: CharterRoute }) {
  return (
    <>
      <Field label="Rota" required>
        <Input name="name" defaultValue={route?.name} placeholder="Ex.: Cidade A × Cidade B" required />
      </Field>
      {contract.cost_model === "POR_ASSENTO" ? (
        <Field label="Valor do assento por mês (R$)" required>
          <Input name="seat_price" inputMode="decimal" defaultValue={route?.seat_price ? String(route.seat_price).replace(".", ",") : ""} required />
        </Field>
      ) : (
        <Hidden name="seat_price" value="" />
      )}
    </>
  );
}

function ScheduleFields({ schedule }: { schedule?: CharterSchedule }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desembarque" required hint="Chegada na unidade.">
          <Input name="arrival_time" defaultValue={schedule?.arrival_time} placeholder="08h20" required />
        </Field>
        <Field label="Embarque" required hint="Saída da unidade.">
          <Input name="departure_time" defaultValue={schedule?.departure_time} placeholder="16h20" required />
        </Field>
      </div>
      <Field label="Assentos" hint="Deixe em branco para capacidade ilimitada.">
        <Input name="seats" inputMode="numeric" defaultValue={schedule?.seats ?? ""} placeholder="Ex.: 40" />
      </Field>
    </>
  );
}
