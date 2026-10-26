import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();

  let pendingApprovals = 0;
  let waiting = 0;
  if (user.role === "ADMIN") {
    const [a, w] = await Promise.all([
      supabase.from("movements").select("id", { count: "exact", head: true }).eq("status", "AGUARDANDO_APROVACAO"),
      supabase.from("waitlist").select("id", { count: "exact", head: true }).eq("status", "AGUARDANDO"),
    ]);
    pendingApprovals = a.count ?? 0;
    waiting = w.count ?? 0;
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar
        user={{ name: user.full_name, username: user.username, role: user.role, unit: user.unit_name }}
        counts={{ approvals: pendingApprovals, waitlist: waiting }}
      />
      <main className="min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:pt-10">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
