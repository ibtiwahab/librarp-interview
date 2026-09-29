import mammoth from "mammoth";
import { parse as parseHtml, type HTMLElement, NodeType, type Node } from "node-html-parser";
import * as XLSX from "xlsx";
import { AppError } from "../../utils/errors.js";
import { cleanWhitespace } from "../../utils/text.js";
import { decodeText } from "./fileDetection.js";
import type { SourceLine } from "./types.js";

/* ───────────────────────────── Plain text ─────────────────────────────── */

export function parsePlainText(buf: Buffer): SourceLine[] {
  return decodeText(buf)
    .split(/\r\n|\r|\n/)
    .map((text) => ({ text }));
}

/* ───────────────────────────── DOCX ───────────────────────────────────── */

export interface DocxParseResult {
  lines: SourceLine[];
  tables: string[][][];
}

function elementText(el: HTMLElement): string {
  // Preserve soft line breaks, drop everything else to text.
  const html = el.innerHTML.replace(/<br\s*\/?>/gi, "\n");
  return parseHtml(`<div>${html}</div>`).text;
}

function inlineText(node: HTMLElement): string {
  // Text of an <li> excluding any nested lists.
  const parts: string[] = [];
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.ELEMENT_NODE) {
      const tag = (child as HTMLElement).tagName?.toLowerCase();
      if (tag === "ol" || tag === "ul") continue;
      if (tag === "br") {
        parts.push("\n");
        continue;
      }
      parts.push(elementText(child as HTMLElement));
    } else if (child.nodeType === NodeType.TEXT_NODE) {
      parts.push((child as Node).text);
    }
  }
  return parts.join("");
}

function walkList(list: HTMLElement, depth: number, out: SourceLine[]) {
  const ordered = list.tagName.toLowerCase() === "ol";
  let n = Number(list.getAttribute("start") ?? "1") || 1;
  for (const li of list.childNodes) {
    if (li.nodeType !== NodeType.ELEMENT_NODE || (li as HTMLElement).tagName.toLowerCase() !== "li") continue;
    const item = li as HTMLElement;
    const text = cleanWhitespace(inlineText(item).replace(/\n+/g, " "));
    if (text) {
      if (depth > 0) out.push({ text, kind: "nested" });
      else if (ordered) out.push({ text, kind: "numbered", number: n });
      else out.push({ text, kind: "bullet" });
    }
    if (ordered) n++;
    for (const child of item.childNodes) {
      if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
      const tag = (child as HTMLElement).tagName.toLowerCase();
      if (tag === "ol" || tag === "ul") walkList(child as HTMLElement, depth + 1, out);
    }
  }
}

function tableRows(table: HTMLElement): string[][] {
  return table.querySelectorAll("tr").map((tr) =>
    tr.querySelectorAll("td, th").map((td) => cleanWhitespace(elementText(td).replace(/\n+/g, "\n"))),
  );
}

/**
 * Converts DOCX → HTML with Mammoth so that Word/Google Docs *auto-numbered*
 * lists keep their numbers (raw-text extraction silently drops them).
 */
export async function parseDocx(buf: Buffer): Promise<DocxParseResult> {
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer: buf }, { ignoreEmptyParagraphs: true });
    html = result.value;
  } catch {
    throw new AppError("UNPARSEABLE_FILE", "This Word document could not be read. Make sure it is a valid .docx file (not .doc).");
  }

  const root = parseHtml(html);
  const lines: SourceLine[] = [];
  const tables: string[][][] = [];

  for (const node of root.childNodes) {
    if (node.nodeType !== NodeType.ELEMENT_NODE) {
      const text = node.text.trim();
      if (text) lines.push({ text });
      continue;
    }
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "ol" || tag === "ul") walkList(el, 0, lines);
    else if (/^h[1-6]$/.test(tag)) lines.push({ text: elementText(el), kind: "heading" });
    else if (tag === "table") tables.push(tableRows(el));
    else {
      for (const part of elementText(el).split("\n")) lines.push({ text: part });
    }
  }
  return { lines, tables };
}

/* ───────────────────────────── PDF ────────────────────────────────────── */

export interface PdfParseResult {
  lines: SourceLine[];
  pages: number;
  characters: number;
}

export async function parsePdf(buf: Buffer): Promise<PdfParseResult> {
  const { getDocumentProxy, extractTextItems } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf));
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (/password/i.test(msg)) {
      throw new AppError("UNPARSEABLE_FILE", "This PDF is password-protected. Remove the password and upload it again.");
    }
    throw new AppError("UNPARSEABLE_FILE", "This PDF could not be read. It may be damaged or use an unsupported format.");
  }

  const { items, totalPages } = await extractTextItems(pdf);
  const lines: SourceLine[] = [];
  let characters = 0;

  for (const pageItems of items) {
    // Group text runs into visual lines by their baseline (y), then sort by x.
    const rows: Array<{ y: number; size: number; runs: typeof pageItems }> = [];
    for (const item of pageItems) {
      if (!item.str) continue;
      characters += item.str.replace(/\s/g, "").length;
      const tolerance = Math.max(2, (item.fontSize || 10) * 0.4);
      let row = rows.find((r) => Math.abs(r.y - item.y) <= tolerance);
      if (!row) {
        row = { y: item.y, size: item.fontSize || 10, runs: [] };
        rows.push(row);
      }
      row.runs.push(item);
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.runs.sort((a, b) => a.x - b.x);
      let text = "";
      let lastEnd: number | null = null;
      for (const run of row.runs) {
        const gap = lastEnd === null ? 0 : run.x - lastEnd;
        if (text && gap > row.size * 0.15 && !text.endsWith(" ") && !run.str.startsWith(" ")) text += " ";
        text += run.str;
        lastEnd = run.x + (run.width || 0);
      }
      lines.push({ text });
    }
  }

  return { lines, pages: totalPages, characters };
}

/* ───────────────────────────── Spreadsheets ───────────────────────────── */

export interface SheetData {
  sheetName: string;
  rows: string[][];
}

export function parseSpreadsheet(buf: Buffer, kind: "xlsx" | "xls" | "csv"): SheetData[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook =
      kind === "csv"
        ? XLSX.read(decodeText(buf), { type: "string", raw: true, dense: true })
        : XLSX.read(buf, { type: "buffer", dense: true, cellFormula: false, cellHTML: false });
  } catch {
    throw new AppError("UNPARSEABLE_FILE", "This spreadsheet could not be read. Save it again as .xlsx or .csv and retry.");
  }

  const sheets: SheetData[] = [];
  for (const name of workbook.SheetNames.slice(0, 20)) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: false });
    const clean = rows
      .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").slice(0, 4000)) : []))
      .filter((r) => r.some((c) => c.trim() !== ""));
    if (clean.length) sheets.push({ sheetName: name, rows: clean });
  }
  return sheets;
}
