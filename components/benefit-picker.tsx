"use client";

import * as React from "react";
import { Bus, TicketCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { Field, Select } from "@/components/ui/primitives";
import { SeatMeter } from "@/components/seat-mark";
import type { PickerData } from "@/lib/picker";

export interface PickerValue {
  category: "VT" | "FRETADO" | null;
  fareId: string;
  routeId: string;
  scheduleId: string;
}

export const emptyPick: PickerValue = { category: null, fareId: "", routeId: "", scheduleId: "" };

/**
 * Seletor de benefício: VT (só o destino) ou fretado (rota + horário com assentos).
 * Grava category_code / vt_fare_id / charter_schedule_id em campos ocultos.
 */
export function BenefitPicker({
  data,
  value,
  onChange,
  allowFull = false,
  fullHint,
  passesPerMonth,
  exclude,
}: {
  data: PickerData;
  value: PickerValue;
  onChange: (v: PickerValue) => void;
  /** permite escolher horário esgotado (vai para a fila) */
  allowFull?: boolean;
  fullHint?: React.ReactNode;
  passesPerMonth: number;
  /** opção atual do colaborador, que não pode ser escolhida de novo */
  exclude?: { fareId?: string | null; scheduleId?: string | null };
}) {
  const route = data.routes.find((r) => r.id === value.routeId);
  const fare = data.fares.find((f) => f.id === value.fareId);
  const schedule = route?.schedules.find((s) => s.id === value.scheduleId);
  const scheduleFull = schedule && schedule.seats !== null && schedule.taken >= schedule.seats;

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="category_code" value={value.category ?? ""} />
      <input type="hidden" name="vt_fare_id" value={value.category === "VT" ? value.fareId : ""} />
      <input type="hidden" name="charter_schedule_id" value={value.category === "FRETADO" ? value.scheduleId : ""} />

      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Benefício">
        <CategoryCard
          active={value.category === "VT"}
          onClick={() => onChange({ ...emptyPick, category: "VT" })}
          icon={<TicketCheck />}
          title="Vale-transporte"
          detail={`${data.fares.length} destino(s)`}
        />
        <CategoryCard
          active={value.category === "FRETADO"}
          onClick={() => onChange({ ...emptyPick, category: "FRETADO" })}
          icon={<Bus />}
          title="Fretado"
          detail={`${data.routes.length} rota(s)`}
        />
      </div>

      {value.category === "VT" && (
        <Field label="Destino" required hint="Origem, linha, operadora e tarifa vêm do cadastro.">
          <Select value={value.fareId} onChange={(e) => onChange({ ...value, fareId: e.target.value })} required>
            <option value="">Escolha o destino</option>
            {data.fares.map((f) => (
              <option key={f.id} value={f.id} disabled={exclude?.fareId === f.id}>
                {f.label}
                {exclude?.fareId === f.id ? " (atual)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {value.category === "VT" && fare && (
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line text-[13px]">
          <Info label="Linha" value={fare.line} />
          <Info label="Operadora" value={fare.operator} />
          <Info label={`Passagem · mês (${passesPerMonth})`} value={`${fmtMoney(fare.fare)} · ${fmtMoney(fare.fare * passesPerMonth)}`} />
        </div>
      )}

      {value.category === "FRETADO" && (
        <>
          <Field label="Rota" required>
            <Select value={value.routeId} onChange={(e) => onChange({ ...value, routeId: e.target.value, scheduleId: "" })} required>
              <option value="">Escolha a rota</option>
              {data.routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.operator}
                </option>
              ))}
            </Select>
          </Field>
          {route && (
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium">
                Horário (desembarque / embarque)<span className="ml-0.5 text-petrol-600">*</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {route.schedules.map((s) => {
                  const full = s.seats !== null && s.taken >= s.seats;
                  const isCurrent = exclude?.scheduleId === s.id;
                  const disabled = isCurrent || (full && !allowFull);
                  const selected = value.scheduleId === s.id;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      disabled={disabled}
                      onClick={() => onChange({ ...value, scheduleId: s.id })}
                      aria-pressed={selected}
                      className={cn(
                        "flex flex-col gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
                        selected ? "border-petrol-600 bg-petrol-50 ring-1 ring-petrol-600" : "border-line hover:border-petrol-200",
                        disabled && "cursor-not-allowed opacity-55 hover:border-line",
                      )}
                    >
                      <span className="text-sm font-medium">
                        {s.label}
                        {isCurrent && <span className="ml-2 text-xs font-normal text-ink-faint">horário atual</span>}
                      </span>
                      <SeatMeter seats={s.seats} taken={s.taken} />
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {scheduleFull && fullHint}
        </>
      )}
    </div>
  );
}

function CategoryCard({ active, onClick, icon, title, detail }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors [&_svg]:size-5",
        active ? "border-petrol-600 bg-petrol-50 text-petrol-700 ring-1 ring-petrol-600" : "border-line text-ink hover:border-petrol-200",
      )}
    >
      <span className={active ? "text-petrol-600" : "text-ink-faint"}>{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-ink-faint">{detail}</span>
      </span>
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-2">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
