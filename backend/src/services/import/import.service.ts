import { AppError } from "../../utils/errors.js";
import { detectDocumentKind } from "./fileDetection.js";
import { parseDocx, parsePdf, parsePlainText, parseSpreadsheet, type SheetData } from "./parsers.js";
import { extractQuestions } from "./questionExtractor.js";
import { detectHeaderMapping, extractFromTable, guessQuestionColumn } from "./tableExtractor.js";
import type { ColumnMapping, ExtractionResult, ImportPreview, TablePreview } from "./types.js";

const MAX_PREVIEW_ROWS = 1500;
const MIN_PDF_CHARACTERS = 20;

function noQuestions(): AppError {
  return new AppError(
    "NO_QUESTIONS_DETECTED",
    "No questions were detected in this document. Check that questions are numbered (e.g. “1.” or “1-”) or end with “?”, or add them manually.",
  );
}

function tablesPreview(sheets: SheetData[]): TablePreview[] {
  return sheets.slice(0, 10).map((s) => {
    const header = detectHeaderMapping(s.rows);
    const guessed = header ? null : guessQuestionColumn(s.rows);
    return {
      sheetName: s.sheetName,
      rows: s.rows.slice(0, MAX_PREVIEW_ROWS),
      hasHeader: !!header,
      mapping: header ? header.mapping : guessed !== null ? { question: guessed } : null,
      guessed: !header,
      truncated: s.rows.length > MAX_PREVIEW_ROWS,
    };
  });
}

function extractFromSheets(tables: TablePreview[]): ExtractionResult {
  const withHeader = tables.filter((t) => t.hasHeader && t.mapping);
  const warnings: string[] = [];
  let used: TablePreview[];

  if (withHeader.length > 0) {
    used = withHeader;
  } else {
    const first = tables.find((t) => t.mapping);
    if (!first) return { questions: [], warnings, documentTitle: null };
    used = [first];
    warnings.push(
      `No header row was found in “${first.sheetName}”. The question column was guessed — check the column mapping before importing.`,
    );
  }

  const multi = used.length > 1;
  const result: ExtractionResult = { questions: [], warnings, documentTitle: null };
  for (const t of used) {
    const r = extractFromTable(t.rows, t.mapping!, t.hasHeader, { defaultCategory: multi ? t.sheetName : undefined });
    result.questions.push(...r.questions);
    result.warnings.push(...r.warnings);
    if (t.truncated) result.warnings.push(`Sheet “${t.sheetName}” was truncated to ${MAX_PREVIEW_ROWS} rows.`);
  }
  if (multi) result.warnings.push(`Questions were combined from ${used.length} sheets; sheet names were used as categories.`);
  return result;
}

/**
 * Parses an uploaded document entirely in memory and returns structured
 * question candidates. Nothing is persisted — the caller discards the buffer.
 */
export async function buildImportPreview(file: { originalname: string; size: number; buffer: Buffer }): Promise<ImportPreview> {
  const kind = detectDocumentKind(file.originalname, file.buffer);
  const base = { fileName: file.originalname, fileType: kind, fileSize: file.size };

  if (kind === "xlsx" || kind === "xls" || kind === "csv") {
    const sheets = parseSpreadsheet(file.buffer, kind);
    if (sheets.length === 0) throw new AppError("NO_QUESTIONS_DETECTED", "This spreadsheet is empty.");
    const tables = tablesPreview(sheets);
    const result = extractFromSheets(tables);
    // A single-column CSV of numbered lines reads better through the text extractor.
    if (result.questions.length === 0 && kind === "csv") {
      const text = extractQuestions(sheets[0]!.rows.map((r) => ({ text: r.join(" ") })));
      if (text.questions.length) {
        return { ...base, source: "text", documentTitle: text.documentTitle, detectedQuestions: text.questions, warnings: text.warnings, stats: { linesRead: sheets[0]!.rows.length } };
      }
    }
    if (result.questions.length === 0) {
      // Still return the tables so the administrator can map columns manually.
      return {
        ...base,
        source: "table",
        documentTitle: null,
        detectedQuestions: [],
        warnings: [...result.warnings, "No questions were detected automatically. Choose the question column below."],
        tables,
        stats: { linesRead: sheets.reduce((n, s) => n + s.rows.length, 0) },
      };
    }
    return {
      ...base,
      source: "table",
      documentTitle: null,
      detectedQuestions: result.questions,
      warnings: result.warnings,
      tables,
      stats: { linesRead: sheets.reduce((n, s) => n + s.rows.length, 0) },
    };
  }

  if (kind === "pdf") {
    const pdf = await parsePdf(file.buffer);
    if (pdf.characters < MIN_PDF_CHARACTERS) {
      throw new AppError(
        "NO_TEXT_DETECTED",
        "No machine-readable text was detected in this PDF. Please use a text-based PDF or manually add the questions.",
      );
    }
    const result = extractQuestions(pdf.lines, { stripRepeatedLines: pdf.pages >= 3 });
    if (result.questions.length === 0) throw noQuestions();
    return {
      ...base,
      source: "text",
      documentTitle: result.documentTitle,
      detectedQuestions: result.questions,
      warnings: result.warnings,
      stats: { linesRead: pdf.lines.length, pages: pdf.pages },
    };
  }

  if (kind === "docx") {
    const docx = await parseDocx(file.buffer);
    const result = extractQuestions(docx.lines);
    if (result.questions.length === 0 && docx.tables.length > 0) {
      const tables = tablesPreview(docx.tables.map((rows, i) => ({ sheetName: `Table ${i + 1}`, rows })));
      const fromTables = extractFromSheets(tables);
      if (fromTables.questions.length) {
        return {
          ...base,
          source: "table",
          documentTitle: result.documentTitle,
          detectedQuestions: fromTables.questions,
          warnings: fromTables.warnings,
          tables,
          stats: { linesRead: docx.lines.length },
        };
      }
    }
    if (result.questions.length === 0) {
      if (docx.lines.every((l) => !l.text.trim())) {
        throw new AppError("NO_TEXT_DETECTED", "This Word document does not contain any readable text.");
      }
      throw noQuestions();
    }
    return {
      ...base,
      source: "text",
      documentTitle: result.documentTitle,
      detectedQuestions: result.questions,
      warnings: result.warnings,
      stats: { linesRead: docx.lines.length },
    };
  }

  const lines = parsePlainText(file.buffer);
  const result = extractQuestions(lines);
  if (result.questions.length === 0) throw noQuestions();
  return {
    ...base,
    source: "text",
    documentTitle: result.documentTitle,
    detectedQuestions: result.questions,
    warnings: result.warnings,
    stats: { linesRead: lines.length },
  };
}

/** Re-runs table extraction with an administrator-chosen column mapping. */
export function mapTableColumns(rows: string[][], mapping: ColumnMapping, hasHeader: boolean): ExtractionResult {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  for (const [key, value] of Object.entries(mapping)) {
    if (value !== null && value !== undefined && (value < 0 || value >= width)) {
      throw new AppError("VALIDATION_ERROR", `Column for “${key}” is out of range.`);
    }
  }
  const result = extractFromTable(rows, mapping, hasHeader);
  if (result.questions.length === 0) {
    throw new AppError("NO_QUESTIONS_DETECTED", "The selected column does not contain any questions.");
  }
  return result;
}
