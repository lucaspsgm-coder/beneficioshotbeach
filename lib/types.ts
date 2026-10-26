export type Role = "ADMIN" | "RH_UNIT";
export type CategoryCode = "VT" | "FRETADO" | (string & {});
export type CostModel = "POR_ASSENTO" | "FECHADO" | "MISTO";
export type EntryBilling = "MES_CHEIO" | "PROPORCIONAL";
export type SubsidyType = "VALOR" | "PERCENTUAL";
export type MovementType =
  | "INCLUSAO_ADMISSIONAL"
  | "INCLUSAO_MENSAL"
  | "EXCLUSAO_MENSAL"
  | "PEDIDO_COMPLEMENTAR"
  | "ALTERACAO_CADASTRAL"
  | "MOVIMENTACAO_CATEGORIA"
  | "TROCA_HORARIO";
export type MovementStatus =
  | "PENDENTE"
  | "AGUARDANDO_APROVACAO"
  | "FILA_ESPERA"
  | "APROVADO"
  | "REJEITADO"
  | "CANCELADO"
  | "PROCESSADO";
export type PurchaseKind = "MENSAL" | "ADMISSIONAL" | "COMPLEMENTAR";
export type PurchaseStatus = "ABERTA" | "FECHADA" | "PAGA";

export interface Stamped {
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Profile extends Stamped {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  business_unit_id: string | null;
  active: boolean;
}

export interface BusinessUnit extends Stamped {
  id: string;
  name: string;
  active: boolean;
}
export interface LegalEntity extends Stamped {
  id: string;
  business_unit_id: string;
  name: string;
  cnpj: string | null;
  active: boolean;
}
export interface Section extends Stamped {
  id: string;
  legal_entity_id: string;
  name: string;
  active: boolean;
}
export interface BenefitCategory extends Stamped {
  code: string;
  name: string;
  group_code: string;
  base_days: number;
  passes_per_day: number;
  admission_proportional: boolean;
}
export interface BenefitGroup extends Stamped {
  code: string;
  name: string;
  max_active: number;
}
export interface Operator extends Stamped {
  id: string;
  category_code: string;
  name: string;
  entry_billing: EntryBilling;
  notes: string | null;
  active: boolean;
}
export interface VtFare extends Stamped {
  id: string;
  operator_id: string;
  line_name: string;
  origin: string;
  destination: string;
  fare: number;
  active: boolean;
}
export interface CharterContract extends Stamped {
  id: string;
  operator_id: string;
  name: string;
  cost_model: CostModel;
  monthly_value: number | null;
  active: boolean;
}
export interface CharterSubsidy extends Stamped {
  id: string;
  contract_id: string;
  business_unit_id: string;
  subsidy_type: SubsidyType;
  value: number;
  joins_rateio: boolean;
}
export interface CharterRoute extends Stamped {
  id: string;
  contract_id: string;
  name: string;
  seat_price: number | null;
  active: boolean;
}
export interface CharterSchedule extends Stamped {
  id: string;
  route_id: string;
  arrival_time: string;
  departure_time: string;
  seats: number | null;
  active: boolean;
}
export interface Employee extends Stamped {
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
  active: boolean;
}
export interface EmployeeBenefit extends Stamped {
  id: string;
  employee_id: string;
  category_code: string;
  group_code: string;
  vt_fare_id: string | null;
  charter_schedule_id: string | null;
  start_date: string;
  end_date: string | null;
  canceled: boolean;
  origin_movement_id: string | null;
}
export interface Movement extends Stamped {
  id: string;
  employee_id: string;
  business_unit_id: string;
  type: MovementType;
  status: MovementStatus;
  category_code: string | null;
  vt_fare_id: string | null;
  charter_schedule_id: string | null;
  waitlist_schedule_id: string | null;
  effective_date: string | null;
  exclusion_reason: "DESLIGAMENTO" | "RENUNCIA" | "OUTRO" | null;
  justification: string | null;
  changes: Record<string, unknown> | null;
  benefit_id: string | null;
  previous_benefit_id: string | null;
  purchase_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}
export interface CalendarMonth extends Stamped {
  id: string;
  reference_month: string;
  window_open: string;
  window_close: string;
  cutoff_date: string;
  approval_date: string;
  purchase_date: string | null;
  credit_date: string | null;
  notes: string | null;
}
export interface Purchase extends Stamped {
  id: string;
  kind: PurchaseKind;
  reference_month: string;
  period_start: string | null;
  period_end: string | null;
  status: PurchaseStatus;
  closed_at: string | null;
  closed_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
}
export interface PurchaseItem {
  item_kind: "NORMAL" | "PROPORCIONAL" | "ACERTO" | "SUBSIDIO";
  category_code: string;
  employee_id: string | null;
  benefit_id: string | null;
  movement_id: string | null;
  registration: string | null;
  employee_name: string | null;
  vt_card_number: string | null;
  business_unit_id: string | null;
  business_unit_name: string | null;
  legal_entity_id: string | null;
  legal_entity_name: string | null;
  section_id: string | null;
  section_name: string | null;
  operator_id: string | null;
  operator_name: string | null;
  contract_id: string | null;
  contract_name: string | null;
  cost_model: CostModel | null;
  description: string | null;
  days: number | null;
  quantity: number | null;
  unit_value: number | null;
  total: number;
  notes: string | null;
}
export interface Waitlist extends Stamped {
  id: string;
  employee_id: string;
  business_unit_id: string;
  charter_schedule_id: string;
  movement_id: string | null;
  requested_at: string;
  status: "AGUARDANDO" | "APROVADO" | "CANCELADO";
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}
export interface AuditRow {
  id: number;
  occurred_at: string;
  user_id: string | null;
  username: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  changed: string[] | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
}

/** Resultado padrão das server actions, mostrado como aviso na tela. */
export type ActionResult<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string };
