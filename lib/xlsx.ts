import "server-only";
import ExcelJS from "exceljs";

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  /** text = chapa/cartão (preserva zeros); money; date (YYYY-MM-DD → data); int */
  type?: "text" | "money" | "date" | "int" | "number";
}
export interface SheetSpec {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
  totals?: string[]; // chaves somadas na última linha
}

const PETROL = "FF0B5563";

export async function buildWorkbook(sheets: SheetSpec[], meta: { title: string; by: string }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = `Central de Benefícios (${meta.by})`;
  wb.created = new Date();
  wb.title = meta.title;

  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.slice(0, 31).replace(/[\\/?*[\]:]/g, " "), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4) }));
    const head = ws.getRow(1);
    head.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PETROL } };
    head.alignment = { vertical: "middle", wrapText: true };
    head.height = 28;

    for (const r of spec.rows) {
      const values: Record<string, unknown> = {};
      for (const c of spec.columns) {
        const v = r[c.key];
        if (c.type === "date" && typeof v === "string" && v) {
          const [y, m, d] = v.slice(0, 10).split("-").map(Number);
          values[c.key] = new Date(Date.UTC(y, m - 1, d));
        } else if ((c.type === "money" || c.type === "number" || c.type === "int") && v !== null && v !== undefined && v !== "") {
          values[c.key] = Number(v);
        } else {
          values[c.key] = v ?? "";
        }
      }
      ws.addRow(values);
    }

    spec.columns.forEach((c, idx) => {
      const col = ws.getColumn(idx + 1);
      col.font = { name: "Arial", size: 10 };
      if (c.type === "text") col.numFmt = "@";
      if (c.type === "money") col.numFmt = '"R$" #,##0.00';
      if (c.type === "date") col.numFmt = "dd/mm/yyyy";
      if (c.type === "int") col.numFmt = "0";
      if (c.type === "number") col.numFmt = "#,##0.00";
    });
    head.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 10 };

    if (spec.totals?.length && spec.rows.length) {
      const last = spec.rows.length + 1;
      const totalRow: Record<string, unknown> = {};
      totalRow[spec.columns[0].key] = "Total";
      for (const k of spec.totals) {
        const idx = spec.columns.findIndex((c) => c.key === k);
        if (idx >= 0) {
          const letter = ws.getColumn(idx + 1).letter;
          totalRow[k] = { formula: `SUM(${letter}2:${letter}${last})` };
        }
      }
      const row = ws.addRow(totalRow);
      row.font = { name: "Arial", bold: true, size: 10 };
      row.border = { top: { style: "thin", color: { argb: PETROL } } };
    }
    if (spec.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Lê a primeira planilha (ou a de nome indicado) como linhas de objetos pelo cabeçalho. */
export async function readSheet(buffer: ArrayBuffer, sheetName?: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) return null;
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => (headers[col] = String(cell.text ?? "").trim()));
  const rows: { row: number; values: Record<string, unknown> }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const values: Record<string, unknown> = {};
    let any = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const cell = row.getCell(col);
      let v: unknown = cell.value;
      if (v && typeof v === "object" && "result" in (v as object)) v = (v as { result: unknown }).result;
      if (v && typeof v === "object" && "richText" in (v as object)) v = cell.text;
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      if (typeof v === "string") v = v.trim();
      if (v !== null && v !== undefined && v !== "") any = true;
      values[h] = v;
    });
    if (any) rows.push({ row: n, values });
  });
  return { sheet: ws.name, headers: headers.filter(Boolean), rows, sheetNames: wb.worksheets.map((w) => w.name) };
}

export async function readWorkbookSheets(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((w) => w.name);
}
