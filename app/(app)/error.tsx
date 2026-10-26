"use client";

import { Button, Panel, EmptyState } from "@/components/ui/primitives";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel>
      <EmptyState
        title="Não foi possível carregar esta tela."
        action={
          <Button variant="secondary" onClick={reset}>
            Tentar de novo
          </Button>
        }
      >
        {error.message.includes("Variável de ambiente") ? error.message : "Verifique a conexão e tente de novo. Se continuar, avise o administrador."}
        {error.digest && <span className="mt-1 block text-xs text-ink-faint">Código: {error.digest}</span>}
      </EmptyState>
    </Panel>
  );
}
