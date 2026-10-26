import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ Button */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-petrol-600 text-white hover:bg-petrol-700 active:bg-petrol-800",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-petrol-50 hover:border-petrol-200",
        ghost: "text-ink-soft hover:bg-petrol-50 hover:text-ink",
        danger: "border border-bad/30 bg-surface text-bad hover:bg-bad-bg",
        link: "text-petrol-600 underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-4",
        lg: "h-10 px-5",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

/* ------------------------------------------------------------------ Inputs */
const fieldBase =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-colors hover:border-petrol-200 focus-visible:border-petrol-500 focus-visible:ring-2 focus-visible:ring-petrol-100 focus-visible:ring-offset-0 disabled:bg-paper disabled:text-ink-faint";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-9", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldBase, "min-h-[76px] py-2 leading-relaxed", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      fieldBase,
      "h-9 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%234A5D62%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-ink", className)} {...props} />;
}

export function Field({
  label,
  hint,
  htmlFor,
  required,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-petrol-600">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
      <input type="checkbox" className="size-4 rounded border-line-strong accent-petrol-600" {...props} />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ Badge */
const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-paper text-ink-soft ring-1 ring-inset ring-line",
      petrol: "bg-petrol-50 text-petrol-700 ring-1 ring-inset ring-petrol-100",
      ok: "bg-ok-bg text-ok",
      warn: "bg-warn-bg text-warn",
      bad: "bg-bad-bg text-bad",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ tone, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* ------------------------------------------------------------------ Panel */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("rounded-lg border border-line bg-surface shadow-panel", className)} {...props} />;
}
export function PanelHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 max-w-[68ch] text-[13px] text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Table */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-line bg-paper/60 px-4 py-2.5 text-left text-xs font-semibold text-ink-soft first:pl-5 last:pr-5",
        className,
      )}
      {...props}
    />
  );
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-line px-4 py-3 align-top first:pl-5 last:pr-5", className)} {...props} />;
}
export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-petrol-50/40 [&:last-child>td]:border-b-0", className)} {...props} />;
}

/* ------------------------------------------------------------------ Page header & empty */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <div className="mb-2">{back}</div>}
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-[72ch] text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 px-5 py-10">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="max-w-[60ch] text-[13px] text-ink-soft">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "petrol", children, className }: { tone?: "petrol" | "warn" | "bad" | "ok"; children: React.ReactNode; className?: string }) {
  const tones = {
    petrol: "border-petrol-100 bg-petrol-50 text-petrol-800",
    warn: "border-warn/20 bg-warn-bg text-warn",
    bad: "border-bad/20 bg-bad-bg text-bad",
    ok: "border-ok/20 bg-ok-bg text-ok",
  };
  return <div className={cn("rounded-md border px-4 py-3 text-[13px] leading-relaxed", tones[tone], className)}>{children}</div>;
}

/** Linha "Criado por X em data · Alterado por Y em data" — rastreabilidade visível. */
export function Trace({
  createdBy,
  createdAt,
  updatedBy,
  updatedAt,
  className,
}: {
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  className?: string;
}) {
  return (
    <p className={cn("text-xs text-ink-faint", className)}>
      {createdAt && (
        <>
          Criado por <span className="text-ink-soft">{createdBy ?? "sistema"}</span> em {createdAt}
        </>
      )}
      {updatedAt && updatedAt !== createdAt && (
        <>
          {". "}Última alteração por <span className="text-ink-soft">{updatedBy ?? "sistema"}</span> em {updatedAt}
        </>
      )}
    </p>
  );
}
