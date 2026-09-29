import { describe, expect, it } from "vitest";
import { detectDocumentKind } from "../src/services/import/fileDetection.js";
import { buildImportPreview } from "../src/services/import/import.service.js";
import { AppError } from "../src/utils/errors.js";
import * as XLSX from "xlsx";

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(code);
    return;
  }
  throw new Error("expected error");
};

describe("file type detection by content", () => {
  it("rejects executables renamed to documents", () => {
    expectCode(() => detectDocumentKind("questions.docx", Buffer.from("MZ\x90\x00\x03")), "UNSUPPORTED_FILE_TYPE");
    expectCode(() => detectDocumentKind("questions.pdf", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 1])), "UNSUPPORTED_FILE_TYPE");
  });
  it("rejects binary content in a .txt", () => {
    expectCode(() => detectDocumentKind("q.txt", Buffer.from([0x00, 0x01, 0x02, 0x03])), "UNSUPPORTED_FILE_TYPE");
  });
  it("rejects unsupported extensions", () => {
    expectCode(() => detectDocumentKind("evil.exe", Buffer.from("hello")), "UNSUPPORTED_FILE_TYPE");
    expectCode(() => detectDocumentKind("notes.doc", Buffer.from("hello")), "UNSUPPORTED_FILE_TYPE");
  });
  it("rejects a mismatched extension", () => {
    expectCode(() => detectDocumentKind("questions.xlsx", Buffer.from("plain text")), "UNSUPPORTED_FILE_TYPE");
  });
  it("accepts matching signatures", () => {
    expect(detectDocumentKind("a.pdf", Buffer.from("%PDF-1.7\n"))).toBe("pdf");
    expect(detectDocumentKind("a.docx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]))).toBe("docx");
    expect(detectDocumentKind("a.txt", Buffer.from("1. Question?\n"))).toBe("txt");
  });
});

describe("end-to-end preview (in memory)", () => {
  it("parses a .txt document", async () => {
    const buf = Buffer.from("FIB Questions\n1- What is FIB?\n2- Who are your deputies? (ask why)\n");
    const p = await buildImportPreview({ originalname: "fib.txt", size: buf.length, buffer: buf });
    expect(p.detectedQuestions).toHaveLength(2);
    expect(p.detectedQuestions[1]!.followUpPrompts).toEqual(["Ask why."]);
  });

  it("parses an .xlsx workbook", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Question", "Answer"],
        ["What is RDM?", "Random deathmatch"],
        ["What is VDM?", ""],
      ]),
      "Admin",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const p = await buildImportPreview({ originalname: "admin.xlsx", size: buf.length, buffer: buf });
    expect(p.source).toBe("table");
    expect(p.detectedQuestions.map((q) => q.questionText)).toEqual(["What is RDM?", "What is VDM?"]);
    expect(p.detectedQuestions[0]!.expectedAnswer).toBe("Random deathmatch");
  });

  it("parses a .csv file", async () => {
    const buf = Buffer.from("Question,Category\nWhat is Fail RP?,Rules\nWhat is Fear RP?,Rules\n");
    const p = await buildImportPreview({ originalname: "q.csv", size: buf.length, buffer: buf });
    expect(p.detectedQuestions).toHaveLength(2);
    expect(p.detectedQuestions[0]!.category).toBe("Rules");
  });

  it("reports when no questions are found", async () => {
    const buf = Buffer.from("Just some notes\nwithout questions\n");
    await expect(buildImportPreview({ originalname: "n.txt", size: buf.length, buffer: buf })).rejects.toMatchObject({
      code: "NO_QUESTIONS_DETECTED",
    });
  });
});
