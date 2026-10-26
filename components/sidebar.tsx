"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  FilePlus2,
  ListChecks,
  Hourglass,
  CheckCheck,
  ShoppingCart,
  FileSpreadsheet,
  ScanSearch,
  Upload,
  Building2,
  Bus,
  TicketCheck,
  CalendarDays,
  SlidersHorizontal,
  UserCog,
  History,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { SeatMark } from "@/components/seat-mark";
import { logout } from "@/app/login/actions";

type Item = { href: string; label: string; icon: React.ElementType; count?: number; exact?: boolean };

export function Sidebar({
  user,
  counts,
}: {
  user: { name: string; username: string; role: "ADMIN" | "RH_UNIT"; unit: string | null };
  counts: { approvals: number; waitlist: number };
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);
  const isAdmin = user.role === "ADMIN";

  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Operação",
      items: [
        { href: "/", label: "Início", icon: Home, exact: true },
        { href: "/colaboradores", label: "Colaboradores", icon: Users },
        { href: "/movimentacoes/nova", label: "Nova inclusão", icon: FilePlus2, exact: true },
        { href: "/movimentacoes", label: "Movimentações", icon: ListChecks, exact: true },
        { href: "/fila", label: "Fila de espera", icon: Hourglass, count: isAdmin ? counts.waitlist : undefined },
      ],
    },
  ];
  if (isAdmin) {
    groups.push(
      {
        title: "Gestão",
        items: [
          { href: "/aprovacoes", label: "Aprovações", icon: CheckCheck, count: counts.approvals },
          { href: "/compras", label: "Compras", icon: ShoppingCart },
          { href: "/relatorios", label: "Relatórios", icon: FileSpreadsheet },
          { href: "/conferencia", label: "Conferência com a folha", icon: ScanSearch },
          { href: "/carga", label: "Carga inicial", icon: Upload },
        ],
      },
      {
        title: "Configuração",
        items: [
          { href: "/parametros/estrutura", label: "Estrutura", icon: Building2 },
          { href: "/parametros/vale-transporte", label: "Vale-transporte", icon: TicketCheck },
          { href: "/parametros/fretado", label: "Fretado", icon: Bus },
          { href: "/parametros/calendario", label: "Calendário", icon: CalendarDays },
          { href: "/parametros/regras", label: "Regras", icon: SlidersHorizontal },
          { href: "/usuarios", label: "Usuários", icon: UserCog },
          { href: "/auditoria", label: "Auditoria", icon: History },
        ],
      },
    );
  }

  const isActive = (it: Item) => (it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + "/"));

  const nav = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 pb-1.5 text-xs font-medium text-ink-faint">{g.title}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const active = isActive(it);
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13.5px] transition-colors",
                      active ? "bg-petrol-50 font-medium text-petrol-700" : "text-ink-soft hover:bg-paper hover:text-ink",
                    )}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-petrol-600" />}
                    <Icon className={cn("size-4", active ? "text-petrol-600" : "text-ink-faint")} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {!!it.count && (
                      <span className="rounded-full bg-petrol-600 px-1.5 text-[11px] font-semibold leading-[18px] text-white">{it.count}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-line px-4 py-4">
      <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
      <p className="truncate text-xs text-ink-faint">
        {user.username} · {isAdmin ? "Administrador" : `RH ${user.unit ?? ""}`}
      </p>
      <div className="mt-3 flex items-center gap-4">
        <Link href="/conta" className="text-[13px] text-ink-soft hover:text-ink">
          Minha conta
        </Link>
        <form action={logout}>
          <button className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink">
            <LogOut className="size-4" />
            Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* barra superior no celular */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <SeatMark className="size-5 text-petrol-600" />
          <span className="text-sm font-semibold">Central de Benefícios</span>
        </Link>
        <button onClick={() => setOpen((v) => !v)} aria-label="Abrir menu" className="rounded-md p-1.5 hover:bg-paper">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-petrol-800/25" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[272px] flex-col bg-surface shadow-pop">
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
        <Link href="/" className="flex items-center gap-2.5 border-b border-line px-5 py-[18px]">
          <SeatMark className="text-petrol-600" />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Central de Benefícios</span>
        </Link>
        {nav}
        {footer}
      </aside>
    </>
  );
}
