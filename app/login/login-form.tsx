"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui/primitives";
import { login } from "./actions";

export function LoginForm() {
  return (
    <ActionForm action={login} redirectTo="/" className="mt-8 flex flex-col gap-4">
      <Field label="Usuário" htmlFor="username">
        <Input id="username" name="username" autoComplete="username" placeholder="nome.sobrenome" autoFocus required />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton size="lg" className="mt-2 w-full">
        Entrar
      </SubmitButton>
    </ActionForm>
  );
}
