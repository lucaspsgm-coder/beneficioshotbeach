import type { MovementStatus, MovementType, PurchaseKind, PurchaseStatus, CostModel } from "./types";

const TZ = "America/Sao_Paulo";

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' sem passar por fuso (datas puras). */
export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

/** Data e hora no fuso de São Paulo, para a trilha de auditoria. */
export function fmtDateTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ts));
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function fmtMonth(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m] = d.split("-");
  return `${MONTHS[Number(m) - 1]} de ${y}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function fmtMoney(v: number | string | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  return brl.format(Number(v));
}

export function fmtNumber(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

/** Hoje em São Paulo, no formato YYYY-MM-DD. */
export function todayBR() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts;
}

export const movementTypeLabel: Record<MovementType, string> = {
  INCLUSAO_ADMISSIONAL: "Inclusão admissional",
  INCLUSAO_MENSAL: "Inclusão mensal",
  EXCLUSAO_MENSAL: "Exclusão mensal",
  PEDIDO_COMPLEMENTAR: "Pedido complementar",
  ALTERACAO_CADASTRAL: "Alteração cadastral",
  MOVIMENTACAO_CATEGORIA: "Movimentação de categoria",
  TROCA_HORARIO: "Troca de horário (turno)",
};

export const movementStatusLabel: Record<MovementStatus, string> = {
  PENDENTE: "Aguardando compra",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  FILA_ESPERA: "Na fila de espera",
  APROVADO: "Aprovado",
  REJEITADO: "Rejeitado",
  CANCELADO: "Cancelado",
  PROCESSADO: "Processado",
};

export const purchaseKindLabel: Record<PurchaseKind, string> = {
  MENSAL: "Mensal",
  ADMISSIONAL: "Admissional",
  COMPLEMENTAR: "Complementar",
};

export const purchaseStatusLabel: Record<PurchaseStatus, string> = {
  ABERTA: "Aberta",
  FECHADA: "Fechada",
  PAGA: "Paga",
};

export const costModelLabel: Record<CostModel, string> = {
  POR_ASSENTO: "Por assento",
  FECHADO: "Contrato fechado",
  MISTO: "Misto (subsídio + rateio)",
};

export const exclusionReasonLabel = {
  DESLIGAMENTO: "Desligamento",
  RENUNCIA: "Renúncia ao benefício",
  OUTRO: "Outro motivo",
} as const;

export const tableLabel: Record<string, string> = {
  business_units: "Unidade",
  legal_entities: "Razão social",
  sections: "Seção",
  profiles: "Usuário",
  benefit_groups: "Grupo de benefício",
  benefit_categories: "Categoria",
  operators: "Operadora",
  vt_fares: "Destino de VT",
  charter_contracts: "Contrato de fretado",
  charter_subsidies: "Subsídio",
  charter_routes: "Rota de fretado",
  charter_schedules: "Horário de fretado",
  employees: "Colaborador",
  employee_benefits: "Benefício do colaborador",
  calendar_months: "Calendário",
  purchases: "Compra",
  movements: "Movimentação",
  waitlist: "Fila de espera",
  purchase_items: "Item de compra",
};

export const actionLabel: Record<string, string> = {
  INSERT: "Criou",
  UPDATE: "Alterou",
  DELETE: "Excluiu",
  LOGIN: "Entrou no sistema",
  LOGOUT: "Saiu do sistema",
  EXPORTACAO: "Exportou arquivo",
  CARGA_INICIAL: "Importou carga inicial",
  CONFERENCIA_FOLHA: "Rodou conferência com a folha",
  SENHA_REDEFINIDA: "Redefiniu senha",
  USUARIO_CRIADO: "Criou usuário",
};

export function scheduleLabel(s: { arrival_time: string; departure_time: string }) {
  return `${s.arrival_time} / ${s.departure_time}`;
}
