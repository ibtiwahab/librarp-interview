/**
 * OPTIONAL development seed: organizations, sample question sets and questions.
 *
 *   npm run seed:dev            (add missing sample sets)
 *   npm run seed:dev -- --reset (replace sample "Default" sets)
 *
 * Does NOT create any administrator accounts — use `npm run seed:executive`.
 * Refuses to run with NODE_ENV=production unless --force is passed.
 */
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { ORGANIZATIONS } from "../config/organizations.js";
import { QuestionSet } from "../models/QuestionSet.js";
import { Question } from "../models/Question.js";
import { ensureOrganizations } from "../services/organization.service.js";
import { extractQuestions } from "../services/import/questionExtractor.js";
import { normalizeQuestionText } from "../utils/text.js";
import { GENERIC_LEADERSHIP_QUESTIONS, SAMPLE_ADMIN_QUESTIONS, SAMPLE_EMS_TEXT, SAMPLE_FIB_TEXT } from "./sampleData.js";

interface SeedQuestion {
  questionText: string;
  followUpPrompts?: string[];
  expectedAnswer?: string;
  category?: string;
}

function fromDocument(text: string): SeedQuestion[] {
  return extractQuestions(text.split("\n").map((t) => ({ text: t }))).questions.map((q) => ({
    questionText: q.questionText,
    followUpPrompts: q.followUpPrompts,
    expectedAnswer: q.expectedAnswer,
    category: q.category,
  }));
}

async function main() {
  const reset = process.argv.includes("--reset");
  if (env.isProd && !process.argv.includes("--force")) {
    console.error("✖ Refusing to seed sample data in production. Pass --force if you really mean it.");
    process.exit(1);
  }

  await connectDatabase();
  await ensureOrganizations();

  const content: Record<string, SeedQuestion[]> = {
    FIB: fromDocument(SAMPLE_FIB_TEXT),
    EMS: fromDocument(SAMPLE_EMS_TEXT),
    ADMIN_ASSISTANT: SAMPLE_ADMIN_QUESTIONS,
    SERVER_ADMIN: SAMPLE_ADMIN_QUESTIONS,
  };

  for (const org of ORGANIZATIONS) {
    const name = `${org.shortName} ${org.category === "ADMIN" ? "Interview" : "Leadership"} — Default`;
    let set = await QuestionSet.findOne({ organization: org.code, name });
    if (set && !reset) {
      console.log(`• ${name}: exists, skipped`);
      continue;
    }
    if (set) {
      await Question.deleteMany({ questionSet: set._id });
    } else {
      const hasDefault = await QuestionSet.exists({ organization: org.code, isDefault: true });
      set = await QuestionSet.create({
        name,
        description: `Sample ${org.name} question set for development.`,
        interviewType: org.category,
        organization: org.code,
        isDefault: !hasDefault,
        active: true,
      });
    }

    const questions: SeedQuestion[] = content[org.code] ?? GENERIC_LEADERSHIP_QUESTIONS.map((q) => ({ questionText: q }));
    await Question.insertMany(
      questions.map((q, i) => ({
        questionSet: set!._id,
        interviewType: org.category,
        organization: org.code,
        questionText: q.questionText,
        normalizedText: normalizeQuestionText(q.questionText),
        followUpPrompts: q.followUpPrompts ?? [],
        expectedAnswer: q.expectedAnswer ?? "",
        category: q.category ?? "",
        required: true,
        order: i + 1,
        active: true,
      })),
    );
    console.log(`✔ ${name}: ${questions.length} questions`);
  }

  await disconnectDatabase();
  console.log("\nDevelopment seed complete. No administrator accounts were created.");
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
