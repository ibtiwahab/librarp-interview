import { describe, expect, it } from "vitest";
import { extractQuestions, parseNumbered, splitTrailingParentheticals } from "../src/services/import/questionExtractor.js";
import { detectHeaderMapping, extractFromTable, guessQuestionColumn } from "../src/services/import/tableExtractor.js";
import { normalizeQuestionText, similarity } from "../src/utils/text.js";
import { SAMPLE_EMS_TEXT, SAMPLE_FIB_TEXT } from "../src/scripts/sampleData.js";

const lines = (text: string) => text.split("\n").map((t) => ({ text: t }));

describe("number prefix parsing", () => {
  it.each([
    ["1. What is FIB?", 1, "What is FIB?"],
    ["25- How much time?", 25, "How much time?"],
    ["37-  How long?", 37, "How long?"],
    ["3) Who are they?", 3, "Who are they?"],
    ["Q4: Plans?", 4, "Plans?"],
    ["Question 12 - Rules?", 12, "Rules?"],
    ["(7) Something?", 7, "Something?"],
    ["10.Can you?", 10, "Can you?"],
  ])("%s", (input, n, rest) => {
    expect(parseNumbered(input)).toEqual({ number: n, rest });
  });

  it("does not treat numbers inside sentences as prefixes", () => {
    expect(parseNumbered("1.5 hours is the limit")).toBeNull();
    expect(parseNumbered("2024 plans for the org")).toBeNull();
    expect(parseNumbered("12:30 is when we meet")).toBeNull();
  });
});

describe("trailing parentheticals", () => {
  it("splits interviewer instructions after a question mark", () => {
    expect(splitTrailingParentheticals("How much time do you have to arrest someone? (if he says 30 mins ask is there any exception for this)")).toEqual({
      main: "How much time do you have to arrest someone?",
      parentheticals: ["if he says 30 mins ask is there any exception for this"],
    });
  });
  it("keeps parentheses that are part of the question", () => {
    expect(splitTrailingParentheticals("What does EMS (Emergency Medical Services) do?").parentheticals).toEqual([]);
    expect(splitTrailingParentheticals("Name the ranks (in order)").parentheticals).toEqual([]);
  });
});

describe("FIB document (dash numbering, parenthetical follow-ups)", () => {
  const result = extractQuestions(lines(SAMPLE_FIB_TEXT));

  it("detects all 55 questions and skips the title", () => {
    expect(result.questions).toHaveLength(55);
    expect(result.documentTitle).toBe("FIB Questions");
    expect(result.questions[0]!.questionText).toBe("What is the primary role of FIB within the state?");
    expect(result.questions[54]!.questionText).toBe("Can you collect evidence through drone?");
  });

  it("keeps source numbering in order without gap warnings", () => {
    expect(result.questions.map((q) => q.sourceNumber)).toEqual(Array.from({ length: 55 }, (_, i) => i + 1));
    expect(result.warnings.some((w) => w.includes("jumps"))).toBe(false);
  });

  it("turns '(if he says 30 mins …)' into a follow-up prompt", () => {
    const q25 = result.questions[24]!;
    expect(q25.questionText).toBe("How much time do you have to arrest someone?");
    expect(q25.followUpPrompts).toEqual(["If he says 30 mins ask is there any exception for this."]);
  });

  it("preserves the plans follow-up on question 4", () => {
    const q4 = result.questions[3]!;
    expect(q4.questionText).toBe("So what are your plans for FIB?");
    expect(q4.followUpPrompts[0]).toMatch(/^How will you bring activity, RP etc can be follow up questions\.$/);
  });

  it("classifies '(No org cars can't …)' as an expected answer", () => {
    const q24 = result.questions[23]!;
    expect(q24.questionText).toBe("Can you use org cars to go and buy something at a flea market?");
    expect(q24.expectedAnswer).toBe("No org cars can't be used for personal reasons.");
    expect(q24.followUpPrompts).toEqual([]);
  });

  it("handles '(If yes what weapons)' and trailing '.' after parentheses", () => {
    expect(result.questions[48]!.followUpPrompts).toEqual(["If yes what weapons."]);
    expect(result.questions[22]!.questionText).toBe("Is there any OOC rule for recording arresting procedures?");
    expect(result.questions[22]!.followUpPrompts[0]).toMatch(/^If he says yes ask him how many hours/);
  });

  it("keeps questions without a question mark", () => {
    expect(result.questions[11]!.questionText).toBe("What is UB? Give me one example");
  });
});

describe("EMS document (dot numbering)", () => {
  const result = extractQuestions(lines(SAMPLE_EMS_TEXT));
  it("detects all 28 questions", () => {
    expect(result.questions).toHaveLength(28);
    expect(result.questions[1]!.questionText).toBe("How many deputies you can have?");
    expect(result.questions[4]!.questionText).toBe("What times are you in city");
  });
});

describe("messier documents", () => {
  it("attaches stand-alone and multi-line parenthetical lines as follow-ups", () => {
    const r = extractQuestions(
      lines(`Interview
1. What are your plans for FIB?
(How will you bring activity, RP etc can be follow up questions)
2. How long do you hold POV?
(if he says 1 day
ask about the exceptions)
3. Final question?`),
    );
    expect(r.questions).toHaveLength(3);
    expect(r.questions[0]!.followUpPrompts).toHaveLength(1);
    expect(r.questions[1]!.followUpPrompts).toEqual(["If he says 1 day ask about the exceptions."]);
  });

  it("joins wrapped PDF lines and strips page numbers", () => {
    const r = extractQuestions(
      lines(`1- Let's suppose you are patrolling outside the city and you see a gang robbing someone or
your own unit. Can you start shooting at them?
Page 2 of 5
2- Can you shoot someone in a safe zone?
3`),
    );
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0]!.questionText).toBe(
      "Let's suppose you are patrolling outside the city and you see a gang robbing someone or your own unit. Can you start shooting at them?",
    );
  });

  it("reads labelled answers, follow-ups and section headings", () => {
    const r = extractQuestions(
      lines(`Leadership
1. Who are your deputies?
Answer: Two deputies approved by the curator
Follow up: Why them?
Server Rules
2. What is Fail RP?`),
    );
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0]!.expectedAnswer).toBe("Two deputies approved by the curator");
    expect(r.questions[0]!.followUpPrompts).toEqual(["Why them?"]);
    expect(r.questions[1]!.category).toBe("Server Rules");
  });

  it("falls back to '?' lines when nothing is numbered", () => {
    const r = extractQuestions(lines(`Welcome to the interview\nWhat is RDM?\nWhat is VDM?\nThanks for coming.`));
    expect(r.questions.map((q) => q.questionText)).toEqual(["What is RDM?", "What is VDM?"]);
  });

  it("warns about numbering gaps and in-file duplicates", () => {
    const r = extractQuestions(lines(`1. A question?\n2. B question?\n4. D question?\n5. A question?`));
    expect(r.warnings.some((w) => w.includes("jumps from 2 to 4"))).toBe(true);
    expect(r.questions[3]!.flags.some((f) => f.includes("Duplicate"))).toBe(true);
  });

  it("returns nothing for text without questions", () => {
    expect(extractQuestions(lines("Just a memo.\nNothing to see here.")).questions).toHaveLength(0);
  });

  it("supports DOCX list structure hints", () => {
    const r = extractQuestions([
      { text: "EMS Interview", kind: "heading" },
      { text: "What are the primary duties of EMS?", kind: "numbered", number: 1 },
      { text: "Ask about patient care", kind: "nested" },
      { text: "Rules", kind: "heading" },
      { text: "Can EMS be corrupt?", kind: "numbered", number: 2 },
    ]);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0]!.followUpPrompts).toEqual(["Ask about patient care."]);
    expect(r.questions[1]!.category).toBe("Rules");
    expect(r.documentTitle).toBe("EMS Interview");
  });
});

describe("spreadsheet extraction", () => {
  it("maps headers and optional columns", () => {
    const rows = [
      ["Order", "Question", "Answer", "Follow Up", "Category", "Required"],
      ["2", "Can EMS be corrupt?", "No", "", "Rules", "yes"],
      ["1", "What are the duties of EMS?", "", "Ask about patients; Ask about hospital", "Basics", "optional"],
    ];
    const header = detectHeaderMapping(rows)!;
    expect(header.mapping.question).toBe(1);
    const r = extractFromTable(rows, header.mapping, true);
    expect(r.questions.map((q) => q.questionText)).toEqual(["What are the duties of EMS?", "Can EMS be corrupt?"]);
    expect(r.questions[0]!.followUpPrompts).toEqual(["Ask about patients.", "Ask about hospital."]);
    expect(r.questions[0]!.required).toBe(false);
    expect(r.questions[1]!.expectedAnswer).toBe("No");
  });

  it("guesses the question column when there is no header", () => {
    const rows = [
      ["1", "What is Fail RP?", "x"],
      ["2", "What is Fear RP?", "y"],
    ];
    expect(detectHeaderMapping(rows)).toBeNull();
    expect(guessQuestionColumn(rows)).toBe(1);
  });
});

describe("duplicate normalisation", () => {
  it("ignores numbering, case and punctuation", () => {
    expect(normalizeQuestionText("25- How much time do you have?")).toBe(normalizeQuestionText("how much time do you have"));
  });
  it("scores near-identical wording as similar", () => {
    const a = normalizeQuestionText("How many deputies can you have?");
    const b = normalizeQuestionText("How many deputies you can have?");
    expect(similarity(a, b)).toBeGreaterThan(0.85);
  });
});
