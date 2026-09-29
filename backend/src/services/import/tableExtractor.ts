import { randomUUID } from "node:crypto";
import { cleanWhitespace, normalizeQuestionText } from "../../utils/text.js";
import { MAX_QUESTIONS, formatPrompt, parseNumbered, splitTrailingParentheticals, classifyParenthetical } from "./questionExtractor.js";
import type { ColumnMapping, DetectedQuestion, ExtractionResult } from "./types.js";

type MappingKey = keyof ColumnMapping;

const HEADER_SYNONYMS: Record<MappingKey, RegExp> = {
  question: /^(?:questions?|question\s*text|interview\s*questions?|q)$/i,
  expectedAnswer: /^(?:answers?|expected\s*answers?|correct\s*answers?|model\s*answers?|reference|ans)$/i,
  followUp: /^(?:follow[\s-]?ups?|follow[\s-]?up\s*(?:questions?|prompts?)|probes?)$/i,
  category: /^(?:category|categories|section|topic|group)$/i,
  required: /^(?:required|mandatory|optional\??)$/i,
  order: /^(?:order|#|no\.?|number|num|position|sequence|seq)$/i,
  notes: /^(?:notes?|interviewer\s*notes?|guidance|comments?)$/i,
};

function cell(row: string[] | undefined, index: number | null | undefined): string {
  if (!row || index === null || index === undefined || index < 0) return "";
  return cleanWhitespace(String(row[index] ?? ""));
}

function firstNonEmptyRowIndex(rows: string[][]): number {
  return rows.findIndex((r) => r.some((c) => cleanWhitespace(String(c ?? "")) !== ""));
}

/** Reads a header row. Returns a mapping when a question column is identified. */
export function detectHeaderMapping(rows: string[][]): { headerIndex: number; mapping: ColumnMapping } | null {
  const headerIndex = firstNonEmptyRowIndex(rows);
  if (headerIndex < 0) return null;
  const header = rows[headerIndex]!.map((c) => cleanWhitespace(String(c ?? "")).replace(/[:*]$/, ""));
  const found: Partial<Record<MappingKey, number>> = {};
  header.forEach((h, i) => {
    for (const key of Object.keys(HEADER_SYNONYMS) as MappingKey[]) {
      if (found[key] === undefined && HEADER_SYNONYMS[key].test(h)) {
        found[key] = i;
        break;
      }
    }
  });
  if (found.question === undefined) return null;
  return {
    headerIndex,
    mapping: {
      question: found.question,
      expectedAnswer: found.expectedAnswer ?? null,
      followUp: found.followUp ?? null,
      category: found.category ?? null,
      required: found.required ?? null,
      order: found.order ?? null,
      notes: found.notes ?? null,
    },
  };
}

/** Picks the column that most looks like it holds questions. */
export function guessQuestionColumn(rows: string[][]): number | null {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  let best: { index: number; score: number } | null = null;
  for (let c = 0; c < width; c++) {
    let filled = 0;
    let questionMarks = 0;
    let totalLength = 0;
    for (const row of rows) {
      const v = cell(row, c);
      if (!v) continue;
      filled++;
      totalLength += v.length;
      if (v.includes("?")) questionMarks++;
    }
    if (filled === 0) continue;
    const avg = totalLength / filled;
    // Pure numbers (an order column) are never questions.
    const numericShare = rows.filter((r) => /^\d+(?:\.\d+)?$/.test(cell(r, c))).length / filled;
    if (numericShare > 0.8) continue;
    const score = questionMarks * 3 + Math.min(avg, 120) / 10 + filled * 0.2;
    if (!best || score > best.score) best = { index: c, score };
  }
  return best?.index ?? null;
}

function parseRequired(value: string): boolean {
  if (!value) return true;
  return !/^(?:no|n|false|0|optional|opt|not required)$/i.test(value.trim());
}

function splitFollowUps(value: string): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n|;|\|/)
    .map((v) => v.trim().replace(/^[•\-–*]\s*/, "").replace(/^\((.*)\)$/, "$1"))
    .filter(Boolean)
    .map(formatPrompt);
}

export function extractFromTable(
  rows: string[][],
  mapping: ColumnMapping,
  hasHeader: boolean,
  options: { defaultCategory?: string } = {},
): ExtractionResult {
  const warnings: string[] = [];
  const start = hasHeader ? firstNonEmptyRowIndex(rows) + 1 : 0;
  const withOrder: Array<{ q: DetectedQuestion; order: number | null; index: number }> = [];

  for (let r = start; r < rows.length; r++) {
    const row = rows[r]!;
    let raw = cell(row, mapping.question);
    if (!raw) continue;

    let sourceNumber: number | null = null;
    const numbered = parseNumbered(raw);
    if (numbered && numbered.rest) {
      sourceNumber = numbered.number;
      raw = numbered.rest;
    }
    const { main, parentheticals } = splitTrailingParentheticals(raw);

    const q: DetectedQuestion = {
      tempId: randomUUID(),
      questionText: main,
      followUpPrompts: splitFollowUps(cell(row, mapping.followUp)),
      expectedAnswer: cell(row, mapping.expectedAnswer),
      interviewerNotes: cell(row, mapping.notes),
      category: (cell(row, mapping.category) || options.defaultCategory || "").slice(0, 80),
      required: mapping.required === null || mapping.required === undefined ? true : parseRequired(cell(row, mapping.required)),
      sourceNumber,
      confidence: main.includes("?") ? "high" : "medium",
      flags: [],
    };
    for (const p of parentheticals) {
      if (classifyParenthetical(p) === "expectedAnswer") {
        q.expectedAnswer = q.expectedAnswer ? `${q.expectedAnswer} ${formatPrompt(p)}` : formatPrompt(p);
      } else q.followUpPrompts.push(formatPrompt(p));
    }
    if (q.questionText.length < 3) continue;
    if (q.questionText.length > 400) {
      q.confidence = "low";
      q.flags.push("Very long cell — it may contain several questions.");
    }
    const orderRaw = cell(row, mapping.order);
    const order = orderRaw && /^\d+(?:\.\d+)?$/.test(orderRaw) ? Number(orderRaw) : null;
    if (sourceNumber === null && order !== null) q.sourceNumber = order;
    withOrder.push({ q, order, index: withOrder.length });
  }

  if (mapping.order !== null && mapping.order !== undefined && withOrder.some((w) => w.order !== null)) {
    withOrder.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.index - b.index);
  }

  let questions = withOrder.map((w) => w.q);
  if (questions.length > MAX_QUESTIONS) {
    warnings.push(`Only the first ${MAX_QUESTIONS} questions were kept (${questions.length} detected).`);
    questions = questions.slice(0, MAX_QUESTIONS);
  }

  const seen = new Set<string>();
  for (const q of questions) {
    const key = normalizeQuestionText(q.questionText);
    if (seen.has(key)) {
      q.flags.push("Duplicate of another question in this document.");
      q.confidence = "medium";
    } else seen.add(key);
  }

  return { questions, warnings, documentTitle: null };
}
