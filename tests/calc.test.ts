import { test } from "node:test";
import assert from "node:assert/strict";
import { proportionalDays, shareContract, addMonths, addDays, monthBounds, chapaKey, isActiveOn } from "../lib/calc.ts";

test("proporcional: exemplo do documento (16/11/2026 → 13 dias)", () => {
  assert.equal(proportionalDays("2026-11-16", 26), 13);
});

test("proporcional: dia da admissão conta, domingos não", () => {
  // 01/11/2026 é domingo: o mês inteiro tem 25 dias úteis (sem domingos)
  assert.equal(proportionalDays("2026-11-01", 26), 25);
  assert.equal(proportionalDays("2026-11-30", 26), 1); // segunda, último dia
  assert.equal(proportionalDays("2026-11-29", 26), 1); // domingo + segunda
});

test("proporcional: limitado aos dias-base", () => {
  // dezembro/2026 tem 27 dias sem domingo
  assert.equal(proportionalDays("2026-12-01", 26), 26);
});

test("contrato fechado divide pelos assentos ocupados e fecha o total", () => {
  const occ = [
    { key: "a", unitId: "A" },
    { key: "b", unitId: "B" },
    { key: "c", unitId: "C" },
  ];
  const r = shareContract("FECHADO", 1000, occ);
  const total = [...r.perOccupant.values()].reduce((s, v) => s + v, 0);
  assert.equal(Math.round(total * 100) / 100, 1000);
  assert.equal(r.perOccupant.get("a"), 333.33);
  assert.equal(r.perOccupant.get("c"), 333.34);
});

test("misto: exemplo do documento (A 14.000, B 6.000, C 10.000)", () => {
  const occ = [
    ...Array.from({ length: 20 }, (_, i) => ({ key: `a${i}`, unitId: "A" })),
    ...Array.from({ length: 30 }, (_, i) => ({ key: `b${i}`, unitId: "B" })),
    ...Array.from({ length: 50 }, (_, i) => ({ key: `c${i}`, unitId: "C" })),
  ];
  const r = shareContract("MISTO", 30000, occ, [{ unitId: "A", type: "VALOR", value: 10000, joinsRateio: true }]);
  const byUnit = (u: string) =>
    Math.round(occ.filter((o) => o.unitId === u).reduce((s, o) => s + (r.perOccupant.get(o.key) ?? 0), 0) * 100) / 100;
  assert.equal(byUnit("A"), 14000);
  assert.equal(byUnit("B"), 6000);
  assert.equal(byUnit("C"), 10000);
});

test("misto: unidade que subsidia fora do rateio paga só o subsídio", () => {
  const occ = [
    { key: "a", unitId: "A" },
    { key: "b", unitId: "B" },
  ];
  const r = shareContract("MISTO", 1000, occ, [{ unitId: "A", type: "PERCENTUAL", value: 30, joinsRateio: false }]);
  assert.equal(r.perOccupant.get("a"), 300);
  assert.equal(r.perOccupant.get("b"), 700);
});

test("misto: subsídio de unidade sem ocupantes vira linha própria", () => {
  const r = shareContract("MISTO", 1000, [{ key: "b", unitId: "B" }], [{ unitId: "A", type: "VALOR", value: 200, joinsRateio: true }]);
  assert.deepEqual(r.unallocatedSubsidies, [{ unitId: "A", amount: 200 }]);
  assert.equal(r.perOccupant.get("b"), 800);
});

test("datas", () => {
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-01", -1), "2025-12-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.deepEqual(monthBounds("2028-02-01"), { first: "2028-02-01", last: "2028-02-29" });
});

test("chapa sem zeros à esquerda casa com a original", () => {
  assert.equal(chapaKey("001420"), chapaKey(1420));
  assert.equal(chapaKey("000"), "0");
});

test("benefício ativo", () => {
  assert.equal(isActiveOn({ start_date: "2026-11-01", end_date: null }, "2026-11-15"), true);
  assert.equal(isActiveOn({ start_date: "2026-11-01", end_date: "2026-11-10" }, "2026-11-15"), false);
  assert.equal(isActiveOn({ start_date: "2026-11-01", end_date: "2026-10-31" }, "2026-11-01"), false);
});
