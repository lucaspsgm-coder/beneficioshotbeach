import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Encerra a sessão (usado quando o perfil foi desativado ou não existe). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const to = new URL("/login", request.url);
  const motivo = request.nextUrl.searchParams.get("motivo");
  if (motivo) to.searchParams.set("motivo", motivo);
  return NextResponse.redirect(to);
}
