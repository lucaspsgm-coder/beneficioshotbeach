import { requireAdmin } from "@/lib/auth";
import { Download } from "lucide-react";
import { PageHeader, Button } from "@/components/ui/primitives";
import { todayBR } from "@/lib/format";
import { LoadWizard } from "./load-wizard";

export default async function CargaPage() {
  await requireAdmin();
  const today = todayBR();
  return (
    <>
      <PageHeader
        title="Carga inicial"
        description="Sobe quem já usa VT ou fretado no go-live. Use o modelo de planilha (abas Carga VT e Carga Fretado). Cadastre antes a estrutura, os destinos de VT e as rotas e horários de fretado."
        actions={
          <Button asChild variant="secondary">
            <a href="/modelos/Carga_inicial_Mobilidade.xlsx" download>
              <Download />
              Baixar modelo
            </a>
          </Button>
        }
      />
      <LoadWizard defaultStart={`${today.slice(0, 7)}-01`} />
    </>
  );
}
