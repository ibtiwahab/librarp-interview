import { randomUUID } from "node:crypto";
import { capitalizeFirst, cleanWhitespace, ensureTerminalPunctuation, normalizeQuestionText } from "../../utils/text.js";
import type { Confidence, DetectedQuestion, ExtractionResult, SourceLine } from "./types.js";

/**
 * Deterministic interview-question extraction from lines of document text.
 *
 * Handles the formats seen in Libra RP interview documents:
 *   "1. Question"  "1- Question"  "1) Question"  "Q1: Question"  "(1) Question"
 *   trailing "(if he says X ask Y)"        → follow-up prompt
 *   trailing "(No, org cars can't be …)"   → expected answer
 *   standalone "( … )" line after question → follow-up prompt
 *   "Answer: …" / "Follow up: …" / "Notes: …" labelled lines
 *   short heading lines between questions  → category
 *   wrapped lines (PDF)                    → joined to the question
 */

export const MAX_QUESTIONS = 1000;

const NUMBERED_RE =
  /^(?:(?:q|question|no\.?|#)\s*)?(\d{1,3})\s*(?:\.(?!\d)|\)|\]|:(?!\d)|-(?!\d)|–|—)\s*(.*)$/i;
const PAREN_NUMBERED_RE = /^\((\d{1,3})\)\s*(.+)$/;
const BULLET_RE = /^[•●▪◦‣∙·*]\s*(.+)$|^[-–—]\s+(.+)$/;
const PAGE_NOISE_RE = [
  /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i,
  /^[-–—]\s*\d{1,4}\s*[-–—]$/,
  /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?:,?\s+\d{1,2}:\d{2}(?:\s*[ap]m)?)?$/i,
];
const ANSWER_LABEL_RE = /^(?:expected\s+answer|correct\s+answer|answer|ans)\s*[:\-–—]\s*(.+)$/i;
const FOLLOW_UP_LABEL_RE = /^follow[\s-]?ups?(?:\s+questions?)?\s*[:\-–—]\s*(.+)$/i;
const NOTES_LABEL_RE = /^(?:interviewer\s+notes?|notes?|note)\s*[:\-–—]\s*(.+)$/i;
const CATEGORY_LABEL_RE = /^(?:category|section|topic)\s*[:\-–—]\s*(.+)$/i;
const ANSWER_PAREN_RE = /^(?:yes|no|correct|incorrect|true|false|answer|ans|expected(?:\s+answer)?)\b(?:[\s,:.;-]|$)/i;
const INSTRUCTION_RE =
  /\b(?:ask|asks|if|follow[\s-]?ups?|e\.g|etc|mention|should|must|expect(?:ed)?|answer|he|she|they|candidate|check|yes|no|then|probe)\b/i;
const CONTINUATION_TAIL_RE = /(?:[,&/\-–]|\b(?:and|or|the|of|to|a|an|for|in|with|on|at|by|your|you|is|are|be|that|if|when|what|how))$/i;

export function parseNumbered(text: string): { number: number; rest: string } | null {
  const m = NUMBERED_RE.exec(text) ?? PAREN_NUMBERED_RE.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { number: n, rest: (m[2] ?? "").trim() };
}

export function isPageNoise(text: string): boolean {
  return PAGE_NOISE_RE.some((re) => re.test(text));
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function formatPrompt(text: string): string {
  return ensureTerminalPunctuation(capitalizeFirst(cleanWhitespace(text).replace(/^[-–—:;,.\s]+/, "")));
}

/** Splits trailing "(…)" groups off a question line when they are interviewer instructions. */
export function splitTrailingParentheticals(text: string): { main: string; parentheticals: string[] } {
  let main = text.trim();
  const parentheticals: string[] = [];

  while (main.endsWith(")") || /\)[.?!]$/.test(main)) {
    const trimmed = main.replace(/[.?!]$/, "");
    let depth = 0;
    let start = -1;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      const ch = trimmed[i];
      if (ch === ")") depth++;
      else if (ch === "(") {
        depth--;
        if (depth === 0) {
          start = i;
          break;
        }
      }
    }
    if (start <= 0) break;
    const before = trimmed.slice(0, start).trim();
    const inner = trimmed.slice(start + 1, -1).trim();
    if (!inner) {
      main = before;
      continue;
    }
    const beforeIsQuestion = /\?$/.test(before);
    const isInstruction = wordCount(inner) >= 3 && INSTRUCTION_RE.test(inner);
    if (!beforeIsQuestion && !isInstruction) break;
    parentheticals.unshift(inner);
    main = before;
  }
  return { main, parentheticals };
}

export function classifyParenthetical(inner: string): "expectedAnswer" | "followUp" {
  return ANSWER_PAREN_RE.test(inner.trim()) ? "expectedAnswer" : "followUp";
}

function isHeadingLike(text: string): boolean {
  if (text.length > 70 || wordCount(text) > 9) return false;
  if (/[?.!,;]$/.test(text)) return false;
  if (text.startsWith("(")) return false;
  if (/^[a-z]/.test(text)) return false;
  return true;
}

function isContinuation(previous: string, next: string): boolean {
  if (/[?.!:)"”]$/.test(previous.trim())) return false;
  if (/^[a-z]/.test(next)) return true;
  return CONTINUATION_TAIL_RE.test(previous.trim());
}

function appendText(existing: string, addition: string, sep = " "): string {
  return existing ? `${existing}${sep}${addition}` : addition;
}

interface ExtractOptions {
  /** Drop short lines that repeat on many pages (PDF headers/footers). */
  stripRepeatedLines?: boolean;
}

export function extractQuestions(input: SourceLine[], options: ExtractOptions = {}): ExtractionResult {
  const warnings: string[] = [];
  const questions: DetectedQuestion[] = [];

  // ── 1. Normalise lines ──────────────────────────────────────────────────
  let lines: SourceLine[] = [];
  for (const line of input) {
    for (const part of line.text.split(/\r?\n/)) {
      const text = cleanWhitespace(part);
      if (!text || isPageNoise(text)) continue;
      lines.push({ ...line, text });
    }
  }

  if (options.stripRepeatedLines) {
    const counts = new Map<string, number>();
    for (const l of lines) {
      if (l.text.length <= 80 && !parseNumbered(l.text) && !l.text.endsWith("?")) {
        counts.set(l.text.toLowerCase(), (counts.get(l.text.toLowerCase()) ?? 0) + 1);
      }
    }
    const repeated = new Set([...counts].filter(([, n]) => n >= 3).map(([t]) => t));
    if (repeated.size) {
      const before = lines.length;
      lines = lines.filter((l) => !repeated.has(l.text.toLowerCase()));
      warnings.push(`Removed ${before - lines.length} repeated header/footer line(s).`);
    }
  }

  const isNumberedLine = (l: SourceLine) => l.kind === "numbered" || (l.kind !== "nested" && !!parseNumbered(l.text));
  const numberedCount = lines.filter(isNumberedLine).length;
  const questionMarkCount = lines.filter((l) => l.text.includes("?")).length;
  const numberedMode = numberedCount >= 2 || (numberedCount === 1 && questionMarkCount <= 1);

  // ── 2. Walk lines ───────────────────────────────────────────────────────
  // Declared via assertion so TypeScript does not narrow it to `null` across closures.
  let current = null as DetectedQuestion | null;
  let pendingNumber: number | null = null;
  let openParen: string | null = null;
  let category = "";
  const headerLines: string[] = [];
  let notesAttached = 0;

  const attachParenthetical = (inner: string) => {
    if (!current) {
      headerLines.push(`(${inner})`);
      return;
    }
    const cleaned = inner.replace(/^(?:follow[\s-]?up|answer|ans)\s*[:\-–—]\s*/i, "");
    if (classifyParenthetical(inner) === "expectedAnswer") {
      current.expectedAnswer = appendText(current.expectedAnswer, formatPrompt(cleaned));
    } else {
      current.followUpPrompts.push(formatPrompt(cleaned));
    }
  };

  const finalize = () => {
    if (!current) return;
    const q = current;
    current = null;
    q.questionText = cleanWhitespace(q.questionText.replace(/^[•●▪◦‣∙·*\-–—]\s*/, ""));
    if (q.questionText.length < 3) {
      warnings.push(`Ignored an empty or too-short question${q.sourceNumber ? ` (#${q.sourceNumber})` : ""}.`);
      return;
    }
    if (q.questionText.length > 400) {
      q.confidence = "low";
      q.flags.push("Very long — lines may have been merged. Review the wording.");
    }
    questions.push(q);
  };

  const startQuestion = (rawText: string, number: number | null, confidence: Confidence, flags: string[] = []) => {
    finalize();
    const { main, parentheticals } = splitTrailingParentheticals(rawText);
    current = {
      tempId: randomUUID(),
      questionText: main,
      followUpPrompts: [],
      expectedAnswer: "",
      interviewerNotes: "",
      category,
      required: true,
      sourceNumber: number,
      confidence,
      flags: [...flags],
    };
    for (const p of parentheticals) attachParenthetical(p);
  };

  const nextSignificant = (i: number): SourceLine | undefined => lines[i + 1];

  const looksLikeQuestionStart = (l: SourceLine | undefined): boolean => {
    if (!l) return false;
    if (isNumberedLine(l)) return true;
    return !numberedMode && l.text.includes("?");
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const text = line.text;

    // Multi-line parenthetical in progress.
    if (openParen !== null) {
      const closeAt = text.lastIndexOf(")");
      if (closeAt >= 0) {
        attachParenthetical(appendText(openParen, text.slice(0, closeAt)));
        openParen = null;
        const rest = text.slice(closeAt + 1).trim();
        if (rest && current) current.interviewerNotes = appendText(current.interviewerNotes, rest, "\n");
      } else {
        openParen = appendText(openParen, text);
      }
      continue;
    }

    // Stand-alone parenthetical lines belong to the preceding question.
    if (text.startsWith("(") && !PAREN_NUMBERED_RE.test(text)) {
      const full = /^\((.*)\)[.?!]?$/s.exec(text);
      if (full) {
        if (current) attachParenthetical(full[1]!.trim());
        else headerLines.push(text);
        continue;
      }
      if (!text.includes(")") && current) {
        openParen = text.slice(1);
        continue;
      }
    }

    // Labelled lines.
    const answer = ANSWER_LABEL_RE.exec(text);
    if (answer && current) {
      current.expectedAnswer = appendText(current.expectedAnswer, answer[1]!.trim(), "\n");
      continue;
    }
    const followUp = FOLLOW_UP_LABEL_RE.exec(text);
    if (followUp && current) {
      current.followUpPrompts.push(formatPrompt(followUp[1]!));
      continue;
    }
    const notes = NOTES_LABEL_RE.exec(text);
    if (notes && current) {
      current.interviewerNotes = appendText(current.interviewerNotes, notes[1]!.trim(), "\n");
      continue;
    }
    const cat = CATEGORY_LABEL_RE.exec(text);
    if (cat) {
      finalize();
      category = cat[1]!.trim().slice(0, 80);
      continue;
    }

    // Structural hints from DOCX.
    if (line.kind === "heading") {
      if (questions.length === 0 && !current) headerLines.push(text);
      else {
        finalize();
        category = text.replace(/:$/, "").slice(0, 80);
      }
      continue;
    }
    if (line.kind === "nested") {
      if (current) {
        current.followUpPrompts.push(formatPrompt(text));
        continue;
      }
    }

    // Numbered question.
    if (line.kind === "numbered" && line.number !== undefined) {
      const inner = parseNumbered(text);
      // Guard against "1. 1- Question" (manual numbering inside an auto-numbered list).
      const body = inner && inner.rest ? inner.rest : text;
      startQuestion(body, line.number, "high");
      continue;
    }
    const numbered = line.kind === "nested" ? null : parseNumbered(text);
    if (numbered) {
      if (!numbered.rest) {
        finalize();
        pendingNumber = numbered.number;
        continue;
      }
      startQuestion(numbered.rest, numbered.number, "high");
      pendingNumber = null;
      continue;
    }
    if (pendingNumber !== null) {
      startQuestion(text, pendingNumber, "high");
      pendingNumber = null;
      continue;
    }

    // Bullets.
    const bullet = line.kind === "bullet" ? [text, text] : BULLET_RE.exec(text);
    if (bullet) {
      const body = (bullet[1] ?? bullet[2] ?? text).trim();
      if (numberedMode && current) {
        current.followUpPrompts.push(formatPrompt(body));
        continue;
      }
      if (body.includes("?")) {
        startQuestion(body, null, body.endsWith("?") ? "high" : "medium");
        continue;
      }
    }

    // Section headings between questions.
    if (isHeadingLike(text) && looksLikeQuestionStart(nextSignificant(i))) {
      if (questions.length === 0 && !current) headerLines.push(text);
      else {
        finalize();
        category = text.replace(/:$/, "").slice(0, 80);
      }
      continue;
    }

    // Wrapped continuation of the current question.
    if (current && isContinuation(current.questionText, text)) {
      const { main, parentheticals } = splitTrailingParentheticals(`${current.questionText} ${text}`);
      current.questionText = main;
      for (const p of parentheticals) attachParenthetical(p);
      continue;
    }

    if (numberedMode) {
      if (text.endsWith("?")) {
        startQuestion(text, null, "medium", ["Unnumbered line ending with “?” — confirm it is a separate question."]);
        continue;
      }
    } else if (text.includes("?")) {
      startQuestion(text, null, text.endsWith("?") ? "high" : "medium");
      continue;
    }

    if (current) {
      current.interviewerNotes = appendText(current.interviewerNotes, text, "\n");
      if (!current.flags.includes("Extra document text was added to interviewer notes.")) {
        current.flags.push("Extra document text was added to interviewer notes.");
      }
      notesAttached++;
    } else {
      headerLines.push(text);
    }
  }

  if (openParen !== null) attachParenthetical(openParen);
  if (pendingNumber !== null) warnings.push(`Question #${pendingNumber} has a number but no text.`);
  finalize();

  // ── 3. Post-processing ──────────────────────────────────────────────────
  if (questions.length > MAX_QUESTIONS) {
    warnings.push(`Only the first ${MAX_QUESTIONS} questions were kept (${questions.length} detected).`);
    questions.length = MAX_QUESTIONS;
  }

  // Numbering gaps usually mean a question was not recognised.
  let prev: number | null = null;
  for (const q of questions) {
    if (q.sourceNumber === null) continue;
    if (prev !== null) {
      if (q.sourceNumber === prev) {
        warnings.push(`Question number ${prev} appears more than once.`);
      } else if (q.sourceNumber > prev + 1) {
        warnings.push(
          `Numbering jumps from ${prev} to ${q.sourceNumber} — ${q.sourceNumber - prev - 1 === 1 ? "a question" : "questions"} may be missing.`,
        );
      }
    }
    prev = q.sourceNumber;
  }

  // Duplicates inside the same document.
  const seen = new Map<string, DetectedQuestion>();
  for (const q of questions) {
    const key = normalizeQuestionText(q.questionText);
    const first = seen.get(key);
    if (first) {
      q.flags.push("Duplicate of another question in this document.");
      if (q.confidence === "high") q.confidence = "medium";
    } else seen.set(key, q);
  }

  if (headerLines.length > 0 && questions.length > 0) {
    warnings.push(`Skipped ${headerLines.length} line(s) before the first question (treated as the document header).`);
  }
  if (notesAttached > 0) {
    warnings.push(`${notesAttached} unlabelled line(s) were attached to questions as interviewer notes.`);
  }

  const title = headerLines.find((h) => h.length <= 120 && !h.startsWith("(")) ?? null;
  return { questions, warnings, documentTitle: title };
}
