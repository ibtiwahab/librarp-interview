export type SourceLineKind = "plain" | "numbered" | "bullet" | "nested" | "heading";

/** A line of text plus any structural hints the parser could recover. */
export interface SourceLine {
  text: string;
  kind?: SourceLineKind;
  /** Explicit list number (e.g. from DOCX auto-numbering). */
  number?: number;
}

export type Confidence = "high" | "medium" | "low";

export interface DetectedQuestion {
  /** Temporary client-side id (not persisted). */
  tempId: string;
  questionText: string;
  followUpPrompts: string[];
  expectedAnswer: string;
  interviewerNotes: string;
  category: string;
  required: boolean;
  sourceNumber: number | null;
  confidence: Confidence;
  flags: string[];
}

export interface ExtractionResult {
  questions: DetectedQuestion[];
  warnings: string[];
  documentTitle: string | null;
}

export interface ColumnMapping {
  question: number;
  expectedAnswer?: number | null;
  followUp?: number | null;
  category?: number | null;
  required?: number | null;
  order?: number | null;
  notes?: number | null;
}

export interface TablePreview {
  sheetName: string;
  rows: string[][];
  hasHeader: boolean;
  mapping: ColumnMapping | null;
  /** True when the question column was guessed rather than read from a header. */
  guessed: boolean;
  truncated: boolean;
}

export interface ImportPreview {
  fileName: string;
  fileType: string;
  fileSize: number;
  source: "text" | "table";
  documentTitle: string | null;
  detectedQuestions: DetectedQuestion[];
  warnings: string[];
  tables?: TablePreview[];
  stats: {
    linesRead: number;
    pages?: number;
  };
}
