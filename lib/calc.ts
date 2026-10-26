/**
 * Regras de cálculo puras (sem banco), testadas em tests/calc.test.ts.
 * Datas sempre como 'YYYY-MM-DD'.
 */

export function parseISO(d: string) {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return { y, m, day };
}

export function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthBounds(ref: string) {
  const { y, m } = parseISO(ref);
  return { first: toISO(y, m, 1), last: toISO(y, m, daysInMonth(y, m)) };
}

export function addMonths(ref: string, n: number) {
  const { y, m } = parseISO(ref);
  const idx = y * 12 + (m - 1) + n;
  return toISO(Math.floor(idx / 12), (idx % 12) + 1, 1);
}

export function addDays(d: string, n: number) {
  const { y, m, day } = parseISO(d);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Proporcional da admissão: dias restantes do mês contando o dia de início,
 * menos os domingos. Feriados não são descontados. Limitado aos dias-base (26).
 */
export function proportionalDays(start: string, baseDays: number) {
  const { y, m, day } = parseISO(start);
  const last = daysInMonth(y, m);
  let count = 0;
  for (let d = day; d <= last; d++) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0) count++;
  }
  return Math.min(count, baseDays);
}

/** Benefício ativo numa data. */
export function isActiveOn(b: { start_date: string; end_date: string | null; canceled?: boolean }, date: string) {
  if (b.canceled) return false;
  if (b.end_date && b.end_date < b.start_date) return false;
  return b.start_date <= date && (!b.end_date || b.end_date >= date);
}

export interface Occupant {
  key: string; // id do benefício
  unitId: string;
}
export interface SubsidyRule {
  unitId: string;
  type: "VALOR" | "PERCENTUAL";
  value: number;
  joinsRateio: boolean;
}
export interface ContractShareResult {
  /** valor por ocupante (chave = id do benefício) */
  perOccupant: Map<string, number>;
  /** subsídio de unidade sem ocupantes no contrato (vira linha própria) */
  unallocatedSubsidies: { unitId: string; amount: number }[];
  /** saldo sem ninguém para dividir (todas as unidades fora do rateio) */
  unallocatedRemainder: number;
}

function round2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Divide um contrato fechado ou misto entre os assentos ocupados.
 * - Fechado: valor ÷ ocupantes.
 * - Misto: cada unidade com subsídio paga o subsídio (dividido entre os seus ocupantes);
 *   o saldo (valor − subsídios) é dividido pelos ocupantes que entram no rateio
 *   (unidades sem subsídio, ou com subsídio e "entra no rateio" marcado).
 * Os centavos de arredondamento ficam no último ocupante, para o total fechar exato.
 */
export function shareContract(
  model: "FECHADO" | "MISTO",
  monthlyValue: number,
  occupants: Occupant[],
  subsidies: SubsidyRule[] = [],
): ContractShareResult {
  const perOccupant = new Map<string, number>();
  occupants.forEach((o) => perOccupant.set(o.key, 0));
  const unallocatedSubsidies: { unitId: string; amount: number }[] = [];
  let remainder = monthlyValue;

  const rules = model === "MISTO" ? subsidies : [];
  const subsidized = new Map<string, SubsidyRule>();
  for (const s of rules) {
    const amount = s.type === "VALOR" ? s.value : (monthlyValue * s.value) / 100;
    subsidized.set(s.unitId, s);
    remainder -= amount;
    const own = occupants.filter((o) => o.unitId === s.unitId);
    if (own.length === 0) {
      unallocatedSubsidies.push({ unitId: s.unitId, amount: round2(amount) });
    } else {
      distribute(amount, own, perOccupant);
    }
  }

  const base = occupants.filter((o) => {
    const s = subsidized.get(o.unitId);
    return !s || s.joinsRateio;
  });
  let unallocatedRemainder = 0;
  if (base.length > 0) distribute(remainder, base, perOccupant);
  else unallocatedRemainder = round2(remainder);

  return { perOccupant, unallocatedSubsidies, unallocatedRemainder };
}

function distribute(amount: number, people: Occupant[], acc: Map<string, number>) {
  const each = round2(amount / people.length);
  let given = 0;
  people.forEach((p, i) => {
    const part = i === people.length - 1 ? round2(amount - given) : each;
    given = round2(given + part);
    acc.set(p.key, round2((acc.get(p.key) ?? 0) + part));
  });
}

/** Normaliza chapa para comparar com planilhas que perderam os zeros à esquerda. */
export function chapaKey(v: unknown) {
  const s = String(v ?? "").trim();
  const stripped = s.replace(/^0+/, "");
  return stripped === "" ? (s ? "0" : "") : stripped;
}
