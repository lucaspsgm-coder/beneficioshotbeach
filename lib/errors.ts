import type { PostgrestError } from "@supabase/supabase-js";
import type { ActionResult } from "./types";

/** Converte erros do banco em mensagens que o usuário entende. */
export function friendlyError(error: Pick<PostgrestError, "message" | "code"> | Error | null | undefined): string {
  if (!error) return "Algo deu errado. Tente de novo.";
  const code = "code" in error ? error.code : undefined;
  const msg = error.message || "";
  if (code === "P0001") return msg; // mensagens de regra de negócio já vêm prontas do banco
  if (code === "23505") return "Já existe um registro com esses dados.";
  if (code === "23503") return "Este registro está em uso por outros cadastros e não pode ser excluído. Desative-o.";
  if (code === "42501" || /row-level security/i.test(msg)) return "Você não tem permissão para fazer isso.";
  if (code === "23514") return "Algum valor não atende às regras do cadastro. Revise os campos.";
  if (/JWT|session/i.test(msg)) return "Sua sessão expirou. Entre novamente.";
  return msg || "Algo deu errado. Tente de novo.";
}

export function fail(error: Parameters<typeof friendlyError>[0] | string): ActionResult<never> {
  return { ok: false, error: typeof error === "string" ? error : friendlyError(error) };
}
