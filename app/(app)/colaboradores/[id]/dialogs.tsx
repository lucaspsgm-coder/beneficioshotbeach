"use client";

import * as React from "react";
import { ArrowLeftRight, Clock4, LogOut, PencilLine } from "lucide-react";
import { FormDialog } from "@/components/action-form";
import { Button, Field, Input, Select, Textarea, Notice } from "@/components/ui/primitives";
import { BenefitPicker, emptyPick, type PickerValue } from "@/components/benefit-picker";
import { SeatMeter } from "@/components/seat-mark";
import { cn } from "@/lib/cn";
import type { PickerData } from "@/lib/picker";
import { submitCategoryChange, submitScheduleSwap, submitExclusion, submitEmployeeUpdate } from "../../movimentacoes/actions";

export function CategoryChangeDialog({
  employeeId,
  picker,
  passesPerMonth,
  current,
  nextMonthLabel,
}: {
  employeeId: string;
  picker: PickerData;
  passesPerMonth: number;
  current: { fareId: string | null; scheduleId: string | null };
  nextMonthLabel: string;
}) {
  const [pick, setPick] = React.useState<PickerValue>(emptyPick);
  const route = picker.routes.find((r) => r.id === pick.routeId);
  const sch = route?.schedules.find((s) => s.id === pick.scheduleId);
  const full = sch && sch.seats !== null && sch.taken >= sch.seats;
  return (
    <FormDialog
      trigger={<Button variant="secondary" size="sm"><ArrowLeftRight />Trocar rota ou categoria</Button>}
      title="Movimentação de categoria"
      description={`Troca de rota, horário ou entre VT e fretado. Passa pela aprovação e só vale a partir de ${nextMonthLabel}.`}
      action={submitCategoryChange}
      submitLabel={full ? "Entrar na fila de espera" : "Enviar para aprovação"}
      wide
    >
      <input type="hidden" name="employee_id" value={employeeId} />
      <BenefitPicker
        data={picker}
        value={pick}
        onChange={setPick}
        allowFull
        passesPerMonth={passesPerMonth}
        exclude={{ fareId: current.fareId, scheduleId: current.scheduleId }}
        fullHint={
          <Notice tone="warn">Esse horário está esgotado. O pedido entra na fila de espera por ordem de solicitação; o colaborador continua no benefício atual.</Notice>
        }
      />
      <Field label="Observação">
        <Textarea name="note" placeholder="Ex.: mudou de turno, mudou de endereço." />
      </Field>
    </FormDialog>
  );
}

export function ScheduleSwapDialog({
  employeeId,
  route,
  currentScheduleId,
}: {
  employeeId: string;
  route: PickerData["routes"][number];
  currentScheduleId: string;
}) {
  const [selected, setSelected] = React.useState("");
  return (
    <FormDialog
      trigger={<Button variant="secondary" size="sm"><Clock4 />Trocar horário (turno)</Button>}
      title="Troca de horário por mudança de turno"
      description={`Mesma rota (${route.name}) e mesma operadora. Pode acontecer no meio do mês, com aprovação do admin.`}
      action={submitScheduleSwap}
      submitLabel="Enviar para aprovação"
    >
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="charter_schedule_id" value={selected} />
      <div className="grid gap-2 sm:grid-cols-2">
        {route.schedules.map((s) => {
          const current = s.id === currentScheduleId;
          const full = s.seats !== null && s.taken >= s.seats;
          return (
            <button
              type="button"
              key={s.id}
              disabled={current || full}
              onClick={() => setSelected(s.id)}
              aria-pressed={selected === s.id}
              className={cn(
                "flex flex-col gap-2 rounded-md border px-3 py-2.5 text-left",
                selected === s.id ? "border-petrol-600 bg-petrol-50 ring-1 ring-petrol-600" : "border-line hover:border-petrol-200",
                (current || full) && "cursor-not-allowed opacity-55",
              )}
            >
              <span className="text-sm font-medium">
                {s.label}
                {current && <span className="ml-2 text-xs font-normal text-ink-faint">atual</span>}
              </span>
              <SeatMeter seats={s.seats} taken={s.taken} />
            </button>
          );
        })}
      </div>
      <Field label="Observação">
        <Textarea name="note" placeholder="Ex.: passou para o turno da noite." />
      </Field>
    </FormDialog>
  );
}

export function ExclusionDialog({ employeeId, referenceLabel, windowOpen }: { employeeId: string; referenceLabel: string | null; windowOpen: boolean }) {
  return (
    <FormDialog
      trigger={<Button variant="danger" size="sm"><LogOut />Exclusão mensal</Button>}
      title="Exclusão mensal"
      description={
        windowOpen
          ? `O colaborador usa o benefício até o fim deste mês e sai da compra de ${referenceLabel}.`
          : "A janela mensal está fechada: a exclusão só pode ser lançada na próxima janela."
      }
      action={submitExclusion}
      submitLabel="Registrar exclusão"
      submitVariant="danger"
    >
      <input type="hidden" name="employee_id" value={employeeId} />
      <Field label="Motivo" required>
        <Select name="reason" defaultValue="DESLIGAMENTO" required>
          <option value="DESLIGAMENTO">Desligamento</option>
          <option value="RENUNCIA">Renúncia ao benefício (termo no dossiê)</option>
          <option value="OUTRO">Outro motivo</option>
        </Select>
      </Field>
      <Field label="Observação">
        <Textarea name="note" />
      </Field>
      <Notice>No desligamento, o colaborador sai automaticamente da fila de espera e os pedidos em aprovação são cancelados.</Notice>
    </FormDialog>
  );
}

export function EmployeeUpdateDialog({
  employee,
  units,
  entities,
  sections,
  isAdmin,
}: {
  employee: {
    id: string;
    registration: string;
    full_name: string;
    birth_date: string | null;
    admission_date: string | null;
    mother_name: string | null;
    address: string | null;
    business_unit_id: string;
    legal_entity_id: string;
    section_id: string;
    vt_card_number: string | null;
  };
  units: { id: string; name: string }[];
  entities: { id: string; name: string; unit: string }[];
  sections: { id: string; name: string; entity: string }[];
  isAdmin: boolean;
}) {
  const [unit, setUnit] = React.useState(employee.business_unit_id);
  const [entity, setEntity] = React.useState(employee.legal_entity_id);
  const ents = entities.filter((e) => e.unit === unit);
  const secs = sections.filter((s) => s.entity === entity);
  return (
    <FormDialog
      trigger={<Button variant="ghost" size="sm"><PencilLine />Alteração cadastral</Button>}
      title="Alteração cadastral"
      description="Aplica na hora e registra o antes e depois de cada campo. Mudança de unidade transfere o colaborador e os pedidos em andamento."
      action={submitEmployeeUpdate}
      submitLabel="Salvar alteração"
      wide
    >
      <input type="hidden" name="employee_id" value={employee.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" className="sm:col-span-2">
          <Input name="full_name" defaultValue={employee.full_name} required />
        </Field>
        <Field label="Chapa" hint="Mudou de CNPJ? A chapa nova entra aqui.">
          <Input name="registration" defaultValue={employee.registration} required pattern="\S+" />
        </Field>
        <Field label="Número do cartão VT">
          <Input name="vt_card_number" defaultValue={employee.vt_card_number ?? ""} />
        </Field>
        <Field label="Data de nascimento">
          <Input type="date" name="birth_date" defaultValue={employee.birth_date ?? ""} />
        </Field>
        <Field label="Data de admissão">
          <Input type="date" name="admission_date" defaultValue={employee.admission_date ?? ""} />
        </Field>
        <Field label="Nome da mãe" className="sm:col-span-2">
          <Input name="mother_name" defaultValue={employee.mother_name ?? ""} />
        </Field>
        <Field label="Endereço" className="sm:col-span-2">
          <Input name="address" defaultValue={employee.address ?? ""} />
        </Field>
        <Field label="Unidade">
          <Select
            name="business_unit_id"
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              setEntity("");
            }}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Razão social (CNPJ)">
          <Select name="legal_entity_id" value={entity} onChange={(e) => setEntity(e.target.value)} required>
            <option value="">Escolha</option>
            {ents.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Seção" className="sm:col-span-2">
          <Select name="section_id" defaultValue={employee.section_id} key={entity} required>
            <option value="">Escolha</option>
            {secs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Observação" className="sm:col-span-2">
          <Textarea name="note" />
        </Field>
      </div>
      {!isAdmin && unit !== employee.business_unit_id && (
        <Notice tone="warn">Depois da transferência, o colaborador sai da sua lista e passa para o RH da nova unidade.</Notice>
      )}
    </FormDialog>
  );
}
