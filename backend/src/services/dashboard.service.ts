import { Types } from "mongoose";
import { Interview, type IInterview } from "../models/Interview.js";
import { QuestionSet } from "../models/QuestionSet.js";
import { conductableInterviewTypes, manageableQuestionTypes, type Principal } from "./authorization.service.js";
import { interviewVisibilityFilter, myActiveInterviews, serializeInterviewSummary } from "./interview.service.js";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getDashboard(principal: Principal) {
  const base = { deletedAt: null, ...interviewVisibilityFilter(principal) };
  const mineFilter = { deletedAt: null, interviewer: new Types.ObjectId(principal.id) };
  const types = [...new Set([...conductableInterviewTypes(principal), ...manageableQuestionTypes(principal)])];

  const [statusCounts, today, mineCounts, recent, active, setCount] = await Promise.all([
    Interview.aggregate<{ _id: string; n: number }>([{ $match: base }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Interview.countDocuments({ ...base, interviewDate: { $gte: startOfToday() } }),
    Interview.aggregate<{ _id: string; n: number }>([{ $match: mineFilter }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Interview.find(base)
      .sort({ updatedAt: -1 })
      .limit(8)
      .select("-questions.expectedAnswer -questions.guidance -questions.followUpPrompts -questions.interviewerNotes")
      .lean(),
    myActiveInterviews(principal),
    types.length ? QuestionSet.countDocuments({ interviewType: { $in: types }, active: true }) : Promise.resolve(0),
  ]);

  const by = (rows: { _id: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r._id, r.n])) as Record<string, number>;
  const s = by(statusCounts);
  const m = by(mineCounts);

  return {
    stats: {
      interviewsToday: today,
      completed: (s.PASSED ?? 0) + (s.FAILED ?? 0),
      passed: s.PASSED ?? 0,
      failed: s.FAILED ?? 0,
      onHold: s.ON_HOLD ?? 0,
      inProgress: s.IN_PROGRESS ?? 0,
      cancelled: s.CANCELLED ?? 0,
      total: Object.values(s).reduce((a, b) => a + b, 0),
      availableQuestionSets: setCount,
    },
    mine: {
      total: Object.values(m).reduce((a, b) => a + b, 0),
      passed: m.PASSED ?? 0,
      failed: m.FAILED ?? 0,
      inProgress: m.IN_PROGRESS ?? 0,
    },
    recentInterviews: recent.map((i) => serializeInterviewSummary(i as IInterview & { _id: Types.ObjectId })),
    activeInterviews: active,
  };
}
