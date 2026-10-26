import { requireUser } from "@/lib/auth";
import { PageHeader, Panel, PanelHeader, Field, Input } from "@/components/ui/primitives";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { changeOwnPassword } from "../usuarios/actions";

export default async function ContaPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Minha conta" description={`${user.full_name} · ${user.username}`} />
      <Panel className="max-w-lg">
        <PanelHeader title="Trocar senha" description="Use pelo menos 8 caracteres." />
        <ActionForm action={changeOwnPassword} resetOnSuccess className="flex flex-col gap-4 px-5 py-4">
          <Field label="Nova senha" required>
            <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Repita a nova senha" required>
            <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <div>
            <SubmitButton>Trocar senha</SubmitButton>
          </div>
        </ActionForm>
      </Panel>
    </>
  );
}
