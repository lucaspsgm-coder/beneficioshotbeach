"use client";

import * as React from "react";
import { Hourglass, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate, fmtMonth } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Panel, PanelHeader, Field, Input, Select, Textarea, Notice, Button } from "@/components/ui/primitives";
import { BenefitPicker, emptyPick, type PickerValue } from "@/components/benefit-picker";
import type { PickerData } from "@/lib/picker";
import { submitInclusion } from "../actions";

type InclusionType = "INCLUSAO_ADMISSIONAL" | "INCLUSAO_MENSAL" | "PEDIDO_COMPLEMENTAR";

const TYPES: { value: InclusionType; title: string; detail: string }[] = [
  { value: "INCLUSAO_ADMISSIONAL", title: "Admissão", detail: "Entra no lote admissional, com valor proporcional." },
  { value: "INCLUSAO_MENSAL", title: "Inclusão mensal", detail: "Entra na compra do mês da janela aberta." },
  { value: "PEDIDO_COMPLEMENTAR", title: "Pedido complementar", detail: "Exceção fora da janela. Precisa de justificativa e aprovação." },
];

export function InclusionForm(props: {
  initialType: InclusionType;
  initialEmployee: string;
  window: { reference: string; close: string } | null;
  units: { id: string; name: string }[];
  entities: { id: string; name: string; unit: string }[];
  sections: { id: string; name: string; entity: string }[];
  employees: { id: string; label: string }[];
  picker: PickerData;
  passesPerMonth: number;
  today: string;
}) {
  const [type, setType] = React.useState<InclusionType>(props.initialType);
  const [who, setWho] = React.useState<"novo" | "existente">(props.initialEmployee ? "existente" : "novo");
  const [employeeId, setEmployeeId] = React.useState(props.initialEmployee);
  const [filter, setFilter] = React.useState("");
  const [unit, setUnit] = React.useState(props.units.length === 1 ? props.units[0].id : "");
  const [entity, setEntity] = React.useState("");
  const [pick, setPick] = React.useState<PickerValue>(emptyPick);
  const [wait, setWait] = React.useState<{ id: string; label: string } | null>(null);

  const isAdmission = type === "INCLUSAO_ADMISSIONAL";
  const effectiveWho = isAdmission ? "novo" : who;
  const windowClosed = type === "INCLUSAO_MENSAL" && !props.window;
  const entities = props.entities.filter((e) => e.unit === unit);
  const sections = props.sections.filter((s) => s.entity === entity);
  const filteredEmployees = props.employees.filter((e) => e.label.toLowerCase().includes(filter.toLowerCase())).slice(0, 200);

  const selectedRoute = props.picker.routes.find((r) => r.id === pick.routeId);
  const selectedSchedule = selectedRoute?.schedules.find((s) => s.id === pick.scheduleId);

  return (
    <ActionForm action={submitInclusion} redirectTo={(r) => (r.ok && (r.data as { employeeId?: string })?.employeeId ? `/colaboradores/${(r.data as { employeeId: string }).employeeId}` : undefined)} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-6">
        <input type="hidden" name="type" value={type} />

        <Panel>
          <PanelHeader title="Tipo de inclusão" />
          <div className="grid gap-3 px-5 py-4 md:grid-cols-3" role="radiogroup">
            {TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                role="radio"
                aria-checked={type === t.value}
                onClick={() => {
                  setType(t.value);
                  setWait(null);
                }}
                className={cn(
                  "rounded-md border px-4 py-3 text-left transition-colors",
                  type === t.value ? "border-petrol-600 bg-petrol-50 ring-1 ring-petrol-600" : "border-line hover:border-petrol-200",
                )}
              >
                <span className={cn("block text-sm font-medium", type === t.value && "text-petrol-700")}>{t.title}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">{t.detail}</span>
              </button>
            ))}
          </div>
          {type === "INCLUSAO_MENSAL" && (
            <div className="px-5 pb-4">
              {props.window ? (
                <Notice>
                  Janela aberta até {fmtDate(props.window.close)}. O benefício começa em {fmtDate(props.window.reference)} (compra de {fmtMonth(props.window.reference)}).
                </Notice>
              ) : (
                <Notice tone="bad">A janela de movimentação mensal está fechada. Use um pedido complementar ou aguarde a próxima janela.</Notice>
              )}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Colaborador"
            actions={
              !isAdmission && (
                <div className="flex rounded-md border border-line p-0.5 text-[13px]">
                  {(["existente", "novo"] as const).map((w) => (
                    <button
                      type="button"
                      key={w}
                      onClick={() => setWho(w)}
                      className={cn("rounded px-3 py-1", who === w ? "bg-petrol-600 text-white" : "text-ink-soft hover:text-ink")}
                    >
                      {w === "existente" ? "Já cadastrado" : "Novo cadastro"}
                    </button>
                  ))}
                </div>
              )
            }
          />
          <div className="px-5 py-4">
            {effectiveWho === "existente" ? (
              <div className="flex flex-col gap-3">
                <Field label="Buscar por nome ou chapa">
                  <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Digite para filtrar" />
                </Field>
                <Field label="Colaborador" required hint="Só aparecem colaboradores sem benefício de mobilidade ativo.">
                  <Select name="employee_id" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                    <option value="">Escolha o colaborador</option>
                    {filteredEmployees.map((e) => (
                      <option key={e.id} value={e.id}>{e.label}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome completo" required className="sm:col-span-2">
                  <Input name="full_name" required autoComplete="off" />
                </Field>
                <Field label="Chapa" required hint="Com os zeros à esquerda, ex.: 001420.">
                  <Input name="registration" required inputMode="numeric" autoComplete="off" pattern="\S+" />
                </Field>
                <Field label="Data de nascimento" required>
                  <Input type="date" name="birth_date" required max={props.today} />
                </Field>
                <Field label="Data de admissão" required>
                  <Input type="date" name="admission_date" required />
                </Field>
                <Field label="Nome da mãe" required>
                  <Input name="mother_name" required autoComplete="off" />
                </Field>
                <Field label="Endereço" required className="sm:col-span-2">
                  <Input name="address" required autoComplete="off" />
                </Field>
                <Field label="Unidade" required>
                  <Select
                    name="business_unit_id"
                    value={unit}
                    onChange={(e) => {
                      setUnit(e.target.value);
                      setEntity("");
                    }}
                    required
                  >
                    <option value="">Escolha</option>
                    {props.units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Razão social (CNPJ)" required>
                  <Select name="legal_entity_id" value={entity} onChange={(e) => setEntity(e.target.value)} required disabled={!unit}>
                    <option value="">{unit ? "Escolha" : "Escolha a unidade antes"}</option>
                    {entities.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Seção" required className="sm:col-span-2">
                  <Select name="section_id" required disabled={!entity} defaultValue="">
                    <option value="">{entity ? "Escolha" : "Escolha a razão social antes"}</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Benefício" description="Benefício único: o colaborador usa vale-transporte ou fretado, não os dois." />
          <div className="px-5 py-4">
            <BenefitPicker
              data={props.picker}
              value={pick}
              onChange={(v) => setPick(v)}
              allowFull={isAdmission}
              passesPerMonth={props.passesPerMonth}
              fullHint={
                isAdmission &&
                selectedSchedule && (
                  <Notice tone="warn" className="flex flex-col items-start gap-3">
                    <span>Esse horário está esgotado. O colaborador pode começar no vale-transporte e entrar na fila de espera dele.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setWait({ id: selectedSchedule.id, label: `${selectedRoute!.name} · ${selectedSchedule.label}` });
                        setPick({ ...emptyPick, category: "VT" });
                      }}
                    >
                      <Hourglass />
                      Usar VT e entrar na fila
                    </Button>
                  </Notice>
                )
              }
            />
            {wait && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-warn/25 bg-warn-bg px-4 py-3 text-[13px] text-warn">
                <span>
                  <Hourglass className="mr-1.5 inline size-4" />
                  Fila de espera: <strong className="font-semibold">{wait.label}</strong>. Quando abrir vaga, o admin aprova a troca para o mês seguinte.
                </span>
                <button type="button" onClick={() => setWait(null)} aria-label="Tirar da fila" className="rounded p-1 hover:bg-warn/10">
                  <X className="size-4" />
                </button>
              </div>
            )}
            <input type="hidden" name="waitlist_schedule_id" value={wait?.id ?? ""} />
          </div>
        </Panel>

        {type === "PEDIDO_COMPLEMENTAR" && (
          <Panel>
            <PanelHeader title="Pedido complementar" description="Vai para aprovação do administrador antes de entrar numa compra." />
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-[200px_minmax(0,1fr)]">
              <Field label="Início do uso" required>
                <Input type="date" name="start_date" defaultValue={props.today} required />
              </Field>
              <Field label="Justificativa" required>
                <Textarea name="justification" required placeholder="Ex.: admitido depois do corte da semana." />
              </Field>
            </div>
          </Panel>
        )}
      </div>

      <aside className="lg:sticky lg:top-10 lg:self-start">
        <Panel>
          <div className="flex flex-col gap-3 px-5 py-4 text-[13px]">
            <p className="text-sm font-medium">Resumo</p>
            <Row label="Tipo" value={TYPES.find((t) => t.value === type)!.title} />
            <Row label="Benefício" value={pick.category === "VT" ? "Vale-transporte" : pick.category === "FRETADO" ? "Fretado" : "—"} />
            {pick.category === "FRETADO" && selectedSchedule && <Row label="Horário" value={`${selectedRoute?.name} · ${selectedSchedule.label}`} />}
            {pick.category === "VT" && pick.fareId && <Row label="Destino" value={props.picker.fares.find((f) => f.id === pick.fareId)?.label ?? "—"} />}
            {wait && <Row label="Fila de espera" value={wait.label} />}
            <SubmitButton className="mt-2 w-full" disabled={windowClosed}>
              {type === "PEDIDO_COMPLEMENTAR" ? "Enviar para aprovação" : "Registrar inclusão"}
            </SubmitButton>
            <p className="text-xs text-ink-faint">Fica registrado com o seu usuário, data e hora.</p>
          </div>
        </Panel>
      </aside>
    </ActionForm>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-faint">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
