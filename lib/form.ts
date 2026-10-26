/** Leitura tipada de FormData. Strings vazias viram null. */
export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function reqStr(fd: FormData, key: string, label: string): string {
  const v = str(fd, key);
  if (!v) throw new FieldError(`Preencha o campo ${label}.`);
  return v;
}

/** Aceita "1.234,56", "1234,56" e "1234.56". */
export function num(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s === null) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  if (Number.isNaN(n)) throw new FieldError(`Valor inválido: ${s}`);
  return n;
}

export function int(fd: FormData, key: string): number | null {
  const n = num(fd, key);
  return n === null ? null : Math.trunc(n);
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export class FieldError extends Error {}
