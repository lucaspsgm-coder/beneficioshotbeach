"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/types";
import { Button, Textarea, Field, type ButtonProps } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

type ServerAction = (fd: FormData) => Promise<ActionResult>;

const PendingContext = React.createContext(false);

/** Formulário que chama uma server action e mostra o resultado como aviso. */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  resetOnSuccess,
  redirectTo,
}: {
  action: ServerAction;
  children: React.ReactNode;
  className?: string;
  onSuccess?: (r: ActionResult) => void;
  resetOnSuccess?: boolean;
  redirectTo?: string | ((r: ActionResult) => string | undefined);
}) {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const ref = React.useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await action(fd);
          if (r.ok) {
            if (r.message !== "") toast.success(r.message ?? "Salvo.");
            if (resetOnSuccess) ref.current?.reset();
            onSuccess?.(r);
            const to = typeof redirectTo === "function" ? redirectTo(r) : redirectTo;
            if (to) router.push(to);
            else router.refresh();
          } else {
            toast.error(r.error);
          }
        });
      }}
    >
      <PendingContext.Provider value={pending}>
        <fieldset disabled={pending} className="contents">
          {children}
        </fieldset>
      </PendingContext.Provider>
    </form>
  );
}

export function SubmitButton({ children, ...props }: ButtonProps) {
  const pending = React.useContext(PendingContext);
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

/** Botão que abre um formulário num diálogo e fecha ao salvar. */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Salvar",
  submitVariant,
  children,
  wide,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action: ServerAction;
  submitLabel?: string;
  submitVariant?: ButtonProps["variant"];
  children: React.ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description} className={wide ? "max-w-2xl" : undefined}>
        <ActionForm action={action} onSuccess={() => setOpen(false)} className="flex flex-col gap-4">
          {children}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Ação de um clique com confirmação e observação opcional/obrigatória. */
export function ConfirmAction({
  action,
  label,
  title,
  description,
  confirmLabel,
  variant = "secondary",
  size = "sm",
  note,
  icon,
}: {
  action: ServerAction;
  label: string;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  note?: { label: string; required?: boolean; placeholder?: string };
  icon?: React.ReactNode;
}) {
  return (
    <FormDialog
      trigger={
        <Button variant={variant} size={size}>
          {icon}
          {label}
        </Button>
      }
      title={title}
      description={description}
      action={action}
      submitLabel={confirmLabel ?? label}
      submitVariant={variant === "danger" ? "danger" : "primary"}
    >
      {note ? (
        <Field label={note.label} required={note.required}>
          <Textarea name="note" required={note.required} placeholder={note.placeholder} />
        </Field>
      ) : (
        <input type="hidden" name="note" value="" />
      )}
    </FormDialog>
  );
}
