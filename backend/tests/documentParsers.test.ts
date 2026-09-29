import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildImportPreview } from "../src/services/import/import.service.js";

/**
 * Real binary fixtures (generated with the `docx` and `pdf-lib` packages) so the
 * DOCX and PDF code paths are exercised end to end, entirely in memory.
 */
const fixture = (name: string) => {
  const buffer = readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));
  return { originalname: name, size: buffer.length, buffer };
};

describe("DOCX import", () => {
  it("recovers Word/Google Docs auto-numbering, headings and nested follow-ups", async () => {
    const p = await buildImportPreview(fixture("ems-autonumbered.docx"));
    expect(p.fileType).toBe("docx");
    expect(p.documentTitle).toBe("EMS Interview Questions");
    expect(p.detectedQuestions.map((q) => q.questionText)).toEqual([
      "What are the primary duties of EMS?",
      "How many deputies you can have?",
      "Who are they?",
      "So what are your plans for EMS?",
      "Can you carry weapons while working as EMS?",
      "Can EMS be corrupt?",
    ]);
    expect(p.detectedQuestions[3]!.followUpPrompts).toEqual(["How will you bring activity can be a follow up."]);
    expect(p.detectedQuestions[4]!.followUpPrompts).toEqual(["Ask which hospital they will run."]);
    expect(p.detectedQuestions[5]!.category).toBe("Server Rules");
  });

  it("handles manually typed '1-' numbering and stand-alone parenthetical lines", async () => {
    const p = await buildImportPreview(fixture("fib-manual.docx"));
    const qs = p.detectedQuestions;
    expect(qs).toHaveLength(4);
    expect(qs[2]!.questionText).toBe("How much time do you have to arrest someone?");
    expect(qs[2]!.followUpPrompts).toEqual(["If he says 30 mins ask is there any exception for this."]);
    expect(qs[3]!.expectedAnswer).toBe("No org cars can't be used for personal reasons.");
    expect(p.warnings.some((w) => w.includes("jumps from 2 to 25"))).toBe(true);
  });
});

describe("PDF import", () => {
  it("extracts text, joins wrapped lines, drops page numbers and splits follow-ups", async () => {
    const p = await buildImportPreview(fixture("fib-text.pdf"));
    expect(p.fileType).toBe("pdf");
    expect(p.stats.pages).toBe(1);
    const qs = p.detectedQuestions;
    expect(qs).toHaveLength(4);
    expect(qs[1]!.questionText).toBe(
      "Let's suppose you are patrolling outside the city and you see a gang robbing someone or your own unit. Can you start shooting at them?",
    );
    expect(qs[2]!.questionText).toBe("Can you cuff someone while holding a weapon?");
    expect(qs[2]!.followUpPrompts).toEqual(["If yes what weapons."]);
  });

  it("refuses image-only (scanned) PDFs with a clear message instead of garbage", async () => {
    await expect(buildImportPreview(fixture("scanned.pdf"))).rejects.toMatchObject({
      code: "NO_TEXT_DETECTED",
      message: "No machine-readable text was detected in this PDF. Please use a text-based PDF or manually add the questions.",
    });
  });
});
