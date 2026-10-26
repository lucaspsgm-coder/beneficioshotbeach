import { Badge } from "@/components/ui/primitives";
import { movementStatusLabel, movementTypeLabel, purchaseStatusLabel } from "@/lib/format";
import type { MovementStatus, MovementType, PurchaseStatus } from "@/lib/types";

const movementTone: Record<MovementStatus, "neutral" | "petrol" | "ok" | "warn" | "bad"> = {
  PENDENTE: "petrol",
  AGUARDANDO_APROVACAO: "warn",
  FILA_ESPERA: "warn",
  APROVADO: "ok",
  REJEITADO: "bad",
  CANCELADO: "neutral",
  PROCESSADO: "ok",
};

export function MovementStatusBadge({ status }: { status: MovementStatus }) {
  return <Badge tone={movementTone[status]}>{movementStatusLabel[status]}</Badge>;
}

export function MovementTypeText({ type }: { type: MovementType }) {
  return <span>{movementTypeLabel[type]}</span>;
}

const purchaseTone: Record<PurchaseStatus, "petrol" | "warn" | "ok"> = { ABERTA: "warn", FECHADA: "petrol", PAGA: "ok" };
export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return <Badge tone={purchaseTone[status]}>{purchaseStatusLabel[status]}</Badge>;
}

export function CategoryBadge({ code }: { code: string | null }) {
  if (!code) return null;
  return <Badge tone={code === "FRETADO" ? "petrol" : "neutral"}>{code === "VT" ? "Vale-transporte" : code === "FRETADO" ? "Fretado" : code}</Badge>;
}
