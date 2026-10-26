import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui/primitives";
import { Reconciliation } from "./reconciliation";

export default async function ConferenciaPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Conferência com a folha"
        description="Suba o arquivo de ativos da folha com as colunas Nome, Chapa e Categoria de benefício. O sistema compara com quem tem benefício ativo hoje e aponta as diferenças."
      />
      <Reconciliation />
    </>
  );
}
